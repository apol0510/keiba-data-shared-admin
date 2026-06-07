#!/usr/bin/env node
/**
 * scripts/check-keiba-env.mjs
 *
 * Keiba 共通 Token / GitHub 権限 readiness 診断（read-only）。
 *
 * 目的:
 *   JRA pipeline（dry-run / shared push / AK・KI import）の実行前に、
 *   必要な token の有無と GitHub API 疎通を「1コマンドで」まとめて確認する。
 *   token 未設定・権限不足で途中で詰まるのを事前に切り分ける。
 *
 * 使い方:
 *   source ~/.zshrc
 *   node scripts/check-keiba-env.mjs
 *
 * 安全方針（厳守）:
 *   - token 実値は一切表示しない（SET/UNSET・HTTP status・OK/NG/SKIPPED/BLOCKED のみ）。
 *   - GitHub API は read-only GET のみ。POST/PUT/dispatch は一切行わない。
 *   - .env / .zshrc / GitHub Secrets を変更しない。
 *   - workflow_dispatch / repository_dispatch を実行しない。
 *
 * exit code:
 *   0 = 全部OK
 *   1 = dry-run可だが import/push の一部が不可または MAYBE
 *   2 = shared push 不可
 *   3 = GitHub API 到達不可・重大エラー
 *   （優先順位: 重大エラー→3 / shared push不可→2 / AK/KI import が NO/MAYBE→1 / 全部OK→0）
 */

import { execFileSync } from 'node:child_process';

const OWNER = 'apol0510';
const GH_API = 'https://api.github.com';

// ───── token は値を出さず SET/UNSET のみ ─────
const TOKENS = {
  GITHUB_TOKEN_KEIBA_DATA_SHARED: process.env.GITHUB_TOKEN_KEIBA_DATA_SHARED,
  KEIBA_INTELLIGENCE_TOKEN: process.env.KEIBA_INTELLIGENCE_TOKEN,
  ANALYTICS_KEIBA_TOKEN: process.env.ANALYTICS_KEIBA_TOKEN,
};
const isSet = (name) => Boolean(TOKENS[name] && String(TOKENS[name]).trim());

/** read-only GET。token 値は返さない。{status, reachable} のみ返す */
async function ghGet(path, token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'check-keiba-env',
    Authorization: `Bearer ${token}`,
  };
  try {
    const res = await fetch(`${GH_API}${path}`, { method: 'GET', headers });
    return { status: res.status, reachable: true };
  } catch (e) {
    // ネットワーク到達不可など（メッセージに token は含めない）
    return { status: 0, reachable: false, error: e?.code || 'NETWORK_ERROR' };
  }
}

const okStr = (status) => (status === 200 ? 'OK' : 'NG');

