/**
 * ペア揃いガード
 *
 * 同じ date+venueCode の racebook JSON と computer JSON の両方が
 * keiba-data-shared に存在することを確認する。
 *
 * 背景:
 *   片方しか保存されていない状態で analytics-keiba / keiba-intelligence へ
 *   prediction-updated dispatch を投げると、取込側の ±1日マージで前日の
 *   別 venue データが混入する（2026-05-24 案件）。dispatch 直前に
 *   両方の存在を確認することで、片側だけの状態での発火を防ぐ。
 *
 * 注意:
 *   ファイル存在のみを確認し、中身の date 検証は行わない（取込側で実施）。
 */

const OWNER = process.env.GITHUB_REPO_OWNER || 'apol0510';
const REPO = 'keiba-data-shared';

function authHeaders(token) {
  return token
    ? {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'keiba-data-shared-admin',
      }
    : {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'keiba-data-shared-admin',
      };
}

async function fileExists(path, token) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;
  try {
    const res = await fetch(url, { method: 'GET', headers: authHeaders(token) });
    return res.ok;
  } catch (err) {
    console.warn(`[PairGuard] fileExists エラー (${path}): ${err?.message || err}`);
    return false;
  }
}

/**
 * 同じ date+venueCode の racebook / computer 両方が存在するか確認
 * @param {object} args
 * @param {string} args.date - YYYY-MM-DD
 * @param {string} args.venueCode - 会場コード（KYO/NII/TOK/...、南関は trackCode）
 * @param {string} args.category - 'jra' | 'nankan'
 * @param {string} [args.token] - GitHub token（未指定なら env から解決）
 * @returns {Promise<{ready:boolean, racebook:boolean, computer:boolean, racebookPath:string, computerPath:string}>}
 */
export async function isPairReady({ date, venueCode, category, token }) {
  const t =
    token ||
    process.env.GITHUB_TOKEN_KEIBA_DATA_SHARED ||
    process.env.GITHUB_TOKEN;
  const [year, month] = date.split('-');
  const racebookPath = `${category}/racebook/${year}/${month}/${date}-${venueCode}.json`;
  const computerPath = `${category}/predictions/computer/${year}/${month}/${date}-${venueCode}.json`;

  const [racebook, computer] = await Promise.all([
    fileExists(racebookPath, t),
    fileExists(computerPath, t),
  ]);
  return {
    ready: racebook && computer,
    racebook,
    computer,
    racebookPath,
    computerPath,
  };
}
