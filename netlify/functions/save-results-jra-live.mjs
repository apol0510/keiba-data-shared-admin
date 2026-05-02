/**
 * Netlify Function: JRA速報結果JSONをkeiba-data-sharedに保存 + dispatch送信
 *
 * 通常の jra/results/ (確定データ) と分離するため jra/live-results/ に保存する。
 * 1日1ファイル (YYYY-MM-DD.json) で全 venues 集約済み。
 * 上書き前提なのでマージロジックは無い (live は常に最新が正義)。
 *
 * Endpoint: POST /api/save-results-jra-live  (or netlify.toml で別 path)
 *
 * Request body:
 *   {
 *     "liveResultsJSON": "<JSON string>"   // scrape-live-results.mjs の出力をそのまま渡す
 *   }
 *
 *   liveResultsJSON の中身:
 *     { date, live, fetchedAt, source, venues: [...] }
 *
 * Response:
 *   { success: true, filePath, commitUrl, dispatchTriggered: [...] }
 *
 * 環境変数:
 * - GITHUB_TOKEN_KEIBA_DATA_SHARED: keiba-data-shared の repo 権限
 * - KEIBA_INTELLIGENCE_TOKEN / ANALYTICS_KEIBA_TOKEN: dispatch 用 (dispatch.mjs参照)
 */

import { dispatchToTargets } from '../lib/dispatch.mjs';

export default async (req, _context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers });
  }

  try {
    const body = await req.json();
    const { liveResultsJSON } = body;

    if (!liveResultsJSON) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: liveResultsJSON' }),
        { status: 400, headers }
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(liveResultsJSON);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON', message: e.message }),
        { status: 400, headers }
      );
    }

    const { date, venues, live } = parsed;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON: missing or malformed date' }),
        { status: 400, headers }
      );
    }
    if (!Array.isArray(venues) || venues.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON: venues must be non-empty array' }),
        { status: 400, headers }
      );
    }
    // safety: live フラグが立っていることを軽く確認 (将来確定データ誤投入を防ぐ)
    if (live !== true) {
      console.warn('[save-results-jra-live] WARN: live フラグが true 以外。live専用エンドポイントなので拒否。');
      return new Response(
        JSON.stringify({ error: 'liveResultsJSON.live must be true (このエンドポイントは速報専用)' }),
        { status: 400, headers }
      );
    }

    const GITHUB_TOKEN = process.env.GITHUB_TOKEN_KEIBA_DATA_SHARED || process.env.GITHUB_TOKEN;
    const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'apol0510';
    const GITHUB_REPO_NAME = 'keiba-data-shared';
    const GITHUB_BRANCH = 'main';

    if (!GITHUB_TOKEN) {
      return new Response(
        JSON.stringify({
          error: 'GITHUB_TOKEN_KEIBA_DATA_SHARED or GITHUB_TOKEN not configured',
          hint: 'Netlify環境変数を設定してください',
        }),
        { status: 500, headers }
      );
    }

    // ── ファイルパス: jra/live-results/YYYY/MM/YYYY-MM-DD.json (1日1ファイル) ──
    const year = date.substring(0, 4);
    const month = date.substring(5, 7);
    const filePath = `jra/live-results/${year}/${month}/${date}.json`;

    // 既存 SHA 取得 (上書き対応)
    let fileSha = null;
    const getFileUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${filePath}?ref=${GITHUB_BRANCH}`;
    const getFileRes = await fetch(getFileUrl, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Netlify-Function',
      },
    });
    if (getFileRes.ok) {
      const fileData = await getFileRes.json();
      fileSha = fileData.sha;
    }

    // 統計用
    const totalRaces = venues.reduce((sum, v) => sum + (v.races?.length || 0), 0);
    const venueSummary = venues.map(v => `${v.venueName}(${v.races?.length || 0}R)`).join(', ');

    const commitMessage = `📡 ${date} JRA速報結果 ${fileSha ? '更新' : '追加'}

【live-results】
- 開催日: ${date}
- venues: ${venueSummary}
- レース数: ${totalRaces}R
- ファイル: ${filePath}
- ソース: ${parsed.source || 'unknown'}
- 注意: 速報データ。確定データは jra/results/ に別途保存される

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>`;

    const putUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${filePath}`;
    const putRes = await fetch(putUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Netlify-Function',
      },
      body: JSON.stringify({
        message: commitMessage,
        content: Buffer.from(JSON.stringify(parsed, null, 2), 'utf-8').toString('base64'),
        branch: GITHUB_BRANCH,
        ...(fileSha && { sha: fileSha }),
      }),
    });

    if (!putRes.ok) {
      const errorData = await putRes.json().catch(() => ({}));
      console.error('[save-results-jra-live] GitHub API Error:', errorData);
      return new Response(
        JSON.stringify({
          error: 'Failed to commit to GitHub',
          details: errorData,
          hint: 'GITHUB_TOKEN_KEIBA_DATA_SHARED の repo 権限を確認してください',
        }),
        { status: 500, headers }
      );
    }
    const result = await putRes.json();

    // ── dispatch: keiba-intelligence + analytics-keiba 並列送信 ──
    const { triggered, results: dispatchResults } = await dispatchToTargets('jra-live-results-updated', {
      date,
      type: 'jra-live-results',
      source: parsed.source || 'unknown',
      racesAvailable: totalRaces,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `${date} の速報結果を keiba-data-shared/${filePath} に保存しました`,
        filePath,
        commitUrl: result.commit?.html_url,
        commitSha: result.commit?.sha,
        rawUrl: `https://raw.githubusercontent.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/${GITHUB_BRANCH}/${filePath}`,
        venues: venues.length,
        totalRaces,
        dispatchTriggered: triggered,
        dispatchResults,
      }),
      { status: 200, headers }
    );
  } catch (error) {
    console.error('[save-results-jra-live] Error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      }),
      { status: 500, headers }
    );
  }
};
