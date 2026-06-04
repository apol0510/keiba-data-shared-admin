#!/usr/bin/env node
/**
 * shared write 検証スクリプト — GITHUB_TOKEN_KEIBA_DATA_SHARED の Contents write 実効確認
 *
 * 設計: docs/cross-project-safety-rules.md「本番 shared PUT 復旧ゲート」項目3
 *
 * 目的:
 *   `GITHUB_TOKEN_KEIBA_DATA_SHARED` が apol0510/keiba-data-shared へ
 *   Contents API で **書き込みできるか**を、本番データと無関係な throwaway path で確認する。
 *   既存の push-recent-horse-histories.mjs は既存ファイルで create-only が手前で止まり
 *   write まで到達しないため、別経路で write→cleanup を一巡させて実効権限を確定する。
 *
 * 安全方針:
 *   - 書込先は `diagnostics/shared-put/<timestamp>.json` のみ（PATH_RE で固定）。
 *   - 本番 namespace（nankan / jra / local / parser / recentHorseHistories 等）へは絶対に書かない（逆ガード）。
 *   - --dry-run 既定ON。--execute がある時だけ PUT→GET→DELETE→GET を実行する。
 *   - token 値 / Authorization / base64 content / request body は一切表示しない。
 *   - 失敗時は GitHub API の message / documentation_url のみ whitelist 表示する。
 *
 * 使い方:
 *   node scripts/verify-shared-write.mjs            # dry-run（計画表示のみ・PUTしない）
 *   node scripts/verify-shared-write.mjs --execute  # 実検証（PUT→GET→DELETE→GET）。GITHUB_TOKEN_KEIBA_DATA_SHARED 必須
 *   node scripts/verify-shared-write.mjs --help
 */

const REPO = 'apol0510/keiba-data-shared';
const BRANCH = 'main';
const TOKEN_ENV = 'GITHUB_TOKEN_KEIBA_DATA_SHARED';
const UA = 'verify-shared-write';

// 書込先ホワイトリスト（これ以外は即中止）
const PATH_RE = /^diagnostics\/shared-put\/[0-9T-]+Z\.json$/;
// 本番データ namespace 逆ガード（含まれていたら即中止）
const FORBIDDEN_SUBSTR = [
  'nankan/', 'jra/', 'local/', 'parser/', 'admin-tools/',
  'recentHorseHistories', 'racebook', 'results', 'predictions',
];

const USAGE = `shared write 検証スクリプト（throwaway path で Contents write 実効確認）

Usage:
  node scripts/verify-shared-write.mjs [--execute]

Options:
  --dry-run   計画表示のみ・PUT/DELETE しない（既定ON）
  --execute   実検証（PUT create-only → GET → DELETE → GET 404）。${TOKEN_ENV} 必須
              --dry-run 同時指定時は dry-run 優先で実行しない
  --help, -h  このヘルプ

書込先は diagnostics/shared-put/<timestamp>.json のみ。本番 namespace へは書かない。
token 値 / Authorization / base64 content は表示しない。失敗時は message / documentation_url のみ表示。
`;

// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { execute: false, dryRunExplicit: false, help: false };
  for (const raw of argv) {
    switch (raw) {
      case '--execute': args.execute = true; break;
      case '--dry-run': args.dryRunExplicit = true; break;
      case '--help': case '-h': args.help = true; break;
      default: console.error(`Unknown argument: ${raw}`); process.exit(1);
    }
  }
  return args;
}

// GitHub API のエラー応答から安全な診断情報だけを抜き出す（whitelist）。
// token / Authorization / request body / base64 content は絶対に含めない。
function formatGithubError(data) {
  const parts = [];
  if (data && typeof data.message === 'string') parts.push(`message: ${data.message}`);
  if (data && typeof data.documentation_url === 'string') parts.push(`documentation_url: ${data.documentation_url}`);
  return parts.length ? ` / ${parts.join(' / ')}` : '';
}

// PATH_RE 一致 + 逆ガードの二重チェック
function pathIsSafe(p) {
  if (!PATH_RE.test(p)) return { ok: false, reason: `PATH_RE 不一致（diagnostics/shared-put/<timestamp>.json のみ許可）: ${p}` };
  for (const bad of FORBIDDEN_SUBSTR) {
    if (p.includes(bad)) return { ok: false, reason: `本番 namespace 逆ガードに抵触（"${bad}" を含む）: ${p}` };
  }
  return { ok: true };
}

// ファイル名安全な timestamp（ISO の `:` と ミリ秒を除去）。例: 2026-06-05T011500Z
function safeTimestamp() {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '');
}

