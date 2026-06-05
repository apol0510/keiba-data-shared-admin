#!/usr/bin/env node
/**
 * 南関 recentHorseHistories dispatch 専用スクリプト — AK/KI 単発配信（Phase D-2）
 *
 * 設計: docs/nankan-horse-detail-display-plan.md §18（Phase D 設計方針）
 *
 * shared PUT 済みの 1 ファイルについて、analytics-keiba と keiba-intelligence の
 * 両方へ repository_dispatch (recent-horse-histories-nankan-updated) を 1 回だけ送る専用経路。
 *
 *   - generator / validator / push は触らない（validator は子プロセスで呼ぶだけ）。
 *   - shared PUT はしない（PUT は push-recent-horse-histories.mjs の責務。本スクリプトは送信のみ）。
 *   - 既存 netlify/lib/dispatch.mjs の dispatchToTargets は使わない。
 *       理由: token フォールバック (GITHUB_TOKEN_KEIBA_DATA_SHARED) があり、片側だけ
 *       skipped になる事故が起こり得るため。本スクリプトは AK/KI 両方の専用 token 必須で
 *       明示 fail させる（JRA auto-fetch-horse-histories.mjs と同方針）。
 *   - JRA 用 event (horse-histories-updated) は絶対に使わない。event は南関専用で固定。
 *   - 複数日一括 dispatch / updates 配列は禁止。1 ファイル = 単一 date / 単一 venue。
 *
 * 安全方針（多段ゲート。すべて満たした時だけ実送信）:
 *   1. --dispatch が指定されている（opt-in。無ければ送らない）
 *   2. --dry-run が指定されていない（--dry-run は最優先で実送信を止める）
 *   3. --confirm-dispatch=recent-horse-histories-nankan-updated が完全一致
 *   4. 対象 tmp JSON の validator が PASS（FAIL/HOLD は中止）
 *   5. validator WARN が 0、または --allow-validator-warn 指定（指定時も WARN 理由を明示）
 *   6. shared に同名ファイルが GET=200 で存在し、内容が tmp と一致（= PUT 成功済みの確証）
 *   7. ANALYTICS_KEIBA_TOKEN が存在する（値は出さず OK/MISSING のみ）
 *   8. KEIBA_INTELLIGENCE_TOKEN が存在する（値は出さず OK/MISSING のみ）
 *   送信先は AK/KI の 2 repo 固定。payload は単一 date / venues 配列。
 *
 * 使い方:
 *   # dry-run（既定。--dispatch が無ければ常に dry-run。実送信しない）
 *   node scripts/dispatch-recent-horse-histories-nankan.mjs --file=tmp/nankan/recentHorseHistories/2026/06/2026-06-01-FUN.json
 *
 *   # 全ゲートを評価しつつ --dry-run で実送信を物理的に止める（confirm 一致も確認できる）
 *   node scripts/dispatch-recent-horse-histories-nankan.mjs \
 *     --file=tmp/.../2026-06-01-FUN.json \
 *     --dispatch --confirm-dispatch=recent-horse-histories-nankan-updated --dry-run
 *
 *   # 実送信（別許可後・マコさんのターミナルで token を設定して実行）
 *   node scripts/dispatch-recent-horse-histories-nankan.mjs \
 *     --file=tmp/.../2026-06-01-FUN.json \
 *     --dispatch --confirm-dispatch=recent-horse-histories-nankan-updated
 *
 *   node scripts/dispatch-recent-horse-histories-nankan.mjs --help
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_ROOT = path.resolve(__dirname, '..');
const TMP_ROOT = path.join(ADMIN_ROOT, 'tmp');
const SHARED_ROOT = process.env.KEIBA_DATA_SHARED_ROOT
  ? path.resolve(process.env.KEIBA_DATA_SHARED_ROOT)
  : path.resolve(__dirname, '..', '..', 'keiba-data-shared');
const VALIDATOR = path.join(__dirname, 'validate-recent-horse-histories.mjs');

const SCHEMA_VERSION = 'nankan-recent-horse-histories-v0';

// ── dispatch 契約（南関 recentHorseHistories 専用・JRA とは別 event）──
const DISPATCH_EVENT_TYPE = 'recent-horse-histories-nankan-updated';
const CONFIRM_DISPATCH_REQUIRED = 'recent-horse-histories-nankan-updated';
const DISPATCH_SOURCE = 'nankan-recent-horse-histories';
const DISPATCH_TARGET_REPOS = ['apol0510/keiba-intelligence', 'apol0510/analytics-keiba'];
// dispatch 用 token（両方必須・フォールバック禁止）
const TOKEN_ENV_AK = 'ANALYTICS_KEIBA_TOKEN';
const TOKEN_ENV_KI = 'KEIBA_INTELLIGENCE_TOKEN';
// 送信先 repo → token env 名（値は保持しない。存在チェックと送信時の解決のみ）
const REPO_TOKEN_ENV = {
  'apol0510/keiba-intelligence': TOKEN_ENV_KI,
  'apol0510/analytics-keiba': TOKEN_ENV_AK,
};

// ── shared 既存確認（PUT 成功の確証取り）用 ──
const SHARED_REPO = 'apol0510/keiba-data-shared';
const SHARED_BRANCH = 'main';
const SHARED_TOKEN_ENV = 'GITHUB_TOKEN_KEIBA_DATA_SHARED';

// 保存先 namespace の許可形（YYYY/MM/YYYY-MM-DD-{VENUE}.json）
const NAMESPACE_RE = /^nankan\/recentHorseHistories\/(\d{4})\/(\d{2})\/(\d{4})-(\d{2})-(\d{2})-(OOI|KAW|FUN|URA)\.json$/;

const USAGE = `南関 recentHorseHistories dispatch 専用スクリプト (Phase D-2)

Usage:
  node scripts/dispatch-recent-horse-histories-nankan.mjs --file=tmp/nankan/recentHorseHistories/YYYY/MM/YYYY-MM-DD-{VENUE}.json [options]

Options:
  --file=<path>                 dispatch 対象の tmp JSON（admin repo 内 tmp/ 配下のみ）。必須
  --dispatch                    実送信を opt-in（無ければ常に dry-run・送らない）
  --confirm-dispatch=<event>    実送信には ${CONFIRM_DISPATCH_REQUIRED} の完全一致が必須（二段階確認）
  --allow-validator-warn        validator WARN があっても続行（WARN 理由はログに明示）。FAIL/HOLD は常に中止
  --dry-run                     最優先で実送信を止める（全ゲートは評価し送信予定を表示するだけ）
  --help, -h                    このヘルプ

このスクリプトは送信のみ。shared PUT はしない（PUT は push-recent-horse-histories.mjs）。
event は南関専用 ${DISPATCH_EVENT_TYPE} で固定（JRA horse-histories-updated は使わない）。
送信先は ${DISPATCH_TARGET_REPOS.join(' / ')} の 2 repo（両方の専用 token 必須）。
`;

// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {
    file: null, dispatch: false, confirmDispatch: null,
    allowWarn: false, dryRun: false, help: false,
  };
  for (const raw of argv) {
    const [k, v] = raw.includes('=') ? raw.split(/=(.*)/s) : [raw, true];
    switch (k) {
      case '--file': args.file = v; break;
      case '--dispatch': args.dispatch = true; break;
      case '--confirm-dispatch': args.confirmDispatch = v; break;
      case '--allow-validator-warn': args.allowWarn = true; break;
      case '--dry-run': args.dryRun = true; break;
      case '--help': case '-h': args.help = true; break;
      default: console.error(`Unknown argument: ${k}`); process.exit(1);
    }
  }
  return args;
}

function isWithin(parent, child) {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

// token 値は絶対に出さない。存在のみ true/false。
function tokenPresent(envName) {
  const v = process.env[envName];
  return typeof v === 'string' && v.length > 0;
}

// tmp/ 配下相対パスから shared 保存先パスを算出（先頭 tmp/ を剥がすだけ）
function deriveSharedPath(absFile) {
  return path.relative(TMP_ROOT, absFile).split(path.sep).join('/');
}

// validator を子プロセスで実行。PASS=0 / HOLD=3 / FAIL=2。WARN は exit code を持たないため
// stdout の「⚠ WARN:」行を数える（PASS と同居する）。
// ログは最小限に: 判定サマリ行（[判定]/✗ FAIL/⏸ HOLD）と WARN 行のみ抽出する。
// （flag 一覧等の冗長行は出さない。WARN は warnLines として一度だけ表示する）
function runValidator(relFile) {
  const r = spawnSync('node', [VALIDATOR, `--file=${relFile}`], { cwd: ADMIN_ROOT, encoding: 'utf8' });
  const lines = (r.stdout || '').split('\n');
  const warnLines = lines.filter(l => l.includes('⚠ WARN:')).map(l => l.trim());
  // 判定行と FAIL/HOLD 行のみ（WARN 行はここに含めず warnLines に一本化）
  const summaryLines = lines
    .filter(l => /\[判定\]|✗ FAIL:|⏸ HOLD:/.test(l))
    .map(l => l.trim());
  return { code: r.status, warnLines, summaryLines };
}

// GitHub API のエラー応答から安全な診断だけ抜き出す（token / body / content は含めない）。
function formatGithubError(data) {
  const parts = [];
  if (data && typeof data.message === 'string') parts.push(`message: ${data.message}`);
  if (data && typeof data.documentation_url === 'string') parts.push(`documentation_url: ${data.documentation_url}`);
  return parts.length ? ` / ${parts.join(' / ')}` : '';
}

// shared 上に同名ファイルが存在し内容が tmp と一致するか（= PUT 成功済みの確証）。
// token が無ければ確認不可（dry-run では warn、実送信では gate fail）。
async function checkSharedMatches(sharedPath, rawText) {
  const token = process.env[SHARED_TOKEN_ENV];
  if (!token) return { checked: false, reason: `${SHARED_TOKEN_ENV} 未設定のため PUT 済み確認 GET 未実施` };
  const url = `https://api.github.com/repos/${SHARED_REPO}/contents/${sharedPath}?ref=${SHARED_BRANCH}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'dispatch-recent-horse-histories-nankan' } });
    if (res.status === 404) return { checked: true, exists: false, match: false, reason: 'shared に未存在（PUT 未完了）' };
    if (res.status !== 200) {
      const data = await res.json().catch(() => ({}));
      return { checked: true, exists: null, match: false, reason: `想定外ステータス ${res.status}${formatGithubError(data)}` };
    }
    const data = await res.json();
    const decoded = Buffer.from(data.content || '', 'base64').toString('utf8');
    const match = decoded === rawText;
    return { checked: true, exists: true, match, sha: data.sha, reason: match ? 'shared 内容一致（PUT 済み確認OK）' : 'shared に存在するが内容が tmp と不一致' };
  } catch (e) {
    return { checked: false, reason: `GET 失敗（dry-run では警告扱い）: ${e.message}` };
  }
}

// repository_dispatch 送信（最小実装。netlify/lib/dispatch.mjs は使わない）。
async function sendRepositoryDispatch(repo, eventType, payload, token) {
  if (!token) throw new Error(`token missing for ${repo}`);
  const url = `https://api.github.com/repos/${repo}/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'dispatch-recent-horse-histories-nankan',
    },
    body: JSON.stringify({ event_type: eventType, client_payload: payload }),
  });
  if (res.status === 204 || res.ok) return { ok: true, status: res.status };
  const data = await res.json().catch(() => ({}));
  throw new Error(`HTTP ${res.status}${formatGithubError(data)}`);
}

// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(USAGE); process.exit(0); }
  if (!args.file) { console.error('--file=<tmp配下path> が必要です。\n' + USAGE); process.exit(1); }

  const absFile = path.resolve(args.file);
  const errors = [];   // ハードゲート不合格 → exit 2
  const notes = [];

  // ---- パス系ゲート ----
  if (isWithin(SHARED_ROOT, absFile)) errors.push(`--file が keiba-data-shared 実パス配下です（禁止）: ${absFile}`);
  if (!isWithin(TMP_ROOT, absFile)) errors.push(`--file が admin repo 内 tmp/ 配下ではありません: ${absFile}`);

  const sharedPath = deriveSharedPath(absFile);
  if (!NAMESPACE_RE.test(sharedPath)) errors.push(`保存先 namespace 形式に一致しません（nankan/recentHorseHistories/YYYY/MM/YYYY-MM-DD-{OOI|KAW|FUN|URA}.json）: ${sharedPath}`);

  // ---- tmp JSON 読み込み ----
  let json = null, rawText = null;
  if (!fs.existsSync(absFile)) {
    errors.push(`tmp JSON が存在しません: ${absFile}`);
  } else {
    try { rawText = fs.readFileSync(absFile, 'utf8'); json = JSON.parse(rawText); }
    catch (e) { errors.push(`tmp JSON parse 不可: ${e.message}`); }
  }
  if (json && json.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion 不一致: ${json.schemaVersion}`);

  // ---- payload 構築（単一 date / 単一 venue。複数日・updates 配列は作らない）----
  const m = sharedPath.match(NAMESPACE_RE);
  const fileDate = m ? `${m[3]}-${m[4]}-${m[5]}` : null; // ファイル名由来（権威）
  const fileVenue = m ? m[6] : null;                     // ファイル名由来 venue code（権威）
  // tmp JSON 側の date / venue と突き合わせ（不一致なら混入リスクのため中止）
  if (json && fileDate && json.date && String(json.date) !== fileDate) errors.push(`tmp JSON の date(${json.date}) がファイル名(${fileDate})と不一致`);
  if (json && fileVenue && json.venue && String(json.venue) !== fileVenue) errors.push(`tmp JSON の venue(${json.venue}) がファイル名(${fileVenue})と不一致`);
  const payload = (fileDate && fileVenue)
    ? { date: fileDate, venues: [fileVenue], source: DISPATCH_SOURCE }
    : null;

  // ---- validator 子プロセス（PASS=0 / HOLD=3 / FAIL=2、WARN は stdout 行数）----
  let validatorCode = null, warnLines = [], validatorSummary = [];
  const canRunValidator = errors.length === 0;
  if (canRunValidator) {
    const v = runValidator(args.file);
    validatorCode = v.code;
    warnLines = v.warnLines;
    validatorSummary = v.summaryLines;
  }

  // ---- shared 既存確認（PUT 成功の確証取り。token 有時のみ）----
  let shared = { checked: false, reason: '先行ゲート不合格のため GET 未実施' };
  if (errors.length === 0 && rawText != null && NAMESPACE_RE.test(sharedPath)) {
    shared = await checkSharedMatches(sharedPath, rawText);
  }

  // ---- token 存在チェック（値は出さない）----
  const akPresent = tokenPresent(TOKEN_ENV_AK);
  const kiPresent = tokenPresent(TOKEN_ENV_KI);
  const sharedTokenPresent = tokenPresent(SHARED_TOKEN_ENV);

  // ---- confirm-dispatch 完全一致判定 ----
  const confirmMatch = args.confirmDispatch === CONFIRM_DISPATCH_REQUIRED;

  // ---- WARN 判定 ----
  const warnCount = warnLines.length;
  const warnBlocks = warnCount > 0 && !args.allowWarn;

  // ============================ 出力 ============================
  // 送信モード判定: --dispatch かつ --dry-run でない場合に「実送信を試みる」モード。
  const wantSend = args.dispatch && !args.dryRun;
  const mode = !args.dispatch ? 'dry-run（--dispatch 無し・常に送らない）'
    : args.dryRun ? 'dry-run（--dry-run 最優先・送らない）'
    : 'SEND（全ゲート通過時のみ実送信）';

  console.log(`=== recentHorseHistories dispatch (${mode}) ===`);
  console.log(`[入力]   --file: ${path.relative(ADMIN_ROOT, absFile)}`);
  console.log(`[event]  event_type: ${DISPATCH_EVENT_TYPE}  (JRA horse-histories-updated は使わない)`);
  console.log(`[targets]`);
  for (const r of DISPATCH_TARGET_REPOS) console.log(`         - ${r}  (token: ${REPO_TOKEN_ENV[r]})`);
  console.log(`[payload]`);
  if (payload) for (const l of JSON.stringify(payload, null, 2).split('\n')) console.log(`         ${l}`);
  else console.log(`         (namespace 不一致のため未構築)`);
  console.log(`         updates配列=なし  複数日一括=なし  単一date/venues=${payload ? 'はい' : '不明'}`);

  const vLabel = validatorCode === 0 ? 'PASS' : validatorCode === 3 ? 'HOLD' : validatorCode === 2 ? 'FAIL' : validatorCode == null ? '未実行' : `code ${validatorCode}`;
  console.log(`[validator] ${vLabel}  WARN=${warnCount}件${warnCount && args.allowWarn ? '（--allow-validator-warn で続行）' : ''}`);
  // WARN 理由は一度だけ表示（validator の冗長出力は再掲しない）
  for (const w of warnLines) console.log(`            ${w}`);
  // FAIL/HOLD のときだけ validator の判定根拠行を補足表示
  if (validatorCode === 2 || validatorCode === 3) for (const l of validatorSummary) console.log(`            | ${l}`);

  console.log(`[PUT確認] ${shared.checked ? (shared.match ? 'OK（shared 内容一致＝PUT 済み）' : `NG（${shared.reason}）`) : `未確認（${shared.reason}）`}`);
  console.log(`[token]  ${TOKEN_ENV_AK}=${akPresent ? 'OK' : 'MISSING'}  ${TOKEN_ENV_KI}=${kiPresent ? 'OK' : 'MISSING'}  ${SHARED_TOKEN_ENV}=${sharedTokenPresent ? 'OK' : 'MISSING'}  ※値は表示しない`);
  console.log(`[confirm] --confirm-dispatch ${confirmMatch ? '一致' : `不一致（指定=${JSON.stringify(args.confirmDispatch)} / 必須=${CONFIRM_DISPATCH_REQUIRED}）`}`);
  for (const n of notes) console.log(`         ℹ ${n}`);
  for (const e of errors) console.log(`         ✗ GATE: ${e}`);

  // ---- ハードゲート（パス/JSON/namespace/突合）----
  if (errors.length) { console.log('[判定]   GATE FAIL（送信しない）'); process.exit(2); }

  // ---- 送信可否ゲートの集計（実送信は全通過時のみ）----
  const sendGates = [
    ['--dispatch 指定', args.dispatch],
    ['--dry-run 未指定', !args.dryRun],
    [`--confirm-dispatch=${CONFIRM_DISPATCH_REQUIRED} 完全一致`, confirmMatch],
    ['validator PASS', validatorCode === 0],
    ['validator WARN 0 または --allow-validator-warn', !warnBlocks],
    ['shared PUT 済み（GET=200・内容一致）', shared.checked === true && shared.match === true],
    [`${TOKEN_ENV_AK} 存在`, akPresent],
    [`${TOKEN_ENV_KI} 存在`, kiPresent],
    ['payload 単一date/venues', !!payload],
  ];
  const failedGates = sendGates.filter(([, ok]) => !ok).map(([label]) => label);

  // validator FAIL/HOLD は送信モードに関係なく明示
  if (validatorCode === 2) { console.log('[判定]   validator FAIL → 送信しない'); process.exit(2); }
  if (validatorCode === 3) { console.log('[判定]   validator HOLD → 送信しない'); process.exit(3); }
  if (warnBlocks) { console.log(`[判定]   validator WARN ${warnCount}件 → 送信しない（許可は --allow-validator-warn）`); process.exit(3); }

  // ---- 非送信モード（dry-run）----
  if (!wantSend) {
    console.log('[dispatch] 送信しない（dry-run）。実送信に必要な残ゲート:');
    if (failedGates.length === 0) console.log('         （なし。--dispatch かつ --dry-run 無し かつ token 揃いで実送信可能）');
    else for (const g of failedGates) console.log(`         - ${g}`);
    console.log('[判定]   PASS（dry-run・実送信なし・PUTなし・AK/KI変更なし）');
    process.exit(0);
  }

  // ---- 送信モード: 残ゲートが 1 つでも欠ければ中止（片側送信を防ぐ）----
  if (failedGates.length) {
    console.log('[dispatch] 送信中止（ゲート未通過）:');
    for (const g of failedGates) console.log(`         - ${g}`);
    console.log('[判定]   SEND 中止');
    process.exit(1);
  }

  // ---- 実送信（AK/KI 両方。両方とも token 確認済み）----
  console.log('📡 dispatch 送信中（AK/KI 2 repo）...');
  let dispatched = 0;
  const failures = [];
  for (const repo of DISPATCH_TARGET_REPOS) {
    const token = process.env[REPO_TOKEN_ENV[repo]];
    try {
      const r = await sendRepositoryDispatch(repo, DISPATCH_EVENT_TYPE, payload, token);
      console.log(`✅ dispatched: ${repo}  status=${r.status}`);
      dispatched++;
    } catch (e) {
      console.error(`❌ dispatch failed: ${repo}: ${e.message}`);
      failures.push(repo);
    }
  }
  console.log(`━━━ dispatch 完了: ${dispatched}/${DISPATCH_TARGET_REPOS.length} repo ━━━`);
  if (failures.length) { console.log(`[判定]   一部送信失敗（${failures.join(', ')}）→ 要手動再送（残りは送信済み）`); process.exit(2); }
  console.log('[判定]   SEND 成功（AK/KI 両方へ単発 dispatch 完了）');
  process.exit(0);
}

main();
