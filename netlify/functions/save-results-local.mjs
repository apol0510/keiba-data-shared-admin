/**
 * Netlify Function: 地方競馬結果JSONをkeiba-data-sharedリポジトリに保存
 *
 * 機能:
 * - 地方競馬結果JSONを keiba-data-shared/local/results/YYYY/MM/YYYY-MM-DD-{venueCode}.json に保存
 * - GitHub API を使ってコミット・プッシュ
 * - レース番号単位でマージ（既存の同じraceNumberは上書き）
 *
 * 環境変数:
 * - GITHUB_TOKEN_KEIBA_DATA_SHARED: GitHub Personal Access Token (repo権限)
 * - GITHUB_REPO_OWNER: apol0510
 */

export default async (req, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method Not Allowed' }),
      { status: 405, headers }
    );
  }

  try {
    const body = await req.json();
    const { raceDate, venue, venueCode, category, data, forceOverwrite } = body;

    console.log('[save-results-local] リクエスト受信:', {
      raceDate, venue, venueCode, category,
      hasData: !!data,
      totalRaces: data?.totalRaces || 0,
      forceOverwrite
    });

    // バリデーション
    if (!raceDate || !venue || !venueCode || !data) {
      console.error('[save-results-local] 必須フィールド不足:', { raceDate, venue, venueCode, hasData: !!data });
      return new Response(
        JSON.stringify({
          error: 'Missing required fields: raceDate, venue, venueCode, data',
          received: { raceDate, venue, venueCode, hasData: !!data }
        }),
        { status: 400, headers }
      );
    }

    // 環境変数チェック
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN_KEIBA_DATA_SHARED || process.env.GITHUB_TOKEN;
    const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'apol0510';
    const GITHUB_REPO_NAME = 'keiba-data-shared';
    const GITHUB_BRANCH = 'main';

    if (!GITHUB_TOKEN) {
      console.error('[save-results-local] GitHubトークンが設定されていません');
      return new Response(
        JSON.stringify({
          error: 'GITHUB_TOKEN_KEIBA_DATA_SHARED or GITHUB_TOKEN not configured'
        }),
        { status: 500, headers }
      );
    }

    // ファイルパス生成: local/results/YYYY/MM/YYYY-MM-DD-{venueCode}.json
    const useCategory = 'local';
    const year = raceDate.substring(0, 4);
    const month = raceDate.substring(5, 7);
    const fileName = `${raceDate}-${venueCode}.json`;
    const filePath = `${useCategory}/results/${year}/${month}/${fileName}`;

    console.log('[save-results-local] 保存先:', filePath);

    // GitHub API: 既存ファイルを取得
    const getFileUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${filePath}?ref=${GITHUB_BRANCH}`;
    let fileSha = null;
    let existingData = null;

    const getFileResponse = await fetch(getFileUrl, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Netlify-Function'
      }
    });

    if (getFileResponse.ok) {
      const fileData = await getFileResponse.json();
      fileSha = fileData.sha;
      const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
      existingData = JSON.parse(content);
      console.log('[save-results-local] 既存ファイルを検出:', filePath);
    } else if (getFileResponse.status === 404) {
      console.log('[save-results-local] 新規ファイルを作成:', filePath);
    } else {
      const errorText = await getFileResponse.text();
      return new Response(
        JSON.stringify({ error: 'GitHub API error (get file)', details: errorText }),
        { status: getFileResponse.status, headers }
      );
    }

    // マージ処理
    let mergedData;

    if (forceOverwrite || !existingData) {
      mergedData = data;
      console.log('[save-results-local] 完全上書きモード');
    } else {
      // レース番号単位でマージ
      mergedData = { ...existingData };

      if (!mergedData.races) {
        mergedData.races = [];
      }

      // 新しいレースデータの各レースについて、既存から同じレース番号を削除
      if (data.races && data.races.length > 0) {
        data.races.forEach(newRace => {
          const newRaceNum = newRace.raceNumber;
          if (newRaceNum) {
            mergedData.races = mergedData.races.filter(
              race => race.raceNumber !== newRaceNum
            );
          }
        });
        mergedData.races.push(...data.races);
      }

      // レース番号順にソート
      mergedData.races.sort((a, b) => (a.raceNumber || 0) - (b.raceNumber || 0));

      // メタデータ更新
      mergedData.totalRaces = mergedData.races.length;
      mergedData.lastUpdated = new Date().toISOString();
      mergedData.date = data.date;
      mergedData.venue = data.venue;
      mergedData.venueCode = data.venueCode;
      mergedData.category = useCategory;

      console.log(`[save-results-local] マージ完了: ${mergedData.races.length}レース`);
    }

    // GitHub API: ファイルを作成/更新
    const putFileUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${filePath}`;

    const totalRaces = mergedData.totalRaces || (mergedData.races ? mergedData.races.length : 0);
    const commitMessage = `🏇 地方競馬結果データ追加: ${venue} ${totalRaces}レース ${raceDate}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>`;

    const putFileResponse = await fetch(putFileUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Netlify-Function',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: commitMessage,
        content: Buffer.from(JSON.stringify(mergedData, null, 2), 'utf-8').toString('base64'),
        sha: fileSha,
        branch: GITHUB_BRANCH
      })
    });

    if (!putFileResponse.ok) {
      const errorText = await putFileResponse.text();
      console.error('[save-results-local] GitHub API エラー (put file):', {
        status: putFileResponse.status,
        body: errorText
      });
      return new Response(
        JSON.stringify({
          error: 'GitHub API error (put file)',
          status: putFileResponse.status,
          details: errorText,
          path: filePath
        }),
        { status: putFileResponse.status, headers }
      );
    }

    const result = await putFileResponse.json();
    console.log('[save-results-local] 保存成功:', result.content.sha);

    return new Response(
      JSON.stringify({
        success: true,
        path: filePath,
        sha: result.content.sha,
        message: commitMessage,
        url: result.content.html_url
      }),
      { status: 200, headers }
    );

  } catch (error) {
    console.error('[save-results-local] エラー:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: error.message,
        timestamp: new Date().toISOString()
      }),
      { status: 500, headers }
    );
  }
};