async function ghFetch(method, sharedPath, token, body) {
  const url = `https://api.github.com/repos/${REPO}/contents/${sharedPath}${method === 'GET' ? `?ref=${BRANCH}` : ''}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': UA };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(USAGE); process.exit(0); }

  const doExecute = args.execute && !args.dryRunExplicit;
  const token = process.env[TOKEN_ENV];

  const sharedPath = `diagnostics/shared-put/${safeTimestamp()}.json`;
  const safe = pathIsSafe(sharedPath);

  const verifyBody = {
    purpose: 'shared-put-write-verification',
    safe: true,
    repository: REPO,
  };
  const rawText = JSON.stringify(verifyBody, null, 2) + '\n';

  const mode = doExecute ? 'execute' : 'dry-run';
  console.log(`=== shared write 検証 (${mode}) ===`);
  console.log(`[保存先] repository: ${REPO}`);
  console.log(`         branch    : ${BRANCH}`);
  console.log(`         path      : ${sharedPath}`);
  console.log(`[安全]   PATH_RE一致=${PATH_RE.test(sharedPath)}  逆ガード=${safe.ok ? 'OK' : 'NG'}`);
  console.log(`[token]  ${TOKEN_ENV} ${token ? 'あり' : 'なし'}${doExecute ? '（execute 必須）' : '（dry-run では任意）'}`);
  console.log(`[計画]   PUT create-only → GET verify → DELETE cleanup → GET 404 verify`);
  if (args.execute && args.dryRunExplicit) console.log(`[mode]   --dry-run と --execute 同時指定 → dry-run 優先で実行しない`);

  // ---- 安全ガード ----
  if (!safe.ok) { console.log(`[判定]   GATE FAIL: ${safe.reason}`); process.exit(2); }

  // ---- dry-run ----
  if (!doExecute) {
    console.log(`[PUT]    実行しない（${args.execute && args.dryRunExplicit ? 'dry-run 優先' : 'dry-run'}）`);
    console.log(`[判定]   PASS（dry-run・write検証計画のみ。実行は --execute）`);
    process.exit(0);
  }

  // ---- execute: token 必須 ----
  if (!token) { console.log(`[判定]   ${TOKEN_ENV} 未設定 → execute 中止`); process.exit(1); }

  // ① PUT create-only（sha なし）
  console.log(`[PUT]    create-only 実行...`);
  const put = await ghFetch('PUT', sharedPath, token, {
    message: 'verify shared write (throwaway diagnostic)',
    content: Buffer.from(rawText, 'utf8').toString('base64'),
    branch: BRANCH,
  });
  if (put.status !== 201 && put.status !== 200) {
    console.log(`[PUT]    失敗 (status ${put.status}${formatGithubError(put.data)})`);
    console.log(`[判定]   WRITE 不可 → ${TOKEN_ENV} の Contents write 権限を確認すること`);
    process.exit(2);
  }
  const contentSha = put.data?.content?.sha;
  console.log(`[PUT]    成功 status=${put.status}  content.sha=${contentSha}`);

  // ② GET verify
  const got = await ghFetch('GET', sharedPath, token);
  const decoded = got.status === 200 ? Buffer.from(got.data.content || '', 'base64').toString('utf8') : null;
  const match = decoded === rawText;
  console.log(`[GET]    status=${got.status}  内容一致=${match}`);

  // ③ DELETE cleanup（PUT 応答 or GET 応答の sha を使用）
  const sha = got.data?.sha || contentSha;
  let cleaned = false;
  if (sha) {
    const del = await ghFetch('DELETE', sharedPath, token, {
      message: 'cleanup verify shared write (throwaway diagnostic)',
      sha,
      branch: BRANCH,
    });
    if (del.status === 200) { cleaned = true; console.log(`[DELETE] 成功 status=${del.status}`); }
    else console.log(`[DELETE] 失敗 (status ${del.status}${formatGithubError(del.data)}) → 手動削除が必要: ${sharedPath}`);
  } else {
    console.log(`[DELETE] sha 取得不可のため未実行 → 手動削除が必要: ${sharedPath}`);
  }

  // ④ GET 404 cleanup verify
  if (cleaned) {
    const after = await ghFetch('GET', sharedPath, token);
    console.log(`[GET2]   status=${after.status}（404=cleanup 確認）`);
    if (after.status !== 404) console.log(`[要確認] cleanup 後も残存の可能性: ${sharedPath}`);
  }

  // ---- 総合判定 ----
  if ((put.status === 201 || put.status === 200) && match && cleaned) {
    console.log(`[判定]   WRITE 検証成功（PUT 201 → GET 一致 → DELETE → 404）。復旧ゲート項目3クリア`);
    process.exit(0);
  }
  console.log(`[判定]   要確認（PUT=${put.status} / GET一致=${match} / cleaned=${cleaned}）。残骸があれば手動削除`);
  process.exit(2);
}

main();
