#!/usr/bin/env node
/**
 * 南関 出馬表ページ 取得 dry-run ＋ opt-in 保存（PR-F1b / PR-F3）
 *
 * 明示 1 URL（出馬表 uma_shosai/{raceID}.do）を低負荷で1回取得し、
 * Shift_JIS→UTF-8 変換 → HTML→parsedResult（direct mapping）→ F2 validator 検証 →
 * stdout/tmp 出力する。**既定は保存なし・クロールなし**。
 *
 * PR-F3（opt-in 保存）:
 * - **既定は dry-run（保存しない）**。`--push`（=`--save`）があるときだけ保存「候補」を作る。
 * - **`--push` だけでは実 PUT しない（保存計画/no-op）**。実 shared PUT は **`--push --execute`** の二段。
 * - 保存先は既存と同一: `nankan/entries/YYYY/MM/YYYY-MM-DD-{VENUE}.json`（1 venue = 1 JSON）。
 * - **record 0埋めは保存しない**（validator が error にする・本スクリプトでも明示ガード）。
 * - `sourceMeta` / coverage を保存 JSON に残す。
 * - **既存ファイルは上書き禁止が既定**。`--force` のときだけ更新（既存 SHA を使う）。
 * - **repository_dispatch しない**（AK/KI import は F4）。**token 値は出さない**。
 *
 * 厳守:
 * - 対象は出馬表（uma_shosai = レース出馬表）。**uma_info（馬単体・全履歴）は対象外＝拒否**。
 * - keiba.go.jp DataRoom は対象外＝拒否。明示 URL のみ・リンクを辿らない・自動巡回しない。
 *
 * CLI 例:
 *   # dry-run（保存なし）
 *   node scripts/nankan/dry-run-fetch-entries-page.mjs --date=2026-06-10 --venue=OOI \
 *     --url=https://www.nankankeiba.com/syousai/2026061020040301.do
 *   # 保存計画のみ（no-op・実 PUT しない）
 *   ... --push
 *   # 実 shared PUT（二段 opt-in・既存は --force 必要）
 *   ... --push --execute [--force]
 *
 * 終了コード: schema/保存ガード error → 1 / 引数不正・スコープ外URL → 2 / 取得失敗 → 3 / OK → 0。
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { convertNankanEntriesHtmlToParsed, isRecordUnsourced } from '../../src/lib/nankan/entries-html-to-parsed.mjs';
import { validateNankanEntriesData } from '../../src/lib/nankan/entries-schema-validator.mjs';
import { NANKAN_VENUE_NAME_BY_CODE } from '../../src/lib/nankan/entries-parser.mjs';

const NANKAN_CODES = Object.keys(NANKAN_VENUE_NAME_BY_CODE);
const UA = 'keiba-data-shared-admin research (contact: apolone_bkm@yahoo.co.jp)';
const L = (s) => process.stderr.write(s + '\n');

// ---- shared 保存（GitHub Contents API・save-entries.mjs と同一契約）----
const TOKEN_ENV = 'GITHUB_TOKEN_KEIBA_DATA_SHARED';
const REPO = `${process.env.GITHUB_REPO_OWNER || 'apol0510'}/keiba-data-shared`;
const BRANCH = 'main';
// 期待 sourceMeta（auto / uma_shosai・record 未取得）。保存条件として照合する。
const EXPECT_SOURCE = Object.freeze({
  sourceType: 'auto', sourcePageType: 'uma_shosai',
  recordSourced: false, missingRecordReason: 'uma_shosai_no_record', recordCoverage: '0%'
});

function parseArgs(argv) {
  const args = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
    else if (a.startsWith('--')) args[a.slice(2)] = true;
  }
  return args;
}

// 出馬表 ID（16桁）= YYYYMMDD + jyo(2) + kai(2) + nichi(2) + R(2) から date / raceNumber を導出
function deriveFromUrl(url) {
  const m = url.match(/\/(?:syousai|uma_shosai)\/(\d{16})\.do/);
  if (!m) return {};
  const id = m[1];
  return {
    date: `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}`,
    raceNumber: parseInt(id.slice(14, 16), 10)
  };
}

function detectCharset(contentType, htmlHead) {
  const ct = (contentType || '').toLowerCase();
  if (/shift_?jis|sjis|x-sjis|windows-31j/.test(ct)) return 'shift_jis';
  if (/utf-?8/.test(ct)) return 'utf-8';
  // meta からの簡易検出（先頭バイト列を latin1 で覗く）
  if (/shift_?jis|sjis/i.test(htmlHead)) return 'shift_jis';
  return 'shift_jis'; // nankankeiba 既定
}

function writeFileSafe(outPath, content) {
  const lowered = outPath.replace(/\\/g, '/');
  if (/(^|\/)(keiba-data-shared)(\/|$)/.test(lowered) || /(^|\/)nankan\/entries(\/|$)/.test(lowered)) {
    throw new Error(`保存先が共有データ領域です。dry-run は tmp/stdout のみ: ${outPath}`);
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, content, 'utf-8');
}

// ---- shared 保存ヘルパー（token 値は絶対に出さない）----

// 保存先 shared path（save-entries.mjs と同一規約）
export function deriveSharedPath(date, venueCode) {
  const year = date.slice(0, 4);
  const month = date.slice(5, 7);
  return `nankan/entries/${year}/${month}/${date}-${venueCode}.json`;
}

// token 取得: env 優先、無ければ gh auth token フォールバック。**値は返すだけでログに出さない**。
function getToken() {
  const env = process.env[TOKEN_ENV] || process.env.GITHUB_TOKEN;
  if (env && env.trim()) return { token: env.trim(), source: 'env' };
  try {
    const out = execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (out) return { token: out, source: 'gh-auth' };
  } catch { /* gh 未ログイン等 */ }
  return { token: null, source: 'none' };
}

