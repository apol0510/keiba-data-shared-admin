#!/usr/bin/env node
/**
 * 南関 entries(出馬表) dispatch 専用スクリプト — AK/KI 単発配信（PR-F4d-4）
 *
 * 設計: docs/nankan-horse-detail-display-plan.md §31（F4d 接続方針）
 *
 * shared に保存済みの南関 full venue entries について、analytics-keiba と
 * keiba-intelligence の両方へ repository_dispatch (entries-nankan-updated) を送る専用経路。
 * 受信側 workflow（import-entries-nankan-on-dispatch.yml）が `import:entries:nankan` を実行する。
 *
 *   - shared PUT はしない（PUT は dry-run-aggregate-entries.mjs の --push --execute 責務）。本 script は送信のみ。
 *   - dry-run-aggregate-entries.mjs には dispatch を入れない（保存と送信は分離）。
 *   - 既存 dispatch-recent-horse-histories-nankan.mjs / netlify/lib/dispatch.mjs は変更しない。
 *   - JRA event (horse-histories-updated) / recentHorseHistories event は絶対に使わない。
 *     event は南関 entries 専用 `entries-nankan-updated` で固定（変更不可・定数）。
 *   - full venue 判定 / R01-only skip / record 0埋め reject は受信側 importEntriesNankan.js の
 *     guard に委譲する（本 script は送信ゲートに集中）。
 *
 * 安全方針（多段ゲート。すべて満たした時だけ実送信）:
 *   1. --dispatch が指定されている（opt-in。無ければ常に dry-run・送らない）
 *   2. --dry-run が指定されていない（--dry-run は最優先で実送信を止める）
 *   3. --confirm-dispatch=entries-nankan-updated が完全一致
 *   4. --date が YYYY-MM-DD 形式（必須）
 *   5. --venues が南関コード(OOI/KAW/FUN/URA)・1件以上（必須）
 *   6. 各 venue の shared full venue entries が GET=200 で存在（= 保存済みの確証）
 *   7. ANALYTICS_KEIBA_TOKEN が存在する（値は出さず OK/MISSING のみ）
 *   8. KEIBA_INTELLIGENCE_TOKEN が存在する（値は出さず OK/MISSING のみ）
 *   送信先は AK/KI の 2 repo 固定。payload は単一 date / venues 配列。
 *
 * 使い方:
 *   # dry-run（既定。--dispatch が無ければ常に dry-run・実送信しない）
 *   node scripts/dispatch-entries-nankan.mjs --date 2026-06-10 --venues OOI
 *
 *   # 全ゲート評価しつつ --dry-run で物理的に送信を止める（confirm 一致も確認できる）
 *   node scripts/dispatch-entries-nankan.mjs --date 2026-06-10 --venues OOI \
 *     --dispatch --confirm-dispatch=entries-nankan-updated --dry-run
 *
 *   # 実送信（別許可後・マコさんのターミナルで token を設定して実行）
 *   node scripts/dispatch-entries-nankan.mjs --date 2026-06-10 --venues OOI \
 *     --dispatch --confirm-dispatch=entries-nankan-updated
 *
 *   node scripts/dispatch-entries-nankan.mjs --help
 *
 * 終了コード: GATE FAIL → 2 / SEND 一部失敗 → 2 / 送信中止(ゲート未通過) → 1 / OK(dry-run/送信成功) → 0。
 */

// ── dispatch 契約（南関 entries 専用・JRA / recentHorseHistories とは別 event）──
const DISPATCH_EVENT_TYPE = 'entries-nankan-updated';
const CONFIRM_DISPATCH_REQUIRED = 'entries-nankan-updated';
const DISPATCH_CATEGORY = 'nankan';
const DISPATCH_KIND = 'entries';
const DISPATCH_SOURCE = 'nankan-entries';
const DISPATCH_TARGET_REPOS = ['apol0510/keiba-intelligence', 'apol0510/analytics-keiba'];

// dispatch 用 token（両方必須・フォールバック禁止。値は保持/表示しない）
const TOKEN_ENV_AK = 'ANALYTICS_KEIBA_TOKEN';
const TOKEN_ENV_KI = 'KEIBA_INTELLIGENCE_TOKEN';
const REPO_TOKEN_ENV = {
  'apol0510/keiba-intelligence': TOKEN_ENV_KI,
  'apol0510/analytics-keiba': TOKEN_ENV_AK,
};

// shared 既存確認（保存済みの確証取り）用
const SHARED_REPO = `${process.env.GITHUB_REPO_OWNER || 'apol0510'}/keiba-data-shared`;
const SHARED_BRANCH = 'main';
const SHARED_TOKEN_ENV = 'GITHUB_TOKEN_KEIBA_DATA_SHARED';

