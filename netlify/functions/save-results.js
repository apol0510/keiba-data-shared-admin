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

// ローカル開発環境用に.envファイルを読み込む
import { config } from 'dotenv';
config();

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
    const { resultsJSON, archiveResultsJSON } = body;

    // バリデーション
    if (!resultsJSON) {
      return new Response(
        JSON.stringify({
          error: 'Missing required field: resultsJSON'
        }),
        { status: 400, headers }
      );
    }

    // JSONパース
    const parsedData = JSON.parse(resultsJSON);
    const { date, venue, venueCode } = parsedData;

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

      // 既存ファイルをデコードしてパース
      try {
        const content = atob(fileData.content);
        existingData = JSON.parse(content);
      } catch (e) {
        console.error('Existing file parse error:', e);
      }
    }

    // 既存レースと新規レースをマージ
    if (existingData && existingData.races) {
      // 既存レースのレース番号を取得
      const existingRaceNumbers = new Set(existingData.races.map(r => r.raceNumber));

      // 新規レースのうち、既存にないレースのみ追加
      const newRaces = parsedData.races.filter(r => !existingRaceNumbers.has(r.raceNumber));

      // マージ（既存 + 新規）してレース番号順にソート
      parsedData.races = [...existingData.races, ...newRaces].sort((a, b) => a.raceNumber - b.raceNumber);
    }

    // レース情報一覧生成
    const racesList = parsedData.races.map(r => `第${r.raceNumber}R ${r.raceName || ''}`).join(', ');
    const totalRaces = parsedData.races.length;

    // コミットメッセージ生成
    const commitMessage = `✨ ${date} ${venue} 結果${fileSha ? '更新' : '追加'}（${totalRaces}レース）

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
          // Base64デコード
          const content = atob(archiveData.content);
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
        const archiveCommitMessage = `📊 ${date} ${venue} 的中判定データ更新

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

    // 成功レスポンス
    return new Response(
      JSON.stringify({
        success: true,
        message: `${fileName} を keiba-data-shared に保存しました。全プロジェクトで利用可能です！`,
        fileName,
        filePath,
        repoUrl: `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`,
        commitUrl: result.commit?.html_url,
        commitSha: result.commit?.sha,
        rawUrl: `https://raw.githubusercontent.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/${GITHUB_BRANCH}/${filePath}`,
        archiveCommitUrl: archiveCommitUrl,
        archiveSaved: !!archiveCommitUrl
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
