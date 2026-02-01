/**
 * Netlify Function: 予想JSONをkeiba-data-sharedリポジトリに保存
 *
 * 機能:
 * - 予想JSONを keiba-data-shared/nankan/predictions/YYYY/MM/ に保存
 * - GitHub API を使ってコミット・プッシュ
 * - 複数サイトで予想データ共有
 *
 * 環境変数:
 * - GITHUB_TOKEN_KEIBA_DATA_SHARED: GitHub Personal Access Token (repo権限)
 * - GITHUB_REPO_OWNER: apol0510
 */

export default async (req, context) => {
  // CORSヘッダー設定
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // OPTIONSリクエスト対応（CORS preflight）
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  // POSTリクエストのみ許可
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method Not Allowed' }),
      { status: 405, headers }
    );
  }

  try {
    // リクエストボディをパース
    const body = await req.json();
    const { raceDate, track, raceNumber, data, forceOverwrite } = body;

    console.log('[save-predictions] リクエスト受信:', {
      raceDate,
      track,
      raceNumber,
      hasData: !!data,
      dataSize: data ? JSON.stringify(data).length : 0,
      forceOverwrite
    });

    // バリデーション（raceNumberはオプショナル：一括入力対応）
    if (!raceDate || !track || !data) {
      console.error('[save-predictions] 必須フィールド不足:', { raceDate, track, raceNumber, hasData: !!data });
      return new Response(
        JSON.stringify({
          error: 'Missing required fields: raceDate, track, data',
          received: { raceDate, track, raceNumber, hasData: !!data }
        }),
        { status: 400, headers }
      );
    }

    // 一括入力モードかどうかを判定
    const isBatchMode = !raceNumber;
    console.log(`[save-predictions] モード: ${isBatchMode ? '一括入力' : '個別入力'}`);

    // 環境変数チェック
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN_KEIBA_DATA_SHARED || process.env.GITHUB_TOKEN;
    const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'apol0510';
    const GITHUB_REPO_NAME = 'keiba-data-shared';
    const GITHUB_BRANCH = 'main';

    console.log('[save-predictions] 環境変数チェック:', {
      hasToken: !!GITHUB_TOKEN,
      tokenLength: GITHUB_TOKEN ? GITHUB_TOKEN.length : 0,
      owner: GITHUB_REPO_OWNER,
      repo: GITHUB_REPO_NAME
    });

    if (!GITHUB_TOKEN) {
      console.error('[save-predictions] GitHubトークンが設定されていません');
      return new Response(
        JSON.stringify({
          error: 'GITHUB_TOKEN_KEIBA_DATA_SHARED or GITHUB_TOKEN not configured',
          hint: 'Netlify環境変数を設定してください',
          availableEnvVars: Object.keys(process.env).filter(k => k.includes('GITHUB'))
        }),
        { status: 500, headers }
      );
    }

    // ファイルパス生成（例: nankan/predictions/2026/01/2026-01-30.json）
    const year = raceDate.substring(0, 4);
    const month = raceDate.substring(5, 7);
    const fileName = `${raceDate}.json`;
    const filePath = `nankan/predictions/${year}/${month}/${fileName}`;

    // GitHub API: 既存ファイルを取得してマージ
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

      // 既存ファイルをデコード
      const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
      existingData = JSON.parse(content);

      console.log('[save-predictions] 既存ファイルを検出:', filePath);
    } else if (getFileResponse.status === 404) {
      console.log('[save-predictions] 新規ファイルを作成:', filePath);
    } else {
      const errorText = await getFileResponse.text();
      return new Response(
        JSON.stringify({
          error: 'GitHub API error (get file)',
          details: errorText
        }),
        { status: getFileResponse.status, headers }
      );
    }

    // マージ処理
    let mergedData;

    if (forceOverwrite || !existingData) {
      // 完全上書き
      mergedData = data;
      console.log('[save-predictions] 完全上書きモード');
    } else if (isBatchMode) {
      // 一括入力モード：既存データに全レース分をマージ
      mergedData = { ...existingData };

      if (!mergedData.races) {
        mergedData.races = [];
      }

      // 新しいレースデータの各レースについて、既存データから同じレース番号を削除
      if (data.races && data.races.length > 0) {
        data.races.forEach(newRace => {
          const newRaceNum = newRace.raceInfo?.raceNumber;
          if (newRaceNum) {
            mergedData.races = mergedData.races.filter(
              race => race.raceInfo?.raceNumber !== newRaceNum
            );
          }
        });

        // 全ての新しいレースを追加
        mergedData.races.push(...data.races);
      }

      // レース番号順にソート
      mergedData.races.sort((a, b) => {
        const raceNumA = a.raceInfo?.raceNumber || '';
        const raceNumB = b.raceInfo?.raceNumber || '';
        const numA = parseInt(raceNumA.replace('R', ''), 10) || 0;
        const numB = parseInt(raceNumB.replace('R', ''), 10) || 0;
        return numA - numB;
      });

      // totalRacesを更新
      mergedData.totalRaces = mergedData.races.length;
      mergedData.lastUpdated = new Date().toISOString();
      mergedData.raceDate = data.raceDate;
      mergedData.track = data.track;

      console.log(`[save-predictions] 一括マージ完了: ${mergedData.races.length}レース`);
    } else {
      // 個別入力モード（既存の動作）
      mergedData = { ...existingData };

      // racesリストをマージ
      if (!mergedData.races) {
        mergedData.races = [];
      }

      // 同じレース番号の既存データを削除
      mergedData.races = mergedData.races.filter(
        race => race.raceInfo?.raceNumber !== raceNumber
      );

      // 新しいレースデータを追加
      if (data.races && data.races.length > 0) {
        mergedData.races.push(...data.races);
      }

      // レース番号順にソート
      mergedData.races.sort((a, b) => {
        const raceNumA = a.raceInfo?.raceNumber || '';
        const raceNumB = b.raceInfo?.raceNumber || '';
        const numA = parseInt(raceNumA.replace('R', ''), 10) || 0;
        const numB = parseInt(raceNumB.replace('R', ''), 10) || 0;
        return numA - numB;
      });

      // totalRacesを更新
      mergedData.totalRaces = mergedData.races.length;
      mergedData.lastUpdated = new Date().toISOString();

      console.log(`[save-predictions] 個別マージ完了: ${mergedData.races.length}レース`);
    }

    // GitHub API: ファイルを作成/更新
    const putFileUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${filePath}`;

    const commitMessage = isBatchMode
      ? `✨ 予想データ一括追加: ${track} ${mergedData.totalRaces}レース ${raceDate}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>`
      : `✨ 予想データ追加: ${track} ${raceNumber} ${raceDate}

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
        sha: fileSha, // 既存ファイルがある場合のみ
        branch: GITHUB_BRANCH
      })
    });

    if (!putFileResponse.ok) {
      const errorText = await putFileResponse.text();
      console.error('[save-predictions] GitHub API エラー (put file):', {
        status: putFileResponse.status,
        statusText: putFileResponse.statusText,
        body: errorText
      });
      return new Response(
        JSON.stringify({
          error: 'GitHub API error (put file)',
          status: putFileResponse.status,
          statusText: putFileResponse.statusText,
          details: errorText,
          path: filePath
        }),
        { status: putFileResponse.status, headers }
      );
    }

    const result = await putFileResponse.json();

    console.log('[save-predictions] 保存成功:', result.content.sha);

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
    console.error('[save-predictions] エラー:', error);
    console.error('[save-predictions] スタック:', error.stack);

    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        timestamp: new Date().toISOString()
      }),
      { status: 500, headers }
    );
  }
};
