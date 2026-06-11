#!/usr/bin/env node
/**
 * 南関 entries 全レース集約 dry-run ＋ opt-in 保存（PR-F3b / PR-F3c）
 *
 * 1 venue = 全レース入り parsedResult を作るための **集約**。既定は dry-run（保存なし）。
 * docs/nankan-horse-detail-display-plan.md §29「1会場=全レース集約契約」に準拠する。
 *
 * 入力（どちらか）:
 *   - 推奨: `--program-url="https://www.nankankeiba.com/program/{14桁}.do"`
 *           → program HTML から `syousai/{16桁}.do` を列挙し、raceNumber 昇順に取得。
 *   - fallback: `--urls=tmp/urls.txt`（明示 race URL を1行1件・空行/`#`コメント無視）。
 *   - `--date --venue` 単独からの URL 自動解決は **しない**（kai2/nichi2 が確定不能・契約§29.2）。
 *
 * 処理:
 *   各 race URL を低負荷で順次取得 → Shift_JIS→UTF-8 → 既存 mapper で parsedResult(totalRaces=1) →
 *   venue 単位 parsedResult に集約 → F2 validator 検証 → dry-run summary。
 *
 * opt-in 保存（PR-F3c・二段）:
 *   - **既定は dry-run（保存しない）**。`--push`（=`--save`）で保存「計画」を作る。
 *   - **`--push` だけでは token を読まない・GitHub GET/PUT しない**（計画/no-op）。
 *     実 shared PUT は **`--push --execute`** の二段目でのみ。
 *   - 保存対象は **full venue JSON のみ**（`totalRaces>1` / `races.length>1` /
 *     `sourceMeta.races.length===races.length`）。**R01-only / partial / `--max` 取得は保存しない**。
 *   - 保存先は既存と同一: `nankan/entries/YYYY/MM/YYYY-MM-DD-{VENUE}.json`（1 venue = 1 JSON）。
 *   - **既存ファイルは create-only が既定**。`--force` のときだけ update（既存 SHA を使う）。
 *     既存が R01-only（totalRaces=1）なら、full venue で置換するため `--force` 必須・summary に明示。
 *   - **record 0埋めは保存しない**（mapper は null・本スクリプトでも二重ガード）。
 *   - **repository_dispatch しない**（AK/KI import は F4）。**token 値は出さない**。
 *   - 既存 single race 保存スクリプト（dry-run-fetch-entries-page.mjs）は変更しない（self-contained）。
 *
 * 厳守:
 *   - 対象は出馬表（syousai/uma_shosai）と program のみ。
 *     **uma_info（馬単体・全履歴）/ keiba.go.jp DataRoom は対象外＝拒否**。
 *   - 明示 URL / program 列挙のみ。サイト全体をクロールしない・リンクを辿らない。
 *   - featureScores / AI指数 / 印 / 買い目 / 穴馬 に接続しない。
 *
 * 終了コード: validator/集約/保存ガード error → 1 / 引数不正・スコープ外 → 2 / 取得失敗 → 3 / OK → 0。
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { convertNankanEntriesHtmlToParsed } from '../../src/lib/nankan/entries-html-to-parsed.mjs';
import { validateNankanEntriesData, summarizeNankanEntriesData } from '../../src/lib/nankan/entries-schema-validator.mjs';
import { NANKAN_VENUE_NAME_BY_CODE } from '../../src/lib/nankan/entries-parser.mjs';

const NANKAN_CODES = Object.keys(NANKAN_VENUE_NAME_BY_CODE); // ['OOI','KAW','FUN','URA']
const UA = 'keiba-data-shared-admin research (contact: apolone_bkm@yahoo.co.jp)';
const L = (s) => process.stderr.write(s + '\n');
const FETCH_INTERVAL_MS = 1200; // 低負荷のため race 取得間に挟む小さな待ち

// jyo2（program/race ID の 9-10 桁目）→ venueCode の最良努力クロスチェック。
// venueCode の正は `--venue`。この map は不一致時に warning を出すためだけに使う。
const JYO2_TO_VENUE = { '20': 'OOI', '21': 'KAW', '19': 'FUN', '18': 'URA' };

// ---- shared 保存（GitHub Contents API・save-entries.mjs / F3 single race と同一契約）----
// 既存 single race スクリプトのファイルは変更せず、契約値だけ self-contained に複製する。
const TOKEN_ENV = 'GITHUB_TOKEN_KEIBA_DATA_SHARED';
const REPO = `${process.env.GITHUB_REPO_OWNER || 'apol0510'}/keiba-data-shared`;
const BRANCH = 'main';
// 期待 sourceMeta（auto / uma_shosai・record 未取得）。保存条件として照合する（F3 と同一）。
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 16桁 race ID = YYYYMMDD + jyo(2) + kai(2) + nichi(2) + R(2)
function deriveFromRaceId(id16) {
  return {
    date: `${id16.slice(0, 4)}-${id16.slice(4, 6)}-${id16.slice(6, 8)}`,
    jyo2: id16.slice(8, 10),
    kai2: id16.slice(10, 12),
    nichi2: id16.slice(12, 14),
    raceNumber: parseInt(id16.slice(14, 16), 10)
  };
}

// 14桁 program ID = YYYYMMDD + jyo(2) + kai(2) + nichi(2)
function deriveFromProgramId(id14) {
  return {
    date: `${id14.slice(0, 4)}-${id14.slice(4, 6)}-${id14.slice(6, 8)}`,
    jyo2: id14.slice(8, 10),
    kai2: id14.slice(10, 12),
    nichi2: id14.slice(12, 14)
  };
}

function detectCharset(contentType, htmlHead) {
  const ct = (contentType || '').toLowerCase();
  if (/shift_?jis|sjis|x-sjis|windows-31j/.test(ct)) return 'shift_jis';
  if (/utf-?8/.test(ct)) return 'utf-8';
  if (/shift_?jis|sjis/i.test(htmlHead)) return 'shift_jis';
  return 'shift_jis'; // nankankeiba 既定
}

// スコープガード（取得対象 URL の検証）。許可: nankankeiba の syousai/uma_shosai/program。
function assertRaceUrlScope(url) {
  let u;
  try { u = new URL(url); } catch { return `URL 不正: ${url}`; }
  if (!/(^|\.)nankankeiba\.com$/.test(u.hostname)) return `対象は nankankeiba.com のみ: ${u.hostname}`;
  if (/keiba\.go\.jp/.test(u.hostname)) return 'keiba.go.jp は対象外';
  if (/\/uma_info\//.test(u.pathname)) return 'uma_info（馬単体・全履歴）は対象外';
  if (!/\/(syousai|uma_shosai)\/\d{16}\.do/.test(u.pathname)) return `出馬表(syousai/uma_shosai/{16桁})でない: ${u.pathname}`;
  return null;
}

// 1 URL を取得して UTF-8 HTML にする（redirect 追従）。
async function fetchHtml(url) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'text/html' } });
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') || '';
  const charset = detectCharset(contentType, buf.slice(0, 1024).toString('latin1'));
  const html = new TextDecoder(charset).decode(buf);
  return { res, buf, html, contentType, charset };
}

// program HTML から syousai/{16桁}.do を列挙（重複除去・raceNumber 昇順）。
function extractRaceUrlsFromProgram(html, origin) {
  const ids = [...html.matchAll(/\/syousai\/(\d{16})\.do/g)].map((m) => m[1]);
  const uniq = [...new Set(ids)];
  uniq.sort((a, b) => deriveFromRaceId(a).raceNumber - deriveFromRaceId(b).raceNumber);
  return uniq.map((id) => `${origin}/syousai/${id}.do`);
}

// --urls ファイル読み込み（空行・# コメント無視）。
function readUrlsFile(path) {
  const lines = readFileSync(path, 'utf-8').split(/\r?\n/);
  return lines.map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

// dry-run 出力（shared 領域への書き込みは拒否）。
function writeFileSafe(outPath, content) {
  const lowered = outPath.replace(/\\/g, '/');
  if (/(^|\/)(keiba-data-shared)(\/|$)/.test(lowered) || /(^|\/)nankan\/entries(\/|$)/.test(lowered)) {
    throw new Error(`保存先が共有データ領域です。dry-run は tmp/stdout のみ: ${outPath}`);
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, content, 'utf-8');
}

// ---- shared 保存ヘルパー（token 値は絶対に出さない・F3 single race と同一契約）----

// 保存先 shared path（save-entries.mjs / F3 と同一規約）。
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

// GitHub API エラーから安全な診断のみ（token/body/base64 は含めない）。
function formatGithubError(data) {
  const parts = [];
  if (data && typeof data.message === 'string') parts.push(`message: ${data.message}`);
  if (data && typeof data.documentation_url === 'string') parts.push(`doc: ${data.documentation_url}`);
  return parts.length ? ` / ${parts.join(' / ')}` : '';
}

// 既存ファイル確認 GET（read-only）。SHA と、既存の totalRaces / sourcePageType（R01-only 判定用）を返す。token 値は出さない。
async function checkRemoteExists(sharedPath, token) {
  if (!token) return { checked: false, reason: `${TOKEN_ENV} 未設定/gh 未ログインのため既存確認できず` };
  const url = `https://api.github.com/repos/${REPO}/contents/${sharedPath}?ref=${BRANCH}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': UA } });
    if (res.status === 200) {
      const d = await res.json().catch(() => ({}));
      let remoteTotalRaces = null, remoteSourcePageType = null;
      try {
        if (d.content && d.encoding === 'base64') {
          const j = JSON.parse(Buffer.from(d.content, 'base64').toString('utf-8'));
          remoteTotalRaces = (typeof j.totalRaces === 'number') ? j.totalRaces : (Array.isArray(j.races) ? j.races.length : null);
          remoteSourcePageType = j.sourceMeta?.sourcePageType ?? null;
        }
      } catch { /* 既存が JSON でない等は判定不可として握りつぶす */ }
      return { checked: true, exists: true, sha: d.sha || null, remoteTotalRaces, remoteSourcePageType };
    }
    if (res.status === 404) return { checked: true, exists: false };
    const d = await res.json().catch(() => ({}));
    return { checked: true, exists: null, status: res.status, reason: `想定外 ${res.status}${formatGithubError(d)}` };
  } catch (e) { return { checked: false, reason: `GET 失敗: ${e.message}` }; }
}

