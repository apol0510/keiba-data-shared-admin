#!/usr/bin/env node
/**
 * 南関 recentHorseHistories push 専用スクリプト — shared PUT 隔離（Phase 5）
 *
 * 設計: docs/nankan-recent-horse-histories-implementation-plan.md §10.4 / §10.5
 *
 * tmp JSON を keiba-data-shared の recentHorseHistories namespace へ保存する専用経路。
 *   - generator / validator は触らない（validator は子プロセスで呼ぶだけ）。
 *   - shared PUT だけを隔離する。dispatch（repository_dispatch / workflow_dispatch）はしない。
 *   - AK / KI 接続はしない。
 *
 * このフェーズの安全方針:
 *   - --dry-run 既定ON。全ゲートを実行し、保存先 path / repository / branch / commit message 案を表示するだけ。
 *   - 実 PUT（--execute）はこのフェーズでは無効。指定すると exit 1 で停止する（別許可後に有効化）。
 *
 * 使い方:
 *   node scripts/push-recent-horse-histories.mjs --file=tmp/nankan/recentHorseHistories/2026/05/2026-05-29-URA.json
 *   node scripts/push-recent-horse-histories.mjs --file=tmp/.../2026-05-29-URA.json --dry-run
 *   node scripts/push-recent-horse-histories.mjs --help
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_ROOT = path.resolve(__dirname, '..');
const TMP_ROOT = path.join(ADMIN_ROOT, 'tmp');
const SHARED_ROOT = process.env.KEIBA_DATA_SHARED_ROOT
  ? path.resolve(process.env.KEIBA_DATA_SHARED_ROOT)
  : path.resolve(__dirname, '..', '..', 'keiba-data-shared');
const VALIDATOR = path.join(__dirname, 'validate-recent-horse-histories.mjs');

const SCHEMA_VERSION = 'nankan-recent-horse-histories-v0';
const REPO = 'apol0510/keiba-data-shared';
const BRANCH = 'main';
const TOKEN_ENV = 'GITHUB_TOKEN_KEIBA_DATA_SHARED';
// 保存先 namespace の許可形（YYYY/MM/YYYY-MM-DD-{VENUE}.json）
const NAMESPACE_RE = /^nankan\/recentHorseHistories\/(\d{4})\/(\d{2})\/(\d{4})-(\d{2})-(\d{2})-(OOI|KAW|FUN|URA)\.json$/;

const USAGE = `南関 recentHorseHistories push 専用スクリプト (Phase 5: dry-run のみ有効)

Usage:
  node scripts/push-recent-horse-histories.mjs --file=tmp/nankan/recentHorseHistories/YYYY/MM/YYYY-MM-DD-{VENUE}.json [--dry-run]

Options:
  --file=<path>   保存対象の tmp JSON（admin repo 内 tmp/ 配下のみ）。必須
  --dry-run       全ゲート実行＋保存計画表示のみ・実 PUT しない（既定ON）
  --execute       【このフェーズでは無効】指定すると exit 1。実 PUT は別許可後
  --help, -h      このヘルプ

このスクリプトは shared PUT を隔離する。dispatch（repository_dispatch / workflow_dispatch）はしない。
実 PUT はマコさんのターミナルで ${TOKEN_ENV} を設定して、別許可後にのみ実行する。
`;

// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { file: null, dryRun: true, execute: false, help: false };
  for (const raw of argv) {
    const [k, v] = raw.includes('=') ? raw.split(/=(.*)/s) : [raw, true];
    switch (k) {
      case '--file': args.file = v; break;
      case '--dry-run': args.dryRun = true; break;
      case '--execute': args.execute = true; break;
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

function isGitTracked(absPath) {
  try {
    execSync(`git ls-files --error-unmatch -- ${JSON.stringify(absPath)}`, { cwd: ADMIN_ROOT, stdio: 'ignore' });
    return true;
  } catch { return false; }
}

function sharedIsClean() {
  try {
    const out = execSync('git status --porcelain', { cwd: SHARED_ROOT, encoding: 'utf8' });
    return out.trim() === '';
  } catch { return null; } // shared が無い等
}

// JSON生成物が admin の git tracked/untracked に出ていないか
function jsonNotExposedInGit() {
  try {
    const out = execSync('git status --porcelain', { cwd: ADMIN_ROOT, encoding: 'utf8' });
    const exposed = out.split('\n').filter(l => /recentHorseHistories\/.*\.json/.test(l));
    return exposed.length === 0;
  } catch { return true; }
}

// tmp/ 配下相対パスから shared 保存先パスを算出（先頭 tmp/ を剥がすだけ）
function deriveSharedPath(absFile) {
  return path.relative(TMP_ROOT, absFile).split(path.sep).join('/');
}

// validator を子プロセスで実行し exit code を返す（PASS=0 / HOLD=3 / FAIL=2）
function runValidator(relFile) {
  const r = spawnSync('node', [VALIDATOR, `--file=${relFile}`], { cwd: ADMIN_ROOT, encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

// tmp JSON の内容ゲート集計
function collectContentChecks(json) {
  const c = { schemaVersion: json.schemaVersion, recentTotal: 0, sourceEnriched: 0, sourceRacebook: 0, headCountKeyFound: false, fieldSizeKeyFound: false };
  for (const race of json.races || []) {
    for (const h of race.horses || []) {
      for (const rr of h.recentRaces || []) {
        c.recentTotal++;
        const keys = Object.keys(rr);
        if (keys.includes('headCount')) c.headCountKeyFound = true;
        if (keys.includes('fieldSize')) c.fieldSizeKeyFound = true;
        const fl = rr.dataQualityFlags || [];
        if (fl.includes('source-results-enriched')) c.sourceEnriched++;
        if (fl.includes('source-racebook-only')) c.sourceRacebook++;
      }
    }
  }
  return c;
}

// 既存ファイル確認 GET（token があるときだけ実施。無ければ execute 時に確認するよう促す）
async function checkRemoteExists(sharedPath) {
  const token = process.env[TOKEN_ENV];
  if (!token) return { checked: false, reason: `${TOKEN_ENV} 未設定のため既存確認 GET は execute 時に実施` };
  const url = `https://api.github.com/repos/${REPO}/contents/${sharedPath}?ref=${BRANCH}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'push-recent-horse-histories' } });
    if (res.status === 200) return { checked: true, exists: true };
    if (res.status === 404) return { checked: true, exists: false };
    return { checked: true, exists: null, status: res.status, reason: `想定外ステータス ${res.status}` };
  } catch (e) {
    return { checked: false, reason: `GET 失敗（dry-run では警告扱い）: ${e.message}` };
  }
}

// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(USAGE); process.exit(0); }

  // --execute はこのフェーズでは無効（安全優先）
  if (args.execute) {
    console.error('--execute is disabled in this phase（実 PUT は別許可後）。dry-run のみ実行可能です。');
    process.exit(1);
  }

  if (!args.file) { console.error('--file=<tmp配下path> が必要です。\n' + USAGE); process.exit(1); }

  const absFile = path.resolve(args.file);
  const errors = [];   // ゲート不合格（その他）→ exit 2
  const warnings = [];
  const notes = [];

  // ---- パス系ゲート ----
  if (isWithin(SHARED_ROOT, absFile)) errors.push(`--file が keiba-data-shared 実パス配下です（禁止）: ${absFile}`);
  if (!isWithin(TMP_ROOT, absFile)) errors.push(`--file が admin repo 内 tmp/ 配下ではありません: ${absFile}`);

  const sharedPath = deriveSharedPath(absFile);
  if (!NAMESPACE_RE.test(sharedPath)) errors.push(`保存先 namespace 形式に一致しません（nankan/recentHorseHistories/YYYY/MM/YYYY-MM-DD-{OOI|KAW|FUN|URA}.json）: ${sharedPath}`);

  // ---- tmp JSON 読み込み ----
  let json = null;
  if (!fs.existsSync(absFile)) {
    errors.push(`tmp JSON が存在しません: ${absFile}`);
  } else {
    try { json = JSON.parse(fs.readFileSync(absFile, 'utf8')); }
    catch (e) { errors.push(`tmp JSON parse 不可: ${e.message}`); }
  }

  // ---- 内容ゲート ----
  let content = null;
  if (json) {
    content = collectContentChecks(json);
    if (content.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion 不一致: ${content.schemaVersion}`);
    if (content.sourceEnriched + content.sourceRacebook !== content.recentTotal) {
      errors.push(`source内訳合計(${content.sourceEnriched}+${content.sourceRacebook}) != recentRaces総数(${content.recentTotal})`);
    }
    if (!content.headCountKeyFound && content.recentTotal > 0) errors.push('headCount キーが出力されていない');
    if (content.fieldSizeKeyFound) errors.push('fieldSize キーが出力されている');
  }

  // ---- git 露出ゲート ----
  if (!jsonNotExposedInGit()) errors.push('JSON生成物が admin の git tracked/untracked に出ている');

  // ---- shared clean ゲート ----
  const sharedClean = sharedIsClean();
  if (sharedClean === false) errors.push('keiba-data-shared に変更がある（clean でない）');
  if (sharedClean === null) errors.push('keiba-data-shared の状態を確認できない');

  // ---- validator 子プロセス（PASS=0 / HOLD=3 / FAIL=2）----
  // パスが tmp/ 配下でない等の致命エラーが既にある場合は validator を呼ばない
  let validatorCode = null, validatorTail = '';
  const canRunValidator = errors.length === 0;
  if (canRunValidator) {
    const v = runValidator(args.file);
    validatorCode = v.code;
    validatorTail = (v.stdout.trim().split('\n').slice(-6).join('\n'));
  }

  // ---- 既存ファイル確認 GET（token 有時のみ）----
  let remote = { checked: false, reason: 'パス/内容ゲート不合格のため GET 未実施' };
  if (errors.length === 0 && NAMESPACE_RE.test(sharedPath)) {
    remote = await checkRemoteExists(sharedPath);
    if (remote.checked && remote.exists === true) errors.push(`保存先が既に存在します（create-only・上書き禁止）: ${sharedPath}`);
    else if (remote.checked && remote.exists === null) warnings.push(remote.reason);
    else if (!remote.checked) notes.push(remote.reason);
  }

  // ---- commit message 案 ----
  const m = sharedPath.match(NAMESPACE_RE);
  const commitMessage = m ? `add nankan recentHorseHistories ${m[3]}-${m[4]}-${m[5]} ${m[6]}` : '(保存先 namespace 不一致のため未確定)';

  // ============================ 出力 ============================
  console.log(`=== recentHorseHistories push (dry-run) ===`);
  console.log(`[入力]   --file: ${path.relative(ADMIN_ROOT, absFile)}`);
  console.log(`[保存先] repository: ${REPO}`);
  console.log(`         branch    : ${BRANCH}`);
  console.log(`         path      : ${sharedPath}`);
  console.log(`         commitMsg : ${commitMessage}`);
  if (content) {
    console.log(`[内容]   schemaVersion=${content.schemaVersion}  recentRaces=${content.recentTotal}`);
    console.log(`         source-results-enriched=${content.sourceEnriched}  source-racebook-only=${content.sourceRacebook}  (合計=${content.sourceEnriched + content.sourceRacebook})`);
    console.log(`         headCountキー=${content.headCountKeyFound}  fieldSizeキー=${content.fieldSizeKeyFound}`);
  }
  const vLabel = validatorCode === 0 ? 'PASS' : validatorCode === 3 ? 'HOLD' : validatorCode === 2 ? 'FAIL' : validatorCode == null ? '未実行' : `code ${validatorCode}`;
  console.log(`[validator] ${vLabel}${validatorCode == null ? '（先行ゲート不合格のため未実行）' : ''}`);
  if (validatorTail) for (const l of validatorTail.split('\n')) console.log(`            ${l}`);
  console.log(`[既存確認] ${remote.checked ? (remote.exists === true ? '既存あり（中止）' : remote.exists === false ? '404（未存在・OK）' : remote.reason) : remote.reason}`);
  console.log(`[shared] clean=${sharedClean}`);
  console.log(`[PUT]    実 PUT しない（--execute はこのフェーズで無効）`);
  console.log(`[dispatch] repository_dispatch / workflow_dispatch はしない（このスクリプトは dispatch を持たない）`);
  console.log(`[AK/KI]  接続しない・変更しない`);
  for (const n of notes) console.log(`         ℹ ${n}`);
  for (const w of warnings) console.log(`         ⚠ WARN: ${w}`);
  for (const e of errors) console.log(`         ✗ GATE: ${e}`);

  // ---- 判定 / exit ----
  // 優先順: パス/内容/環境ゲート(2) → 既存ファイル(1) → validator(HOLD=3/FAIL=2)
  const existsErr = errors.find(e => e.startsWith('保存先が既に存在します'));
  const otherErrs = errors.filter(e => !e.startsWith('保存先が既に存在します'));
  if (otherErrs.length) { console.log(`[判定]   GATE FAIL`); process.exit(2); }
  if (existsErr) { console.log(`[判定]   既存ファイルあり → 中止`); process.exit(1); }
  if (validatorCode === 3) { console.log(`[判定]   validator HOLD → 中止`); process.exit(3); }
  if (validatorCode === 2) { console.log(`[判定]   validator FAIL → 中止`); process.exit(2); }
  if (validatorCode !== 0) { console.log(`[判定]   validator 異常 (code ${validatorCode}) → 中止`); process.exit(2); }
  console.log(`[判定]   PASS（dry-run・保存計画のみ。実 PUT は別許可後）`);
  process.exit(0);
}

main();
