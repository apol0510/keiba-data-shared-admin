/**
 * Netlify Function: 結果JSONをkeiba-data-sharedリポジトリに保存
 *
 * 機能:
 * - 結果JSONを keiba-data-shared/nankan/results/YYYY/MM/ に保存
 * - GitHub API を使ってコミット・プッシュ
 * - 全プロジェクトで結果データ共有
 *
 * 環境変数:
 * - GITHUB_TOKEN_KEIBA_DATA_SHARED: GitHub Personal Access Token (repo権限)
 * - GITHUB_REPO_OWNER: apol0510
 */

// Netlify環境では環境変数は自動的に process.env に設定される
// ローカル開発時は netlify dev コマンドが .env を自動読み込み

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
    const { resultsJSON, archiveResultsJSON, raceDate, track, data, forceOverwrite } = body;

    console.log('[save-results] リクエスト受信:', {
      hasResultsJSON: !!resultsJSON,
      hasRaceDate: !!raceDate,
      hasTrack: !!track,
      hasData: !!data,
      forceOverwrite
    });

    // モード判定: 一括入力 vs 個別入力
    const isBatchMode = !resultsJSON && raceDate && track && data;
    const isIndividualMode = resultsJSON && !raceDate;

    console.log(`[save-results] モード: ${isBatchMode ? '一括入力' : '個別入力'}`);

    let parsedData, date, venue, venueCode;

    if (isBatchMode) {
      // 一括入力モード
      if (!raceDate || !track || !data) {
        return new Response(
          JSON.stringify({
            error: 'Missing required fields for batch mode: raceDate, track, data',
            received: { raceDate, track, hasData: !!data }
          }),
          { status: 400, headers }
        );
      }

      date = raceDate;
      venue = track;
      // 正しい競馬場コード
      const venueCodeMap = {
        '大井': 'OI',
        '川崎': 'KA',
        '船橋': 'FU',
        '浦和': 'UR'
      };
      venueCode = venueCodeMap[track] || 'OI';
      parsedData = data;

    } else if (isIndividualMode) {
      // 個別入力モード（既存）
      if (!resultsJSON) {
        return new Response(
          JSON.stringify({
            error: 'Missing required field: resultsJSON'
          }),
          { status: 400, headers }
        );
      }

      parsedData = JSON.parse(resultsJSON);
      date = parsedData.date;
      venue = parsedData.venue;
      venueCode = parsedData.venueCode;

    } else {
      return new Response(
        JSON.stringify({
          error: 'Invalid request format. Provide either (resultsJSON) or (raceDate, track, data)',
          received: { hasResultsJSON: !!resultsJSON, hasRaceDate: !!raceDate, hasTrack: !!track, hasData: !!data }
        }),
        { status: 400, headers }
      );
    }

    if (!date || !venue) {
      return new Response(
        JSON.stringify({
          error: 'Invalid JSON: missing date or venue'
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
      return new Response(
        JSON.stringify({
          error: 'GITHUB_TOKEN_KEIBA_DATA_SHARED or GITHUB_TOKEN not configured',
          hint: 'Netlify環境変数を設定してください'
        }),
        { status: 500, headers }
      );
    }

    // ファイルパス生成（例: nankan/results/2026/01/2026-01-23.json）
    const year = date.substring(0, 4);
    const month = date.substring(5, 7);
    const fileName = `${date}.json`;
    const filePath = `nankan/results/${year}/${month}/${fileName}`;

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

      // 既存ファイルをデコードしてパース（UTF-8対応）
      try {
        const content = Buffer.from(fileData.content, 'base64').toString('utf8');
        existingData = JSON.parse(content);
      } catch (e) {
        console.error('Existing file parse error:', e);
      }
    }

    // マージロジック：forceOverwriteに関わらず実行
    if (existingData && existingData.races && !forceOverwrite) {
      // 通常モード：既存にないレースのみ追加
      const existingRaceNumbers = new Set(existingData.races.map(r => r.raceNumber));
      const newRaces = parsedData.races.filter(r => !existingRaceNumbers.has(r.raceNumber));
      parsedData.races = [...existingData.races, ...newRaces].sort((a, b) => a.raceNumber - b.raceNumber);
    } else if (existingData && existingData.races && forceOverwrite) {
      // 完全上書きモード：同じraceNumberは上書き、新規は追加
      const newRaceMap = new Map(parsedData.races.map(r => [r.raceNumber, r]));
      const mergedRaces = existingData.races.map(r =>
        newRaceMap.has(r.raceNumber) ? newRaceMap.get(r.raceNumber) : r
      );
      // 既存にないraceNumberを追加
      parsedData.races.forEach(r => {
        if (!existingData.races.some(er => er.raceNumber === r.raceNumber)) {
          mergedRaces.push(r);
        }
      });
      parsedData.races = mergedRaces.sort((a, b) => a.raceNumber - b.raceNumber);
    }

    // レース情報一覧生成
    const racesList = parsedData.races ? parsedData.races.map(r => `第${r.raceNumber}R ${r.raceName || ''}`).join(', ') : '';
    const totalRaces = parsedData.races ? parsedData.races.length : 1;
    const raceNumbers = parsedData.races ? parsedData.races.map(r => `${r.raceNumber}R`).join('・') : parsedData.raceNumber;

    // コミットメッセージ生成
    const commitMessage = isBatchMode
      ? `✨ ${date} ${venue} ${totalRaces}レース一括結果${fileSha ? '更新' : '追加'}

【結果データ（一括入力）】
- 開催日: ${date}
- 競馬場: ${venue}（${venueCode}）
- レース: ${racesList}
- ファイル: ${filePath}

【keiba-data-shared】
全プロジェクトで結果データ共有可能

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>`
      : `✨ ${date} ${venue} ${raceNumbers} 結果${fileSha ? '更新' : '追加'}

【結果データ】
- 開催日: ${date}
- 競馬場: ${venue}（${venueCode}）
- レース: ${racesList}
- ファイル: ${filePath}

【keiba-data-shared】
全プロジェクトで結果データ共有可能

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>`;

    // マージ後のデータをJSON化
    const mergedJSON = JSON.stringify(parsedData, null, 2);

    // GitHub API: ファイルをコミット・プッシュ
    const createFileUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${filePath}`;
    const createFileResponse = await fetch(createFileUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Netlify-Function'
      },
      body: JSON.stringify({
        message: commitMessage,
        content: Buffer.from(mergedJSON, 'utf8').toString('base64'),
        branch: GITHUB_BRANCH,
        ...(fileSha && { sha: fileSha }) // 更新の場合のみSHAを含める
      })
    });

    if (!createFileResponse.ok) {
      const errorData = await createFileResponse.json();
      console.error('GitHub API Error:', errorData);
      return new Response(
        JSON.stringify({
          error: 'Failed to commit to GitHub',
          details: errorData,
          hint: 'GITHUB_TOKENのrepo権限を確認してください'
        }),
        { status: 500, headers }
      );
    }

    const result = await createFileResponse.json();

    // archiveResults.json保存（的中判定データ）
    let archiveCommitUrl = null;
    if (archiveResultsJSON) {
      try {
        const archivePath = 'nankan/archive/archiveResults.json';

        // 既存のarchiveResults.jsonを取得
        const getArchiveUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${archivePath}?ref=${GITHUB_BRANCH}`;
        let archiveSha = null;
        let existingArchive = {};

        const getArchiveResponse = await fetch(getArchiveUrl, {
          headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Netlify-Function'
          }
        });

        if (getArchiveResponse.ok) {
          const archiveData = await getArchiveResponse.json();
          archiveSha = archiveData.sha;
          // Base64デコード（UTF-8対応）
          const content = Buffer.from(archiveData.content, 'base64').toString('utf8');
          existingArchive = JSON.parse(content);
        }

        // 新しいデータをマージ（深くマージ）
        const newArchive = JSON.parse(archiveResultsJSON);
        const mergedArchive = { ...existingArchive };

        // 年月日階層でマージ
        for (const year in newArchive) {
          if (!mergedArchive[year]) mergedArchive[year] = {};
          for (const month in newArchive[year]) {
            if (!mergedArchive[year][month]) mergedArchive[year][month] = {};
            for (const day in newArchive[year][month]) {
              mergedArchive[year][month][day] = newArchive[year][month][day];
            }
          }
        }

        // archiveResults.jsonを保存
        const archiveCommitMessage = `📊 ${date} ${venue} ${raceNumbers} 的中判定データ更新

【的中情報】
- 開催日: ${date}
- 競馬場: ${venue}（${venueCode}）
- 全${parsedData.races?.length || 0}R
- ファイル: ${archivePath}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>`;

        const saveArchiveUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${archivePath}`;
        const saveArchiveResponse = await fetch(saveArchiveUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'Netlify-Function'
          },
          body: JSON.stringify({
            message: archiveCommitMessage,
            content: Buffer.from(JSON.stringify(mergedArchive, null, 2), 'utf8').toString('base64'),
            branch: GITHUB_BRANCH,
            ...(archiveSha && { sha: archiveSha })
          })
        });

        if (saveArchiveResponse.ok) {
          const archiveResult = await saveArchiveResponse.json();
          archiveCommitUrl = archiveResult.commit?.html_url;
        }
      } catch (archiveError) {
        console.error('Archive save error:', archiveError);
        // archiveの保存に失敗してもメインの処理は成功とする
      }
    }

    // Netlifyビルドトリガー（keiba-data-shared公開サイト）
    // 非同期で実行（await しない）- 結果を待たずにすぐにレスポンスを返す
    let buildTriggered = false;
    const NETLIFY_BUILD_HOOK_URL = process.env.NETLIFY_BUILD_HOOK_URL;

    if (NETLIFY_BUILD_HOOK_URL) {
      // awaitせずに非同期でビルドトリガーを送信
      fetch(NETLIFY_BUILD_HOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      }).then(() => {
        console.log('✅ Netlifyビルドトリガーを送信しました');
      }).catch((buildError) => {
        console.error('❌ Netlifyビルドトリガー送信エラー:', buildError);
      });
      buildTriggered = true; // トリガーは送信したのでtrue
    } else {
      console.warn('⚠️ NETLIFY_BUILD_HOOK_URLが設定されていません。ビルドは自動トリガーされません。');
    }

    // keiba-intelligenceへの自動判定トリガー（repository_dispatch）
    // 非同期で実行（await しない）- 結果を待たずにすぐにレスポンスを返す
    let intelligenceTriggered = false;
    const KEIBA_INTELLIGENCE_TOKEN = process.env.KEIBA_INTELLIGENCE_TOKEN || GITHUB_TOKEN;

    if (KEIBA_INTELLIGENCE_TOKEN) {
      const dispatchUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/keiba-intelligence/dispatches`;
      fetch(dispatchUrl, {
        method: 'POST',
        headers: {
          'Authorization': `token ${KEIBA_INTELLIGENCE_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event_type: 'nankan-results-updated',
          client_payload: {
            date: date,
            venue: venue,
            venueCode: venueCode
          }
        })
      }).then((response) => {
        if (response.ok) {
          console.log(`✅ keiba-intelligenceに自動判定トリガーを送信しました (date: ${date})`);
        } else {
          console.error(`❌ keiba-intelligence トリガー送信失敗: ${response.status}`);
        }
      }).catch((dispatchError) => {
        console.error('❌ keiba-intelligence トリガー送信エラー:', dispatchError);
      });
      intelligenceTriggered = true;
    } else {
      console.warn('⚠️ KEIBA_INTELLIGENCE_TOKENが設定されていません。keiba-intelligenceの自動判定はトリガーされません。');
    }

    // X（旧Twitter）への自動投稿
    // 非同期で実行（await しない）- 結果を待たずにすぐにレスポンスを返す
    let xPosted = false;
    const X_API_KEY = process.env.X_API_KEY;
    const X_API_SECRET = process.env.X_API_SECRET;
    const X_ACCESS_TOKEN = process.env.X_ACCESS_TOKEN;
    const X_ACCESS_TOKEN_SECRET = process.env.X_ACCESS_TOKEN_SECRET;

    if (X_API_KEY && X_API_SECRET && X_ACCESS_TOKEN && X_ACCESS_TOKEN_SECRET) {
      // X投稿用のNetlify Functionを呼び出し
      const postToXUrl = `${process.env.URL || 'https://keiba-data-shared-admin.netlify.app'}/.netlify/functions/post-to-x`;

      // 投稿テキスト生成
      const venueEmoji = {
        '大井': '🏇',
        '川崎': '🐴',
        '船橋': '🎠',
        '浦和': '🏆'
      };

      const resultUrl = `https://data.keiba-intelligence.jp/nankan/results/${year}/${month}/${date.substring(8, 10)}/${venueCode.toLowerCase()}/`;

      const tweetText = `${venueEmoji[venue] || '📊'} ${date.replace(/-/g, '/')} ${venue}競馬の結果を公開

全${totalRaces}レース・払戻金・コーナー通過順を掲載
${resultUrl}

#南関競馬 #${venue}競馬 #競馬結果`;

      fetch(postToXUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: tweetText,
          date: date,
          venue: venue,
          totalRaces: totalRaces
        })
      }).then((response) => {
        if (response.ok) {
          console.log(`✅ Xに投稿しました: ${venue}競馬 (${date})`);
        } else {
          console.error(`❌ X投稿失敗: ${response.status}`);
        }
      }).catch((xError) => {
        console.error('❌ X投稿エラー:', xError);
      });
      xPosted = true;
    } else {
      console.warn('⚠️ X API認証情報が設定されていません。自動投稿はスキップされます。');
    }

    // 成功レスポンス
    let message = `${fileName} を keiba-data-shared に保存しました。全プロジェクトで利用可能です！`;
    if (buildTriggered) {
      message += ` 公開サイトのビルドを開始しました。2-3分後に https://data.keiba-intelligence.jp/ に反映されます。`;
    }
    if (intelligenceTriggered) {
      message += ` keiba-intelligenceで自動判定を開始しました。`;
    }
    if (xPosted) {
      message += ` Xに結果を投稿しました。`;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: message,
        fileName,
        filePath,
        repoUrl: `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`,
        commitUrl: result.commit?.html_url,
        commitSha: result.commit?.sha,
        rawUrl: `https://raw.githubusercontent.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/${GITHUB_BRANCH}/${filePath}`,
        archiveCommitUrl: archiveCommitUrl,
        archiveSaved: !!archiveCommitUrl,
        buildTriggered: buildTriggered,
        intelligenceTriggered: intelligenceTriggered,
        xPosted: xPosted
      }),
      { status: 200, headers }
    );

  } catch (error) {
    console.error('Save Results Error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }),
      { status: 500, headers }
    );
  }
};
