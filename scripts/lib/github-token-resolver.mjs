/**
 * scripts/lib/github-token-resolver.mjs
 *
 * keiba-data-shared 用の GitHub token 解決（ローカル実行向け）。
 *
 * 背景:
 *   `GITHUB_TOKEN_KEIBA_DATA_SHARED` が SET でも失効していると 401 になり、
 *   shared push / JRA 過去走 push が毎回停止していた。一方、同じマシンの
 *   `gh auth`（repo/workflow scope）は keiba-data-shared にアクセスできることが多い。
 *   そこで env token が無効なときは `gh auth token` を fallback として検証・採用する。
 *
 * 解決順:
 *   1. env token が SET かつ /user=200 かつ contents/jra=200 → env を採用
 *   2. env token が UNSET / 401 / 403 → 無効扱い
 *   3. gh auth token が取得でき /user=200 かつ contents/jra=200 → gh-auth を採用（ローカル限定）
 *   4. どちらも不可 → ok:false（BLOCKED）
 *
 * 安全方針（厳守）:
 *   - token 実値（env / gh auth token とも）を console に一切出さない。
 *   - token をファイルへ保存しない。
 *   - .zshrc / .env / GitHub Secrets を変更しない。
 *   - GitHub API は read-only GET（/user, contents/jra）のみで検証する。
 *
 * 返り値:
 *   {
 *     ok: boolean,
 *     source: 'env' | 'gh-auth' | null,
 *     token: string | null,            // 値はログに出さないこと（呼び出し側責務）
 *     checks: {
 *       env: { present, userStatus, contentsStatus },
 *       gh:  { available, userStatus, contentsStatus }
 *     },
 *     message: string                  // token 値を含まない説明文
 *   }
 */

import { execFileSync } from 'node:child_process';

const USER_URL = 'https://api.github.com/user';
const CONTENTS_URL = 'https://api.github.com/repos/apol0510/keiba-data-shared/contents/jra';

/** read-only GET。HTTP status のみ返す（token 値は返さない/出さない）。到達不可は 0 */
async function apiStatus(url, token) {
  const headers = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'keiba-token-resolver',
  };
  try {
    const res = await fetch(url, { method: 'GET', headers });
    return res.status;
  } catch {
    return 0; // ネットワーク到達不可（メッセージに token を含めない）
  }
}

/** gh auth token を取得（取得できなければ null）。値は呼び出し側で出さないこと */
function getGhAuthToken() {
  try {
    const out = execFileSync('gh', ['auth', 'token'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    const t = (out || '').trim();
    return t || null;
  } catch {
    return null; // gh 未インストール / 未認証
  }
}

/**
 * keiba-data-shared 用 token を解決する。
 * @param {object} [options]
 * @param {boolean} [options.allowGhFallback=true] gh auth fallback を許可（CI/Netlify では false 推奨）
 * @returns {Promise<{ok:boolean, source:('env'|'gh-auth'|null), token:(string|null), checks:object, message:string}>}
 */
export async function resolveKeibaDataSharedToken(options = {}) {
  const allowGhFallback = options.allowGhFallback !== false; // 既定 true（ローカル運用）
  const checks = {
    env: { present: false, userStatus: null, contentsStatus: null },
    gh: { available: false, userStatus: null, contentsStatus: null },
  };

  // ── 1. env token 検証（診断のため /user と contents/jra を両方とも確認）──
  const envToken = process.env.GITHUB_TOKEN_KEIBA_DATA_SHARED;
  if (envToken && String(envToken).trim()) {
    checks.env.present = true;
    checks.env.userStatus = await apiStatus(USER_URL, envToken);
    checks.env.contentsStatus = await apiStatus(CONTENTS_URL, envToken);
    if (checks.env.userStatus === 200 && checks.env.contentsStatus === 200) {
      return {
        ok: true,
        source: 'env',
        token: envToken,
        checks,
        message: 'using env token (GITHUB_TOKEN_KEIBA_DATA_SHARED)',
      };
    }
  }

  // ── 2/3. env 無効 → gh auth fallback（ローカル限定）──
  if (allowGhFallback) {
    const ghToken = getGhAuthToken();
    if (ghToken) {
      checks.gh.available = true;
      checks.gh.userStatus = await apiStatus(USER_URL, ghToken);
      checks.gh.contentsStatus = await apiStatus(CONTENTS_URL, ghToken);
      if (checks.gh.userStatus === 200 && checks.gh.contentsStatus === 200) {
        const reason = checks.env.present
          ? 'env token invalid, using gh auth fallback'
          : 'env token unset, using gh auth fallback';
        return { ok: true, source: 'gh-auth', token: ghToken, checks, message: reason };
      }
    }
  }

  // ── 4. どちらも不可 ──
  return {
    ok: false,
    source: null,
    token: null,
    checks,
    message: 'no valid token for keiba-data-shared (env invalid/unset, gh auth fallback unavailable)',
  };
}
