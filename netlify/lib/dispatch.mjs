/**
 * repository_dispatch 共通ヘルパー
 *
 * keiba-intelligence と analytics-keiba の両方へ並列送信する。
 * 非同期 fire-and-forget（await 不要）。片方の失敗は他方に影響しない。
 */

const OWNER = process.env.GITHUB_REPO_OWNER || 'apol0510';

/**
 * dispatch 送信先定義
 * トークンは analytics-keiba のみ ANALYTICS_KEIBA_TOKEN を優先し、
 * 未設定なら KEIBA_INTELLIGENCE_TOKEN にフォールバック。
 */
function resolveTargets() {
  const intelligenceToken =
    process.env.KEIBA_INTELLIGENCE_TOKEN ||
    process.env.GITHUB_TOKEN_KEIBA_DATA_SHARED;
  const analyticsToken =
    process.env.ANALYTICS_KEIBA_TOKEN ||
    process.env.KEIBA_INTELLIGENCE_TOKEN ||
    process.env.GITHUB_TOKEN_KEIBA_DATA_SHARED;

  return [
    { repo: 'keiba-intelligence', token: intelligenceToken },
    { repo: 'analytics-keiba', token: analyticsToken },
  ];
}

/**
 * 単一リポジトリへの dispatch 送信（fire-and-forget）
 * @returns {boolean} 送信を試みたか（トークンがあれば true）
 */
export function dispatchToRepo(repo, eventType, payload, token) {
  if (!token) {
    console.warn(`⚠️ dispatch skip: token未設定 (repo: ${repo}, event_type: ${eventType})`);
    return false;
  }
  const url = `https://api.github.com/repos/${OWNER}/${repo}/dispatches`;
  fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ event_type: eventType, client_payload: payload }),
  })
    .then(async (res) => {
      const summary = payloadSummary(payload);
      if (res.ok) {
        console.log(`✅ dispatch成功: repo=${repo} event_type=${eventType} ${summary}`);
      } else {
        const text = await res.text().catch(() => '');
        console.error(`❌ dispatch失敗: repo=${repo} event_type=${eventType} status=${res.status} body=${text}`);
      }
    })
    .catch((err) => {
      console.error(`❌ dispatchエラー: repo=${repo} event_type=${eventType} message=${err?.message || err}`);
    });
  return true;
}

/**
 * keiba-intelligence と analytics-keiba の両方へ並列 dispatch
 * @returns {{triggered: string[]}} 実際に送信を試みた repo 名のリスト
 */
export function dispatchToTargets(eventType, payload) {
  const targets = resolveTargets();
  const triggered = [];
  for (const { repo, token } of targets) {
    if (dispatchToRepo(repo, eventType, payload, token)) {
      triggered.push(repo);
    }
  }
  return { triggered };
}

function payloadSummary(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const keys = ['date', 'venue', 'venueCode', 'track', 'trackCode', 'category'];
  const parts = [];
  for (const k of keys) {
    if (payload[k] !== undefined && payload[k] !== null && payload[k] !== '') {
      parts.push(`${k}=${payload[k]}`);
    }
  }
  return parts.join(' ');
}
