/**
 * repository_dispatch 共通ヘルパー
 *
 * keiba-intelligence と analytics-keiba の両方へ並列送信する。
 * Netlify Functions は handler return 直後にコンテナを freeze するため、
 * 呼び出し側で必ず await してから return すること。
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
 * 単一リポジトリへの dispatch 送信
 * @returns {Promise<{repo:string, ok:boolean, status?:number, skipped?:boolean, error?:string}>}
 */
export async function dispatchToRepo(repo, eventType, payload, token) {
  if (!token) {
    console.warn(`⚠️ dispatch skip: token未設定 (repo: ${repo}, event_type: ${eventType})`);
    return { repo, ok: false, skipped: true, error: 'token未設定' };
  }
  const url = `https://api.github.com/repos/${OWNER}/${repo}/dispatches`;
  const summary = payloadSummary(payload);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ event_type: eventType, client_payload: payload }),
    });
    if (res.ok) {
      console.log(`✅ dispatch成功: repo=${repo} event_type=${eventType} status=${res.status} ${summary}`);
      return { repo, ok: true, status: res.status };
    }
    const text = await res.text().catch(() => '');
    console.error(`❌ dispatch失敗: repo=${repo} event_type=${eventType} status=${res.status} body=${text}`);
    return { repo, ok: false, status: res.status, error: text || `HTTP ${res.status}` };
  } catch (err) {
    console.error(`❌ dispatchエラー: repo=${repo} event_type=${eventType} message=${err?.message || err}`);
    return { repo, ok: false, error: err?.message || String(err) };
  }
}

/**
 * keiba-intelligence と analytics-keiba の両方へ並列 dispatch。
 * 両方の fetch 完了を待ってから resolve する（Netlify freeze 対策）。
 * @returns {Promise<{triggered:string[], results:Array}>}
 */
export async function dispatchToTargets(eventType, payload) {
  const targets = resolveTargets();
  const results = await Promise.all(
    targets.map(({ repo, token }) => dispatchToRepo(repo, eventType, payload, token))
  );
  const triggered = results.filter(r => !r.skipped).map(r => r.repo);
  return { triggered, results };
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