// GitHub API エラーから安全な診断のみ（token/body/base64 は含めない）
function formatGithubError(data) {
  const parts = [];
  if (data && typeof data.message === 'string') parts.push(`message: ${data.message}`);
  if (data && typeof data.documentation_url === 'string') parts.push(`doc: ${data.documentation_url}`);
  return parts.length ? ` / ${parts.join(' / ')}` : '';
}

// 既存ファイル確認 GET（read-only）。token があれば SHA を取得。token 値は出さない。
async function checkRemoteExists(sharedPath, token) {
  if (!token) return { checked: false, reason: `${TOKEN_ENV} 未設定/gh 未ログインのため既存確認は execute 時` };
  const url = `https://api.github.com/repos/${REPO}/contents/${sharedPath}?ref=${BRANCH}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': UA } });
    if (res.status === 200) { const d = await res.json().catch(() => ({})); return { checked: true, exists: true, sha: d.sha || null }; }
    if (res.status === 404) return { checked: true, exists: false };
    const d = await res.json().catch(() => ({}));
    return { checked: true, exists: null, status: res.status, reason: `想定外 ${res.status}${formatGithubError(d)}` };
  } catch (e) { return { checked: false, reason: `GET 失敗: ${e.message}` }; }
}

// 保存条件ガード（すべて満たすときだけ保存候補）。reasons[] に不適合理由。
export function evaluateSaveGuards(parsed, v) {
  const reasons = [];
  if (!v.ok) reasons.push(`validator error ${v.errors.length}件（schema PASS でない）`);
  const sm = parsed.sourceMeta || {};
  for (const [k, expected] of Object.entries(EXPECT_SOURCE)) {
    if (sm[k] !== expected) reasons.push(`sourceMeta.${k}=${JSON.stringify(sm[k])} 期待 ${JSON.stringify(expected)}`);
  }
  if (!parsed.date) reasons.push('date が無い');
  if (!parsed.venue) reasons.push('venue が無い');
  if (!parsed.venueCode || !NANKAN_CODES.includes(parsed.venueCode)) reasons.push('venueCode 不正');
  if (parsed.totalRaces !== (parsed.races || []).length) reasons.push('totalRaces != races.length');
  const horses = (parsed.races || []).flatMap(r => r.horses || []);
  if (horses.length === 0) reasons.push('horses が空');
  // record 0埋め（present かつ全0）は絶対に保存しない（mapper は null のはずだが二重ガード）
  const zeroFilled = horses.some(h => {
    const t = h?.record?.total;
    return t && (t.wins + t.seconds + t.thirds + t.unplaced) === 0
      && ['left', 'right', 'venue', 'distance'].every(k => {
        const r = h.record[k]; return r && (r.wins + r.seconds + r.thirds + r.unplaced) === 0;
      });
  });
  if (zeroFilled) reasons.push('record 0埋めが含まれる（0埋め保存は禁止）');
  return { ok: reasons.length === 0, reasons };
}

// 実 PUT（--execute 時のみ呼ぶ）。create / update（force+sha）。token 値は出さない。
async function putToShared(sharedPath, jsonStr, token, sha, venue, totalRaces, date) {
  const url = `https://api.github.com/repos/${REPO}/contents/${sharedPath}`;
  const message = `📋 出走表データ追加(auto/uma_shosai): ${venue} ${totalRaces}レース ${date}`;
  const body = {
    message,
    content: Buffer.from(jsonStr, 'utf-8').toString('base64'),
    branch: BRANCH
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': UA, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, reason: formatGithubError(d) };
  return { ok: true, status: res.status, contentSha: d.content?.sha || null, htmlUrl: d.content?.html_url || null };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    L('使い方: --url=<uma_shosai/syousai URL> --date=YYYY-MM-DD --venue=OOI [--out=tmp/...json]');
    L('  保存（opt-in・二段）: --push（保存計画/no-op） / --push --execute（実 PUT） / --force（既存上書き）');
    process.exit(0);
  }

  // 保存モード（既定: 保存なし dry-run）。--push/--save で保存候補・--execute で実 PUT・--force で上書き。
  const saveMode = !!(args.push || args.save);
  const doExecute = !!args.execute;
  const allowForce = !!args.force;

  const url = args.url ? String(args.url) : null;
  if (!url) { L('❌ --url=<出馬表URL> が必要です（F1b は明示URL）'); process.exit(2); }

  // スコープガード
  let u;
  try { u = new URL(url); } catch { L(`❌ URL 不正: ${url}`); process.exit(2); }
  if (!/(^|\.)nankankeiba\.com$/.test(u.hostname)) { L(`❌ 対象は nankankeiba.com のみ: ${u.hostname}`); process.exit(2); }
  if (/\/uma_info\//.test(u.pathname)) { L('❌ uma_info（馬単体・全履歴）は対象外'); process.exit(2); }
  if (/keiba\.go\.jp/.test(u.hostname)) { L('❌ keiba.go.jp は対象外'); process.exit(2); }
  if (!/\/(syousai|uma_shosai)\//.test(u.pathname)) {
    L(`⚠ 出馬表(syousai/uma_shosai)以外のパス: ${u.pathname}（続行するが想定外）`);
  }

  const venueCode = args.venue ? String(args.venue) : null;
  if (venueCode && !NANKAN_CODES.includes(venueCode)) {
    L(`❌ 未知の南関 venueCode: ${venueCode}（許可: ${NANKAN_CODES.join('/')}）`); process.exit(2);
  }

  // ---- 取得（1回・redirect 追従）----
  let res, buf;
  try {
    res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
    buf = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    L(`❌ 取得失敗: ${e.message}`); process.exit(3);
  }

  const contentType = res.headers.get('content-type') || '';
  const head = buf.slice(0, 1024).toString('latin1');
  const charset = detectCharset(contentType, head);

  let html;
  try {
    html = new TextDecoder(charset).decode(buf);
  } catch (e) {
    L(`❌ デコード失敗(${charset}): ${e.message}`); process.exit(3);
  }

  const derived = deriveFromUrl(url);
  const date = args.date || derived.date || '';
  const venueName = venueCode ? NANKAN_VENUE_NAME_BY_CODE[venueCode] : '';

  // ---- HTML → parsedResult ----
  let parsed;
  try {
    parsed = convertNankanEntriesHtmlToParsed(html, {
      date, venue: venueName, venueCode: venueCode || '',
      category: 'nankan', raceNumber: derived.raceNumber, sourceUrl: url
    });
  } catch (e) {
    L(`❌ HTML→parsedResult 失敗: ${e.message}`); process.exit(3);
  }

  // ---- validator ----
  const v = validateNankanEntriesData(parsed, {
    expect: { date: date || undefined, venueCode: venueCode || undefined, venue: venueName || undefined, category: 'nankan' }
  });
  const recordUnsourced = isRecordUnsourced(parsed);

  // ---- 出力（schema OK のときのみ JSON を出す）----
  const outPath = args.out ? String(args.out) : null;
  let outErr = null;
  if (v.ok) {
    try {
      const json = JSON.stringify(parsed, null, 2);
      if (outPath) writeFileSafe(outPath, json);
      else process.stdout.write(json + '\n');
    } catch (e) { outErr = e.message; }
  }

  // ---- ログ ----
  L('────────────────────────────────────────');
  if (!saveMode) {
    L('[DRY_RUN] 保存しません（stdout/tmp のみ・shared PUT なし・save-entries 非呼出）');
  } else if (!doExecute) {
    L('[SAVE-PLAN] --push（保存計画/no-op）。実 PUT はしません（実行は --push --execute）');
  } else {
    L('[SAVE-EXECUTE] --push --execute（実 shared PUT を試行）。dispatch なし・save-entries 非呼出');
  }
  L(`  url(req)    : ${url}`);
  L(`  url(final)  : ${res.url}`);
  L(`  status      : ${res.status}`);
  L(`  content-type: ${contentType}`);
  L(`  charset     : ${charset}`);
  L(`  size        : ${buf.length} bytes`);
  L(`  date        : ${parsed.date || '-'}`);
  L(`  venue       : ${parsed.venue || '-'} (${parsed.venueCode || '-'})`);
  L(`  raceNumber  : ${parsed.races[0]?.raceNumber ?? '-'}`);
  L(`  raceName    : ${parsed.races[0]?.raceName || '-'}`);
  L(`  horse count : ${v.summary.totalHorses}`);
  L(`  sourceType  : ${v.summary.sourceType ?? '-'}`);
  L(`  recordSourced: ${v.summary.recordSourced}`);
  L(`  record 充足率   : ${v.summary.recordCoverage}${recordUnsourced ? `  ← record optional・未取得(${v.summary.missingRecordReason ?? 'unsourced'})・0埋めしない` : ''}`);
  L(`  recentRaces 充足率: ${v.summary.recentRacesCoverage}`);
  L(`  schema warn : ${v.warnings.length}件`);
  L(`  output      : ${outErr ? `❌ ${outErr}` : (outPath || 'stdout')}`);
  L(`  schema      : ${v.ok ? '✅ OK' : `❌ ${v.errors.length}件 error`}`);
  if (!v.ok) v.errors.slice(0, 20).forEach(e => L(`     - [error] ${e}`));
  if (v.warnings.length) v.warnings.slice(0, 6).forEach(e => L(`     - [warn]  ${e}`));

  if (outErr) process.exit(1);

  // ---- 保存（opt-in・既定は実行しない）----
  if (!saveMode) process.exit(v.ok ? 0 : 1);

  // 保存ガード
  const guard = evaluateSaveGuards(parsed, v);
  const sharedPath = (parsed.date && parsed.venueCode) ? deriveSharedPath(parsed.date, parsed.venueCode) : null;
  const jsonStr = JSON.stringify(parsed, null, 2);

  L('  ── 保存ガード ──');
  L(`  shared path : ${sharedPath || '(date/venueCode 不足で算出不可)'}`);
  L(`  bytes       : ${Buffer.byteLength(jsonStr, 'utf-8')}`);
  L(`  guard       : ${guard.ok ? '✅ PASS' : `❌ ${guard.reasons.length}件`}`);
  if (!guard.ok) { guard.reasons.forEach(r => L(`     - ${r}`)); L('  → 保存しません（ガード不適合）'); process.exit(1); }
  if (!sharedPath) { L('  → 保存しません（path 算出不可）'); process.exit(1); }

  // token（値は出さない・有無のみ）。既存確認 GET は read-only。
  const { token, source: tokenSource } = getToken();
  L(`  token       : ${token ? `あり(${tokenSource})` : 'なし'}`);

  const remote = await checkRemoteExists(sharedPath, token);
  if (remote.checked && remote.exists === true) {
    L(`  既存ファイル : あり（sha 取得済: ${remote.sha ? 'yes' : 'no'}）`);
    if (!allowForce) {
      L('  → 保存しません（既存あり・create-only。上書きは --force）');
      process.exit(1);
    }
    L('  上書き      : --force 指定あり（update 予定）');
  } else if (remote.checked && remote.exists === false) {
    L('  既存ファイル : なし（新規 create 予定）');
  } else {
    L(`  既存ファイル : 未確認（${remote.reason || '不明'}）`);
  }

  // no-op（--push のみ）: ここまでで停止。実 PUT しない。
  if (!doExecute) {
    L('  → 保存計画のみ（no-op）。実 PUT は --push --execute。');
    process.exit(0);
  }

  // execute: token 必須
  if (!token) {
    L('  → 保存しません（token 未設定/gh 未ログイン）。実 PUT には token が必要。');
    process.exit(1);
  }
  if (remote.exists === true && !allowForce) {
    L('  → 保存しません（既存あり・--force なし）');
    process.exit(1);
  }
  const put = await putToShared(sharedPath, jsonStr, token, allowForce ? remote.sha : null, parsed.venue, parsed.totalRaces, parsed.date);
  if (!put.ok) {
    L(`  PUT         : ❌ status ${put.status}${put.reason || ''}`);
    process.exit(1);
  }
  L(`  PUT         : ✅ status ${put.status} / content sha ${put.contentSha || '-'}`);
  L(`  url         : ${put.htmlUrl || '-'}`);
  process.exit(0);
}

// 直接実行時のみ main を起動（import 時は export だけ使えるようにする）
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
