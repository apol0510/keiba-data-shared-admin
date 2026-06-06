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
// 既存ファイル上書き(update PUT)を許可するための確認文字列。--allow-overwrite と両方揃ったときだけ有効。
const OVERWRITE_CONFIRM = 'recent-horse-histories-update';
// 保存先 namespace の許可形（YYYY/MM/YYYY-MM-DD-{VENUE}.json）
const NAMESPACE_RE = /^nankan\/recentHorseHistories\/(\d{4})\/(\d{2})\/(\d{4})-(\d{2})-(\d{2})-(OOI|KAW|FUN|URA)\.json$/;

const USAGE = `南関 recentHorseHistories push 専用スクリプト (Phase 5: dry-run / --execute create-only PUT)

Usage:
  node scripts/push-recent-horse-histories.mjs --file=tmp/nankan/recentHorseHistories/YYYY/MM/YYYY-MM-DD-{VENUE}.json [--dry-run]

Options:
  --file=<path>   保存対象の tmp JSON（admin repo 内 tmp/ 配下のみ）。必須
  --dry-run       全ゲート実行＋保存計画表示のみ・実 PUT しない（既定ON）
  --execute       実 PUT を実行。${TOKEN_ENV} 必須。
                  既定は create-only（既存ファイルがあると中止）。
                  --dry-run 同時指定時は dry-run 優先で PUT しない
  --allow-overwrite
                  既存ファイルの update PUT を許可する1段目フラグ。
                  --confirm-overwrite と両方揃ったときだけ既存更新を許可。
  --confirm-overwrite=${OVERWRITE_CONFIRM}
                  既存ファイル update の確認文字列（2段目）。完全一致必須。
  --help, -h      このヘルプ

このスクリプトは shared PUT を隔離する。dispatch（repository_dispatch / workflow_dispatch）はしない。
実 PUT はマコさんのターミナルで ${TOKEN_ENV} を設定して、別許可後にのみ実行する。
`;

// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { file: null, dryRun: true, dryRunExplicit: false, execute: false, allowOverwrite: false, confirmOverwrite: null, help: false };
  for (const raw of argv) {
    const [k, v] = raw.includes('=') ? raw.split(/=(.*)/s) : [raw, true];
    switch (k) {
      case '--file': args.file = v; break;
      case '--dry-run': args.dryRun = true; args.dryRunExplicit = true; break;
      case '--execute': args.execute = true; break;
      case '--allow-overwrite': args.allowOverwrite = true; break;
      case '--confirm-overwrite': args.confirmOverwrite = v; break;
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

// GitHub API のエラー応答から安全な診断情報だけを抜き出す（whitelist）。
// token / Authorization / request body / base64 content は絶対に含めない。
function formatGithubError(data) {
  const parts = [];
  if (data && typeof data.message === 'string') parts.push(`message: ${data.message}`);
  if (data && typeof data.documentation_url === 'string') parts.push(`documentation_url: ${data.documentation_url}`);
  return parts.length ? ` / ${parts.join(' / ')}` : '';
}

// 既存ファイル確認 GET（token があるときだけ実施。無ければ execute 時に確認するよう促す）
async function checkRemoteExists(sharedPath) {
  const token = process.env[TOKEN_ENV];
  if (!token) return { checked: false, reason: `${TOKEN_ENV} 未設定のため既存確認 GET は execute 時に実施` };
  const url = `https://api.github.com/repos/${REPO}/contents/${sharedPath}?ref=${BRANCH}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'push-recent-horse-histories' } });
    if (res.status === 200) {
      const data = await res.json().catch(() => ({}));
      return { checked: true, exists: true, sha: data.sha || null }; // sha は update PUT 用（token値は出さない）
    }
    if (res.status === 404) return { checked: true, exists: false };
    const data = await res.json().catch(() => ({}));
    return { checked: true, exists: null, status: res.status, reason: `想定外ステータス ${res.status}${formatGithubError(data)}` };
  } catch (e) {
    return { checked: false, reason: `GET 失敗（dry-run では警告扱い）: ${e.message}` };
  }
}

// PUT。sha 未指定=create-only（既存があれば GitHub 側が 422）。sha 指定=update。201/200 を成功とみなす。
async function putToShared(sharedPath, rawText, commitMessage, token, sha = null) {
  const url = `https://api.github.com/repos/${REPO}/contents/${sharedPath}`;
  const body = {
    message: commitMessage,
    content: Buffer.from(rawText, 'utf8').toString('base64'),
    branch: BRANCH,
    // create-only は sha なし。update は既存 sha を含める（明示確認フラグ揃い時のみ呼ばれる）。
    ...(sha ? { sha } : {}),
  };
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'push-recent-horse-histories', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.status === 201 || res.status === 200, status: res.status, data };
  } catch (e) {
    return { ok: false, status: null, error: e.message };
  }
}