const NANKAN_VENUES = ['OOI', 'KAW', 'FUN', 'URA'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const USAGE = `南関 entries dispatch 専用スクリプト (PR-F4d-4)

Usage:
  node scripts/dispatch-entries-nankan.mjs --date YYYY-MM-DD --venues OOI[,FUN] [options]

Options:
  --date <YYYY-MM-DD>           dispatch 対象の開催日。必須
  --venues <CSV>                南関コード(OOI/KAW/FUN/URA)・カンマ区切り。必須
  --dispatch                    実送信を opt-in（無ければ常に dry-run・送らない）
  --confirm-dispatch=<event>    実送信には ${CONFIRM_DISPATCH_REQUIRED} の完全一致が必須（二段階確認）
  --dry-run                     最優先で実送信を止める（全ゲートは評価し送信予定を表示するだけ）
  --help, -h                    このヘルプ

このスクリプトは送信のみ。shared PUT はしない（PUT は dry-run-aggregate-entries.mjs --push --execute）。
event は南関 entries 専用 ${DISPATCH_EVENT_TYPE} で固定（JRA / recentHorseHistories event は使わない）。
送信先は ${DISPATCH_TARGET_REPOS.join(' / ')} の 2 repo（両方の専用 token 必須）。
`;

function parseArgs(argv) {
  const args = { date: null, venues: null, dispatch: false, confirmDispatch: null, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    const eq = raw.includes('=') ? raw.split(/=(.*)/s) : null;
    const k = eq ? eq[0] : raw;
    switch (k) {
      case '--date': args.date = eq ? eq[1] : argv[++i]; break;
      case '--venues': args.venues = eq ? eq[1] : argv[++i]; break;
      case '--dispatch': args.dispatch = true; break;
      case '--confirm-dispatch': args.confirmDispatch = eq ? eq[1] : argv[++i]; break;
      case '--dry-run': args.dryRun = true; break;
      case '--help': case '-h': args.help = true; break;
      default: console.error(`Unknown argument: ${k}`); process.exit(1);
    }
  }
  return args;
}

// token 値は絶対に出さない。存在のみ true/false。
function tokenPresent(envName) {
  const v = process.env[envName];
  return typeof v === 'string' && v.length > 0;
}

function buildSharedPath(date, venue) {
  const [y, m] = date.split('-');
  return `nankan/entries/${y}/${m}/${date}-${venue}.json`;
}

// GitHub API のエラー応答から安全な診断だけ（token / body / content は含めない）。
function formatGithubError(data) {
  const parts = [];
  if (data && typeof data.message === 'string') parts.push(`message: ${data.message}`);
  if (data && typeof data.documentation_url === 'string') parts.push(`documentation_url: ${data.documentation_url}`);
  return parts.length ? ` / ${parts.join(' / ')}` : '';
}

// shared 上に full venue entries が存在するか（GET=200・read-only）。token 無ければ確認不可。
async function checkSharedExists(sharedPath) {
  const token = process.env[SHARED_TOKEN_ENV];
  if (!token) return { checked: false, reason: `${SHARED_TOKEN_ENV} 未設定のため存在確認 GET 未実施` };
  const url = `https://api.github.com/repos/${SHARED_REPO}/contents/${sharedPath}?ref=${SHARED_BRANCH}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'dispatch-entries-nankan' } });
    if (res.status === 200) return { checked: true, exists: true };
    if (res.status === 404) return { checked: true, exists: false, reason: 'shared に未存在' };
    const data = await res.json().catch(() => ({}));
    return { checked: true, exists: null, reason: `想定外ステータス ${res.status}${formatGithubError(data)}` };
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
      'User-Agent': 'dispatch-entries-nankan',
    },
    body: JSON.stringify({ event_type: eventType, client_payload: payload }),
  });
  if (res.status === 204 || res.ok) return { ok: true, status: res.status };
  const data = await res.json().catch(() => ({}));
  throw new Error(`HTTP ${res.status}${formatGithubError(data)}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(USAGE); process.exit(0); }

  const errors = [];

  // ---- 必須引数ゲート ----
  if (!args.date) errors.push('--date YYYY-MM-DD が必要です');
  else if (!DATE_RE.test(args.date)) errors.push(`--date 形式不正（YYYY-MM-DD 期待）: ${args.date}`);

  let venues = [];
  if (!args.venues) {
    errors.push('--venues OOI[,FUN] が必要です');
  } else {
    venues = String(args.venues).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (venues.length === 0) errors.push('--venues に有効な venue がありません');
    const bad = venues.filter((v) => !NANKAN_VENUES.includes(v));
    if (bad.length) errors.push(`未知の南関 venueCode: ${bad.join(',')}（許可: ${NANKAN_VENUES.join('/')}）`);
    const dup = venues.filter((v, i) => venues.indexOf(v) !== i);
    if (dup.length) errors.push(`--venues に重複: ${[...new Set(dup)].join(',')}`);
  }

  // ---- payload 構築（単一 date / venues 配列。updates 配列・複数日一括・sourcePath なし）----
  const payload = (errors.length === 0)
    ? { date: args.date, venues, category: DISPATCH_CATEGORY, kind: DISPATCH_KIND, source: DISPATCH_SOURCE }
    : null;

  // ---- shared 存在確認（保存済みの確証。token 有時のみ・read-only）----
  const sharedChecks = [];
  if (payload) {
    for (const v of venues) {
      const sp = buildSharedPath(args.date, v);
      const r = await checkSharedExists(sp);
      sharedChecks.push({ venue: v, path: sp, ...r });
    }
  }
  const sharedAllExist = sharedChecks.length > 0 && sharedChecks.every((c) => c.checked && c.exists === true);

  // ---- token 存在（値は出さない）----
  const akPresent = tokenPresent(TOKEN_ENV_AK);
  const kiPresent = tokenPresent(TOKEN_ENV_KI);
  const sharedTokenPresent = tokenPresent(SHARED_TOKEN_ENV);

  // ---- confirm 完全一致 ----
  const confirmMatch = args.confirmDispatch === CONFIRM_DISPATCH_REQUIRED;

  // ============================ 出力 ============================
  const wantSend = args.dispatch && !args.dryRun;
  const mode = !args.dispatch ? 'dry-run（--dispatch 無し・常に送らない）'
    : args.dryRun ? 'dry-run（--dry-run 最優先・送らない）'
    : 'SEND（全ゲート通過時のみ実送信）';

  console.log(`=== entries dispatch (${mode}) ===`);
  console.log(`[event]  event_type: ${DISPATCH_EVENT_TYPE}  (固定・JRA/recentHorseHistories event は使わない)`);
  console.log(`[targets]`);
  for (const r of DISPATCH_TARGET_REPOS) console.log(`         - ${r}  (token: ${REPO_TOKEN_ENV[r]})`);
  console.log(`[payload]`);
  if (payload) for (const l of JSON.stringify(payload, null, 2).split('\n')) console.log(`         ${l}`);
  else console.log(`         (引数ゲート不合格のため未構築)`);
  console.log(`         updates配列=なし  複数日一括=なし  sourcePath=なし  単一date/venues=${payload ? 'はい' : '不明'}`);

  if (sharedChecks.length) {
    console.log(`[shared] full venue entries 存在確認（GET・read-only）:`);
    for (const c of sharedChecks) {
      const label = c.checked ? (c.exists === true ? 'OK(200)' : c.exists === false ? 'NG(404)' : `NG(${c.reason})`) : `未確認(${c.reason})`;
      console.log(`         - ${c.venue}: ${label}  ${c.path}`);
    }
  }
  console.log(`[token]  ${TOKEN_ENV_AK}=${akPresent ? 'OK' : 'MISSING'}  ${TOKEN_ENV_KI}=${kiPresent ? 'OK' : 'MISSING'}  ${SHARED_TOKEN_ENV}=${sharedTokenPresent ? 'OK' : 'MISSING'}  ※値は表示しない`);
  console.log(`[confirm] --confirm-dispatch ${confirmMatch ? '一致' : `不一致（指定=${JSON.stringify(args.confirmDispatch)} / 必須=${CONFIRM_DISPATCH_REQUIRED}）`}`);
  for (const e of errors) console.log(`         ✗ GATE: ${e}`);

  // ---- ハードゲート（引数）----
  if (errors.length) { console.log('[判定]   GATE FAIL（送信しない）'); process.exit(2); }

  // ---- 送信可否ゲート集計（実送信は全通過時のみ）----
  const sendGates = [
    ['--dispatch 指定', args.dispatch],
    ['--dry-run 未指定', !args.dryRun],
    [`--confirm-dispatch=${CONFIRM_DISPATCH_REQUIRED} 完全一致`, confirmMatch],
    ['shared full venue entries 存在（全 venue GET=200）', sharedAllExist],
    [`${TOKEN_ENV_AK} 存在`, akPresent],
    [`${TOKEN_ENV_KI} 存在`, kiPresent],
    ['payload 単一date/venues', !!payload],
  ];
  const failedGates = sendGates.filter(([, ok]) => !ok).map(([label]) => label);

  // ---- 非送信モード（dry-run）----
  if (!wantSend) {
    console.log('[dispatch] 送信しない（dry-run）。実送信に必要な残ゲート:');
    if (failedGates.length === 0) console.log('         （なし。--dispatch かつ --dry-run 無し かつ shared存在 かつ token 揃いで実送信可能）');
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