async function main() {
  console.log('=== Keiba Env Check ===');
  console.log('');

  // ───── [local env] ─────
  console.log('[local env]');
  for (const name of Object.keys(TOKENS)) {
    console.log(`${name}: ${isSet(name) ? 'SET' : 'UNSET'}`);
  }
  // fallback 誤用検知（無印 GITHUB_TOKEN が SET なら注意。値は出さない）
  if (process.env.GITHUB_TOKEN && String(process.env.GITHUB_TOKEN).trim()) {
    console.log('GITHUB_TOKEN: SET (⚠️ fallback 誤用の恐れ・push/dispatch 前に確認)');
  }
  console.log('');

  // 重大エラー検知用フラグ
  let fatalApi = false; // GitHub API 自体に到達不可（reachable=false）

  // ───── [github api: shared] ─────
  console.log('[github api: shared]');
  let sharedUserStatus = null;
  let sharedRepoStatus = null;
  let sharedContentsStatus = null;
  if (isSet('GITHUB_TOKEN_KEIBA_DATA_SHARED')) {
    const tok = TOKENS.GITHUB_TOKEN_KEIBA_DATA_SHARED;
    const u = await ghGet('/user', tok);
    const r = await ghGet(`/repos/${OWNER}/keiba-data-shared`, tok);
    const c = await ghGet(`/repos/${OWNER}/keiba-data-shared/contents/jra`, tok);
    sharedUserStatus = u.status;
    sharedRepoStatus = r.status;
    sharedContentsStatus = c.status;
    if (!u.reachable || !r.reachable || !c.reachable) fatalApi = true;
    console.log(`/user: ${u.reachable ? u.status : 'UNREACHABLE'} ${u.reachable ? okStr(u.status) : 'NG'}`);
    console.log(`keiba-data-shared repo: ${r.reachable ? r.status : 'UNREACHABLE'} ${r.reachable ? okStr(r.status) : 'NG'}`);
    console.log(`keiba-data-shared contents/jra: ${c.reachable ? c.status : 'UNREACHABLE'} ${c.reachable ? okStr(c.status) : 'NG'}`);
  } else {
    console.log('SKIPPED token UNSET (GITHUB_TOKEN_KEIBA_DATA_SHARED)');
  }
  console.log('');

  // ───── [github api: AK/KI] ─────
  console.log('[github api: AK/KI]');
  // analytics-keiba
  let akUserStatus = null;
  let akRepoStatus = null;
  if (isSet('ANALYTICS_KEIBA_TOKEN')) {
    const tok = TOKENS.ANALYTICS_KEIBA_TOKEN;
    const u = await ghGet('/user', tok);
    const r = await ghGet(`/repos/${OWNER}/analytics-keiba`, tok);
    akUserStatus = u.status;
    akRepoStatus = r.status;
    if (!u.reachable || !r.reachable) fatalApi = true;
    console.log(`analytics-keiba /user: ${u.reachable ? u.status : 'UNREACHABLE'} ${u.reachable ? okStr(u.status) : 'NG'}`);
    console.log(`analytics-keiba repo: ${r.reachable ? r.status : 'UNREACHABLE'} ${r.reachable ? okStr(r.status) : 'NG'}`);
  } else {
    console.log('analytics-keiba: SKIPPED token UNSET (ANALYTICS_KEIBA_TOKEN)');
  }
  // keiba-intelligence
  let kiUserStatus = null;
  let kiRepoStatus = null;
  if (isSet('KEIBA_INTELLIGENCE_TOKEN')) {
    const tok = TOKENS.KEIBA_INTELLIGENCE_TOKEN;
    const u = await ghGet('/user', tok);
    const r = await ghGet(`/repos/${OWNER}/keiba-intelligence`, tok);
    kiUserStatus = u.status;
    kiRepoStatus = r.status;
    if (!u.reachable || !r.reachable) fatalApi = true;
    console.log(`keiba-intelligence /user: ${u.reachable ? u.status : 'UNREACHABLE'} ${u.reachable ? okStr(u.status) : 'NG'}`);
    console.log(`keiba-intelligence repo: ${r.reachable ? r.status : 'UNREACHABLE'} ${r.reachable ? okStr(r.status) : 'NG'}`);
  } else {
    console.log('keiba-intelligence: SKIPPED token UNSET (KEIBA_INTELLIGENCE_TOKEN)');
  }
  console.log('');

  // ───── [gh auth] ─────
  console.log('[gh auth]');
  let ghAuthOk = false;
  let ghAuth = 'NG';
  try {
    // gh auth status は token 値を出さない（hostname/scope のみ）。失敗しても重大エラー扱いしない。
    execFileSync('gh', ['auth', 'status'], { stdio: 'ignore' });
    ghAuthOk = true;
    ghAuth = 'OK';
  } catch (e) {
    if (e && (e.code === 'ENOENT')) {
      ghAuth = 'NOT_AVAILABLE'; // gh 未インストール
    } else {
      ghAuth = 'NG'; // gh はあるが未認証
    }
  }
  console.log(`gh auth: ${ghAuth}`);
  console.log('');

  // ───── [pipeline readiness] ─────
  // READY_FOR_DRY_RUN: token不要 → 常に YES
  const readyDryRun = 'YES';

  // READY_FOR_SHARED_PUSH: shared token SET かつ /user=200 かつ contents/jra=200
  const sharedPushReady =
    isSet('GITHUB_TOKEN_KEIBA_DATA_SHARED') &&
    sharedUserStatus === 200 &&
    sharedContentsStatus === 200;
  const readySharedPush = sharedPushReady ? 'YES' : 'NO';

  // READY_FOR_AK_IMPORT / READY_FOR_KI_IMPORT:
  //   YES   = token SET かつ repo API 200
  //   MAYBE = token UNSET だが gh auth OK（workflow_dispatch は発火しないと完全確認不可）
  //   NO    = token も gh auth も無し
  const importReadiness = (tokenSet, repoStatus) => {
    if (tokenSet && repoStatus === 200) return 'YES';
    if (ghAuthOk) return 'MAYBE';
    return 'NO';
  };
  const readyAk = importReadiness(isSet('ANALYTICS_KEIBA_TOKEN'), akRepoStatus);
  const readyKi = importReadiness(isSet('KEIBA_INTELLIGENCE_TOKEN'), kiRepoStatus);

  // READY_FOR_AK_KI_IMPORT: 両方YES→YES / どちらかNO→NO / それ以外（MAYBE混在）→MAYBE
  let readyAkKi;
  if (readyAk === 'YES' && readyKi === 'YES') readyAkKi = 'YES';
  else if (readyAk === 'NO' || readyKi === 'NO') readyAkKi = 'NO';
  else readyAkKi = 'MAYBE';

  console.log('[pipeline readiness]');
  console.log(`READY_FOR_DRY_RUN: ${readyDryRun}`);
  console.log(`READY_FOR_SHARED_PUSH: ${readySharedPush}`);
  console.log(`READY_FOR_AK_IMPORT: ${readyAk}`);
  console.log(`READY_FOR_KI_IMPORT: ${readyKi}`);
  console.log(`READY_FOR_AK_KI_IMPORT: ${readyAkKi}`);
  if (readyAk === 'MAYBE' || readyKi === 'MAYBE' || readyAkKi === 'MAYBE') {
    console.log('  note: MAYBE = token UNSET だが gh auth OK。workflow_dispatch は実際に発火しないと完全な権限確認はできないため MAYBE。');
  }
  console.log('');

  // ───── [result] / exit code ─────
  // 優先順位: 重大エラー→3 / shared push不可→2 / AK/KI import が NO/MAYBE→1 / 全部OK→0
  let code;
  if (fatalApi) {
    code = 3;
  } else if (!sharedPushReady) {
    code = 2;
  } else if (readyAkKi !== 'YES') {
    code = 1;
  } else {
    code = 0;
  }

  console.log('[result]');
  console.log(`exit code: ${code}`);
  process.exit(code);
}

main().catch((e) => {
  // 想定外の重大エラー（token 値は含めない）
  console.error(`[fatal] ${e?.message || 'unknown error'}`);
  process.exit(3);
});