// 保存後 GET（content を decode して返す）
async function getSharedContent(sharedPath, token) {
  const url = `https://api.github.com/repos/${REPO}/contents/${sharedPath}?ref=${BRANCH}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'push-recent-horse-histories' } });
    if (res.status !== 200) return { ok: false, status: res.status };
    const data = await res.json();
    const decoded = Buffer.from(data.content || '', 'base64').toString('utf8');
    return { ok: true, status: 200, decoded, sha: data.sha, path: data.path };
  } catch (e) {
    return { ok: false, status: null, error: e.message };
  }
}

// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(USAGE); process.exit(0); }

  // 実 PUT するのは --execute 指定かつ --dry-run 未指定のときだけ（dry-run 優先）
  const doExecute = args.execute && !args.dryRunExplicit;

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

  // ---- tmp JSON 読み込み（PUT は raw バイトをそのまま送る）----
  let json = null, rawText = null;
  if (!fs.existsSync(absFile)) {
    errors.push(`tmp JSON が存在しません: ${absFile}`);
  } else {
    try { rawText = fs.readFileSync(absFile, 'utf8'); json = JSON.parse(rawText); }
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

  // ---- 上書き(update)許可の2段ガード（両方揃ったときだけ既存更新を許可）----
  const overwriteRequested = args.allowOverwrite || args.confirmOverwrite != null;
  const overwriteConfirmed = args.allowOverwrite && args.confirmOverwrite === OVERWRITE_CONFIRM;
  if (overwriteRequested && !overwriteConfirmed) {
    warnings.push(`上書き指定が不完全（update には --allow-overwrite と --confirm-overwrite=${OVERWRITE_CONFIRM} の両方が必要）。今回は create-only 扱い。`);
  }

  // ---- 既存ファイル確認 GET（token 有時のみ）----
  let remote = { checked: false, reason: 'パス/内容ゲート不合格のため GET 未実施' };
  let updateMode = false;   // 既存あり＋上書き確認済み → update PUT
  let remoteSha = null;     // update PUT 用の既存 sha
  if (errors.length === 0 && NAMESPACE_RE.test(sharedPath)) {
    remote = await checkRemoteExists(sharedPath);
    if (remote.checked && remote.exists === true) {
      if (overwriteConfirmed) { updateMode = true; remoteSha = remote.sha || null; }
      else errors.push(`保存先が既に存在します（create-only・上書きには --allow-overwrite --confirm-overwrite=${OVERWRITE_CONFIRM} が必要）: ${sharedPath}`);
    }
    else if (remote.checked && remote.exists === null) warnings.push(remote.reason);
    else if (!remote.checked) notes.push(remote.reason);
  }

  // ---- execute 用ゲート（token 必須 / 既存確認の確実性 / update は sha 必須）----
  const token = process.env[TOKEN_ENV];
  let tokenMissingExecute = false;
  if (doExecute) {
    if (!token) tokenMissingExecute = true;
    else if (errors.length === 0) {
      if (!remote.checked || remote.exists === null) {
        errors.push(`execute には保存先の存在/sha を GET で確定する必要があるが確認できない: ${remote.reason || 'GET 不確定'}`);
      } else if (updateMode && !remoteSha) {
        errors.push(`update には既存ファイルの sha が必要だが GET から取得できなかった`);
      }
    }
  }

  // ---- commit message 案 ----
  const m = sharedPath.match(NAMESPACE_RE);
  const commitMessage = m ? `add nankan recentHorseHistories ${m[3]}-${m[4]}-${m[5]} ${m[6]}` : '(保存先 namespace 不一致のため未確定)';

  // ============================ 出力 ============================
  const mode = doExecute ? (updateMode ? 'execute-update' : 'execute-create') : 'dry-run';
  console.log(`=== recentHorseHistories push (${mode}) ===`);
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
  console.log(`[既存確認] ${remote.checked ? (remote.exists === true ? (updateMode ? `既存あり（update 予定・sha取得済み=${remoteSha ? 'yes' : 'no'}）` : '既存あり（create-only のため中止）') : remote.exists === false ? '404（未存在・create）' : remote.reason) : remote.reason}`);
  console.log(`[上書き] mode=${updateMode ? 'update（既存更新）' : 'create-only'}  allow-overwrite=${args.allowOverwrite}  confirm-overwrite=${args.confirmOverwrite === OVERWRITE_CONFIRM ? '一致' : (args.confirmOverwrite == null ? 'なし' : '不一致')}`);
  console.log(`[shared] clean=${sharedClean}`);
  console.log(`[token]  ${TOKEN_ENV} ${token ? 'あり' : 'なし'}${doExecute ? '（execute 必須）' : '（dry-run では任意）'}`);
  console.log(`[dispatch] repository_dispatch / workflow_dispatch はしない（このスクリプトは dispatch を持たない）`);
  console.log(`[AK/KI]  接続しない・変更しない`);
  if (args.execute && args.dryRunExplicit) console.log(`[mode]   --dry-run と --execute 同時指定 → dry-run 優先で PUT しない`);
  for (const n of notes) console.log(`         ℹ ${n}`);
  for (const w of warnings) console.log(`         ⚠ WARN: ${w}`);
  for (const e of errors) console.log(`         ✗ GATE: ${e}`);

  // ---- ゲート判定（PUT 前）----
  // 優先順: その他ゲート(2) → token未設定execute(1) → 既存ファイル(1) → validator(HOLD=3/FAIL=2)
  const existsErr = errors.find(e => e.startsWith('保存先が既に存在します'));
  const otherErrs = errors.filter(e => !e.startsWith('保存先が既に存在します'));
  if (otherErrs.length) { console.log(`[判定]   GATE FAIL`); process.exit(2); }
  if (tokenMissingExecute) { console.log(`[判定]   ${TOKEN_ENV} 未設定 → execute 中止`); process.exit(1); }
  if (existsErr) { console.log(`[判定]   既存ファイルあり → 中止`); process.exit(1); }
  if (validatorCode === 3) { console.log(`[判定]   validator HOLD → 中止`); process.exit(3); }
  if (validatorCode === 2) { console.log(`[判定]   validator FAIL → 中止`); process.exit(2); }
  if (validatorCode !== 0) { console.log(`[判定]   validator 異常 (code ${validatorCode}) → 中止`); process.exit(2); }

  // ---- 全ゲート PASS ----
  if (!doExecute) {
    console.log(`[PUT]    実 PUT しない（${args.execute && args.dryRunExplicit ? 'dry-run 優先' : 'dry-run'}・予定モード=${updateMode ? 'update' : 'create-only'}）`);
    console.log(`[判定]   PASS（dry-run・保存計画のみ。実 PUT は --execute${updateMode ? ' --allow-overwrite --confirm-overwrite=' + OVERWRITE_CONFIRM : ''}）`);
    process.exit(0);
  }

  // ---- execute: create-only または update PUT → 保存後 GET 一致確認 ----
  console.log(`[PUT]    実 PUT 実行（${updateMode ? `update, sha=${remoteSha ? 'あり' : 'なし'}` : 'create-only, sha なし'}）...`);
  const put = await putToShared(sharedPath, rawText, commitMessage, token, updateMode ? remoteSha : null);
  if (!put.ok) { console.log(`[判定]   PUT 失敗 (status ${put.status}${put.error ? ', ' + put.error : ''}${formatGithubError(put.data)}) → 中止`); process.exit(2); }
  const commitSha = put.data?.commit?.sha;
  const contentPath = put.data?.content?.path;
  console.log(`         PUT 成功 status=${put.status}  commit=${commitSha}  content.path=${contentPath}`);
  if (contentPath !== sharedPath) { console.log(`[要手動確認] content.path 不一致: ${contentPath} != ${sharedPath}（PUT は成功済み）`); process.exit(2); }
  const got = await getSharedContent(sharedPath, token);
  if (!got.ok) { console.log(`[要手動確認] 保存後 GET 失敗 (status ${got.status})（PUT は成功済み）`); process.exit(2); }
  let parseOk = true; try { JSON.parse(got.decoded); } catch { parseOk = false; }
  const match = got.decoded === rawText;
  console.log(`[保存後] GET=200  内容一致=${match}  parse可=${parseOk}  sha=${got.sha}`);
  if (!match || !parseOk) { console.log(`[要手動確認] 保存後内容が tmp と一致しない（PUT は成功済み・手動確認必須）`); process.exit(2); }
  console.log(`[dispatch] 発火しない（このスクリプトは dispatch を持たない）`);
  console.log(`[判定]   EXECUTE 成功（1ファイル ${updateMode ? 'update' : 'create-only'} PUT 完了・内容一致確認済み）`);
  process.exit(0);
}

main();