// 実 PUT（--execute 時のみ呼ぶ）。create / update（force+sha）。token 値は出さない。
async function putToShared(sharedPath, jsonStr, token, sha, venue, totalRaces, date) {
  const url = `https://api.github.com/repos/${REPO}/contents/${sharedPath}`;
  const message = `📋 出走表データ追加(auto/uma_shosai): ${venue} ${totalRaces}レース ${date}`;
  const body = { message, content: Buffer.from(jsonStr, 'utf-8').toString('base64'), branch: BRANCH };
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

// 集約 parsedResult の保存ガード（**full venue のみ**・R01-only/partial 不可）。reasons[] に不適合理由。
export function evaluateAggregateSaveGuards(parsed, v) {
  const reasons = [];
  if (!v.ok) reasons.push(`validator error ${v.errors.length}件（schema PASS でない）`);

  const sm = parsed.sourceMeta || {};
  for (const [k, expected] of Object.entries(EXPECT_SOURCE)) {
    if (sm[k] !== expected) reasons.push(`sourceMeta.${k}=${JSON.stringify(sm[k])} 期待 ${JSON.stringify(expected)}`);
  }

  if (!parsed.date) reasons.push('date が無い');
  if (!parsed.venueCode || !NANKAN_CODES.includes(parsed.venueCode)) reasons.push('venueCode 不正');

  const races = Array.isArray(parsed.races) ? parsed.races : [];
  if (parsed.totalRaces !== races.length) reasons.push(`totalRaces(${parsed.totalRaces}) != races.length(${races.length})`);
  // full venue 限定（R01-only / partial は保存しない）
  if (!(parsed.totalRaces > 1)) reasons.push(`totalRaces=${parsed.totalRaces}（full venue=複数レースのみ保存・R01-only/partial 不可）`);
  if (!(races.length > 1)) reasons.push(`races.length=${races.length}（複数レースのみ保存）`);
  if (!Array.isArray(sm.races) || sm.races.length !== races.length) {
    reasons.push(`sourceMeta.races.length(${Array.isArray(sm.races) ? sm.races.length : 'n/a'}) != races.length(${races.length})`);
  }

  // raceNumber 昇順 & 重複なし（厳密増加）
  const rns = races.map(r => r.raceNumber);
  if (!rns.every(n => typeof n === 'number')) reasons.push('raceNumber に数値でないものがある');
  for (let i = 1; i < rns.length; i++) {
    if (!(rns[i] > rns[i - 1])) { reasons.push(`raceNumber が昇順/一意でない: ${rns.join(',')}`); break; }
  }

  // horses 空 race なし
  if (races.some(r => !Array.isArray(r.horses) || r.horses.length === 0)) reasons.push('horses が空の race がある');

  // record 0埋め（present かつ全0）は絶対に保存しない（mapper は null のはずだが二重ガード）
  const horses = races.flatMap(r => r.horses || []);
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    L('使い方（既定 dry-run・保存なし）:');
    L('  --program-url="https://www.nankankeiba.com/program/{14桁}.do" --venue=OOI [--out=tmp/...json]');
    L('  --urls=tmp/urls.txt --venue=OOI [--date=YYYY-MM-DD] [--out=tmp/...json]');
    L('  （--max=N で先頭 N レースだけ取得する軽量確認も可・保存は不可）');
    L('  保存（opt-in・二段・full venue のみ）:');
    L('    --push（保存計画/no-op・token 不使用） / --push --execute（実 PUT） / --force（既存上書き=R01-only 置換）');
    process.exit(0);
  }

  // 保存モード（既定: 保存なし dry-run）。--push/--save で保存候補・--execute で実 PUT・--force で上書き。
  const saveMode = !!(args.push || args.save);
  const doExecute = !!args.execute;
  const allowForce = !!args.force;

  const programUrl = args['program-url'] ? String(args['program-url']) : null;
  const urlsFile = args.urls ? String(args.urls) : null;
  if (!programUrl && !urlsFile) { L('❌ --program-url か --urls のどちらかが必要（--date --venue 単独解決は不可）'); process.exit(2); }
  if (programUrl && urlsFile) { L('❌ --program-url と --urls は併用不可'); process.exit(2); }

  const venueArg = args.venue ? String(args.venue) : null;
  if (venueArg && !NANKAN_CODES.includes(venueArg)) {
    L(`❌ 未知の南関 venueCode: ${venueArg}（許可: ${NANKAN_CODES.join('/')}）`); process.exit(2);
  }

  // ---- race URL 一覧の確定 ----
  let raceUrls = [];
  let programMode = false;
  let programMeta = null;

  if (programUrl) {
    programMode = true;
    let pu;
    try { pu = new URL(programUrl); } catch { L(`❌ --program-url 不正: ${programUrl}`); process.exit(2); }
    if (!/(^|\.)nankankeiba\.com$/.test(pu.hostname)) { L(`❌ program は nankankeiba.com のみ: ${pu.hostname}`); process.exit(2); }
    const pm = pu.pathname.match(/\/program\/(\d{14})\.do/);
    if (!pm) { L(`❌ program URL が /program/{14桁}.do でない: ${pu.pathname}`); process.exit(2); }
    programMeta = deriveFromProgramId(pm[1]);

    let pHtml;
    try { ({ html: pHtml } = await fetchHtml(programUrl)); }
    catch (e) { L(`❌ program 取得失敗: ${e.message}`); process.exit(3); }
    raceUrls = extractRaceUrlsFromProgram(pHtml, pu.origin);
    if (raceUrls.length === 0) { L('❌ program 内に race URL（syousai/{16桁}）が0件'); process.exit(1); }
  } else {
    let raw;
    try { raw = readUrlsFile(urlsFile); }
    catch (e) { L(`❌ --urls 読み込み失敗: ${e.message}`); process.exit(2); }
    if (raw.length === 0) { L('❌ --urls に有効な URL が0件'); process.exit(2); }
    // 重複は error（契約§29.4: 取りこぼし/重複は error 方針に合わせる）
    const seen = new Set(); const dups = [];
    for (const u of raw) { if (seen.has(u)) dups.push(u); seen.add(u); }
    if (dups.length) { L(`❌ --urls に重複 URL: ${[...new Set(dups)].join(', ')}`); process.exit(2); }
    // raceNumber 昇順に並べる
    raceUrls = raw.slice().sort((a, b) => {
      const A = a.match(/\/(?:syousai|uma_shosai)\/(\d{16})\.do/);
      const B = b.match(/\/(?:syousai|uma_shosai)\/(\d{16})\.do/);
      const an = A ? deriveFromRaceId(A[1]).raceNumber : 0;
      const bn = B ? deriveFromRaceId(B[1]).raceNumber : 0;
      return an - bn;
    });
  }

  // ---- スコープガード（全 race URL）----
  for (const u of raceUrls) {
    const bad = assertRaceUrlScope(u);
    if (bad) { L(`❌ スコープ外 URL: ${u}（${bad}）`); process.exit(2); }
  }

  // ---- URL 由来の identity（date / jyo2 共通・raceNumber 一意）を先に検証 ----
  const idMeta = raceUrls.map((u) => {
    const m = u.match(/\/(?:syousai|uma_shosai)\/(\d{16})\.do/);
    return { url: u, ...deriveFromRaceId(m[1]) };
  });
  const dateSet = new Set(idMeta.map((x) => x.date));
  const jyoSet = new Set(idMeta.map((x) => x.jyo2));
  if (dateSet.size !== 1) { L(`❌ race URL の日付が混在: ${[...dateSet].join(', ')}`); process.exit(1); }
  if (jyoSet.size !== 1) { L(`❌ race URL の会場(jyo)が混在: ${[...jyoSet].join(', ')}`); process.exit(1); }
  const rnSeen = new Set();
  for (const x of idMeta) {
    if (rnSeen.has(x.raceNumber)) { L(`❌ raceNumber 重複: R${x.raceNumber}`); process.exit(1); }
    rnSeen.add(x.raceNumber);
  }

  const urlDate = [...dateSet][0];
  const jyo2 = [...jyoSet][0];
  if (programMode && programMeta && programMeta.date !== urlDate) {
    L(`❌ program 日付(${programMeta.date}) と race URL 日付(${urlDate}) が不一致`); process.exit(1);
  }

  // venueCode の確定（--venue が正・無ければ jyo2 map から）
  const jyoVenue = JYO2_TO_VENUE[jyo2] || null;
  const venueCode = venueArg || jyoVenue;
  if (!venueCode) { L(`❌ venueCode を確定できません（--venue を指定。jyo2=${jyo2} は未知）`); process.exit(2); }
  if (venueArg && jyoVenue && venueArg !== jyoVenue) {
    L(`⚠ --venue=${venueArg} と URL jyo2=${jyo2}(→${jyoVenue}) が不一致（--venue を採用・要確認）`);
  }
  const venueName = NANKAN_VENUE_NAME_BY_CODE[venueCode];

  // --date が与えられていれば URL 由来と一致確認
  if (args.date && String(args.date) !== urlDate) {
    L(`❌ --date=${args.date} と URL 由来 date=${urlDate} が不一致`); process.exit(1);
  }
  const date = urlDate;

  // --max（軽量確認用）
  const max = Number.isInteger(parseInt(args.max, 10)) && parseInt(args.max, 10) > 0 ? parseInt(args.max, 10) : raceUrls.length;
  const targets = idMeta.slice(0, max);
  const limited = max < raceUrls.length;

  L('────────────────────────────────────────');
  if (!saveMode) {
    L('[DRY_RUN] 集約 dry-run（保存なし・shared PUT なし・dispatch なし・token 不読み込み）');
  } else if (!doExecute) {
    L('[SAVE-PLAN] --push（保存計画/no-op・token 不使用・GET/PUT なし）。実 PUT は --push --execute');
  } else {
    L('[SAVE-EXECUTE] --push --execute（集約後に実 shared PUT を試行）。dispatch なし・save-entries 非呼出');
  }
  L(`  mode        : ${programMode ? 'program-url' : 'urls'}`);
  if (programMode) L(`  program     : ${programUrl}`);
  L(`  date        : ${date}`);
  L(`  venue       : ${venueName} (${venueCode})  jyo2=${jyo2}`);
  L(`  race URLs    : ${raceUrls.length}${limited ? ` （--max=${max} で先頭 ${max} のみ取得）` : ''}`);

  // ---- 各 race 取得 → mapper → 集約 ----
  const races = [];
  const sourceRaces = [];
  let now = null;
  let fatal = false;

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (i > 0) await sleep(FETCH_INTERVAL_MS);

    let fetched;
    try { fetched = await fetchHtml(t.url); }
    catch (e) { L(`  R${String(t.raceNumber).padStart(2, '0')} ❌ 取得失敗: ${e.message}`); fatal = true; break; }

    let parsed;
    try {
      parsed = convertNankanEntriesHtmlToParsed(fetched.html, {
        date, venue: venueName, venueCode, category: 'nankan',
        raceNumber: t.raceNumber, sourceUrl: t.url
      });
    } catch (e) { L(`  R${String(t.raceNumber).padStart(2, '0')} ❌ HTML→parsedResult 失敗: ${e.message}`); fatal = true; break; }

    const race = parsed.races && parsed.races[0];
    if (!race) { L(`  R${String(t.raceNumber).padStart(2, '0')} ❌ races[0] が無い`); fatal = true; break; }
    // raceNumber は URL 由来を正とする（header 検出に依存しない）
    race.raceNumber = t.raceNumber;
    if (!Array.isArray(race.horses) || race.horses.length === 0) {
      L(`  R${String(t.raceNumber).padStart(2, '0')} ❌ horses が空`); fatal = true; break;
    }

    // 各 race 単体を validator/summary に通して per-race 来歴を作る
    const rv = validateNankanEntriesData(parsed, { expect: { date, venueCode, venue: venueName, category: 'nankan' } });
    const rs = summarizeNankanEntriesData(parsed);
    if (now == null) now = parsed.createdAt;

    races.push(race);
    sourceRaces.push({
      raceNumber: t.raceNumber,
      sourceUrl: t.url,
      finalUrl: fetched.res.url,
      status: fetched.res.status,
      bytes: fetched.buf.length,
      warningsCount: rv.warnings.length,
      recentRacesCoverage: rs.recentRacesCoverage
    });
    L(`  R${String(t.raceNumber).padStart(2, '0')} ✅ ${race.horses.length}頭` +
      `  recent ${rs.recentRacesCoverage}  warn ${rv.warnings.length}  ${fetched.buf.length}B` +
      (rv.ok ? '' : `  ⚠ race単体 error ${rv.errors.length}`));
    if (!rv.ok) rv.errors.slice(0, 5).forEach((e) => L(`       - [race error] ${e}`));
    if (!rv.ok) fatal = true; // 1 race でも error なら venue 全体を成功扱いにしない
    if (fatal) break;
  }

  if (fatal) {
    L('────────────────────────────────────────');
    L('❌ 1 race でも取得/変換/検証に失敗したため、venue 全体は成功扱いにしません（--allow-partial なし）');
    process.exit(1);
  }

  // program mode: race URL 数 == 取得成功 race 数（--max 未指定時のみ厳格判定）
  if (programMode && !limited && races.length !== raceUrls.length) {
    L(`❌ program race URL 数(${raceUrls.length}) と取得成功 race 数(${races.length}) が不一致`); process.exit(1);
  }

  // raceNumber 昇順に整列
  races.sort((a, b) => a.raceNumber - b.raceNumber);
  sourceRaces.sort((a, b) => a.raceNumber - b.raceNumber);

  // ---- venue 単位 parsedResult を構築 ----
  const aggregated = {
    version: '1.0.0',
    createdAt: now,
    lastUpdated: now,
    date,
    venue: venueName,
    venueCode,
    category: 'nankan',
    totalRaces: races.length,
    races, // ← race 本体には取得メタを混ぜない（契約§29.5）
    sourceMeta: {
      sourceType: 'auto',
      sourcePageType: 'uma_shosai',
      sourceUrl: null,                          // venue 単位では個別 URL を持たない
      programUrl: programMode ? programUrl : null,
      recordSourced: false,
      recordCoverage: '0%',
      missingRecordReason: 'uma_shosai_no_record',
      races: sourceRaces                         // race 単位の取得来歴はここに集約
    }
  };

  // ---- 集約後 validator ----
  const v = validateNankanEntriesData(aggregated, {
    expect: { date, venueCode, venue: venueName, category: 'nankan' }
  });
  const s = v.summary;

  // ---- 出力（schema OK のときのみ JSON を出す）----
  const outPath = args.out ? String(args.out) : null;
  let outErr = null;
  if (v.ok) {
    try {
      const json = JSON.stringify(aggregated, null, 2);
      if (outPath) writeFileSafe(outPath, json);
      // stdout には大きい JSON を出さず、--out 指定時のみファイル。未指定なら summary のみ。
    } catch (e) { outErr = e.message; }
  }

  // ---- summary ----
  L('────────────────────────────────────────');
  L('  ── 集約結果 ──');
  L(`  totalRaces  : ${aggregated.totalRaces}（races.length=${aggregated.races.length}）`);
  L(`  raceNumbers : ${races.map((r) => r.raceNumber).join(', ')}`);
  L(`  totalHorses : ${s.totalHorses}`);
  L(`  sourceMeta.races : ${aggregated.sourceMeta.races.length}`);
  L(`  sourceType  : ${s.sourceType ?? '-'} / ${aggregated.sourceMeta.sourcePageType}`);
  L(`  recordSourced: ${s.recordSourced}  coverage ${s.recordCoverage}（record optional・0埋めしない）`);
  L(`  recent 充足率 : ${s.recentRacesCoverage}`);
  L(`  schema warn : ${v.warnings.length}件`);
  L(`  output      : ${outErr ? `❌ ${outErr}` : (outPath || '(summary のみ・--out で tmp 出力可)')}`);
  L(`  schema      : ${v.ok ? '✅ OK' : `❌ ${v.errors.length}件 error`}`);
  if (!v.ok) v.errors.slice(0, 30).forEach((e) => L(`     - [error] ${e}`));
  if (v.warnings.length) {
    L(`  （warning 先頭8件）`);
    v.warnings.slice(0, 8).forEach((e) => L(`     - [warn]  ${e}`));
  }

  if (outErr) process.exit(1);
  if (!saveMode) {
    L('  保存          : しない（既定 dry-run。保存は --push / --push --execute）');
    process.exit(v.ok ? 0 : 1);
  }

  // ---- opt-in 保存（二段: --push 計画 / --push --execute 実 PUT・full venue のみ）----
  L('────────────────────────────────────────');
  L('  ── 保存ガード（full venue のみ・二段 opt-in）──');

  // --max 取得（partial）は full venue でないので保存不可
  if (limited) {
    L(`  → 保存しません（--max=${max} の partial 取得。full venue のみ保存可）`);
    process.exit(1);
  }

  const guard = evaluateAggregateSaveGuards(aggregated, v);
  const sharedPath = (aggregated.date && aggregated.venueCode) ? deriveSharedPath(aggregated.date, aggregated.venueCode) : null;
  const jsonStr = JSON.stringify(aggregated, null, 2);

  L(`  shared path : ${sharedPath || '(date/venueCode 不足で算出不可)'}`);
  L(`  full venue  : totalRaces=${aggregated.totalRaces} / races=${aggregated.races.length} / sourceMeta.races=${aggregated.sourceMeta.races.length}（${aggregated.totalRaces > 1 ? 'OK' : 'NG（R01-only/partial は保存不可）'}）`);
  L(`  bytes       : ${Buffer.byteLength(jsonStr, 'utf-8')}`);
  L(`  guard       : ${guard.ok ? '✅ PASS' : `❌ ${guard.reasons.length}件`}`);
  if (!guard.ok) { guard.reasons.forEach((r) => L(`     - ${r}`)); L('  → 保存しません（ガード不適合）'); process.exit(1); }
  if (!sharedPath) { L('  → 保存しません（path 算出不可）'); process.exit(1); }

  // --push 計画（no-op）: token を読まず GitHub にも触れない。ここで停止。
  if (!doExecute) {
    L('  [SAVE-PLAN] --push（保存計画のみ）。token 不使用・GitHub GET/PUT なし。');
    L('  → 実 PUT は --push --execute。既存確認/置換判定（R01-only なら --force 必須）は --execute 時に実施。');
    process.exit(0);
  }

  // --push --execute: token を取得し、既存確認 → create/update。token 値は出さない。
  L('  [SAVE-EXECUTE] --push --execute（実 shared PUT）/ dispatch なし・save-entries 非呼出');
  const { token, source: tokenSource } = getToken();
  L(`  token       : ${token ? `あり(${tokenSource})` : 'なし'}`);
  if (!token) { L('  → 保存しません（token 未設定/gh 未ログイン）。実 PUT には token が必要。'); process.exit(1); }

  const remote = await checkRemoteExists(sharedPath, token);
  if (remote.checked && remote.exists === true) {
    L(`  既存ファイル : あり（sha 取得: ${remote.sha ? 'yes' : 'no'} / 既存 totalRaces: ${remote.remoteTotalRaces ?? '?'} / sourcePageType: ${remote.remoteSourcePageType ?? '?'}）`);
    if (remote.remoteTotalRaces === 1) {
      L('  ⚠ 既存は R01-only（totalRaces=1）。full venue JSON で置換するには --force が必須。');
    }
    if (!allowForce) { L('  → 保存しません（既存あり・create-only。上書き/置換は --force）'); process.exit(1); }
    L('  上書き      : --force 指定あり（update 予定）');
  } else if (remote.checked && remote.exists === false) {
    L('  既存ファイル : なし（新規 create 予定）');
  } else {
    L(`  既存ファイル : 未確認（${remote.reason || '不明'}）。安全側で保存しません。`);
    process.exit(1);
  }

  const put = await putToShared(sharedPath, jsonStr, token, allowForce ? remote.sha : null, aggregated.venue, aggregated.totalRaces, aggregated.date);
  if (!put.ok) { L(`  PUT         : ❌ status ${put.status}${put.reason || ''}`); process.exit(1); }
  L(`  PUT         : ✅ status ${put.status} / content sha ${put.contentSha || '-'}`);
  L(`  url         : ${put.htmlUrl || '-'}`);
  process.exit(0);
}

// 直接実行時のみ main を起動（import 時は関数だけ使えるようにする）
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { extractRaceUrlsFromProgram, deriveFromRaceId, deriveFromProgramId, assertRaceUrlScope };
