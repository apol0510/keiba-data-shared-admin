/**
 * レースデータ保存API
 * keiba-data-sharedリポジトリに保存
 * パス: jra/racebook/YYYY/MM/YYYY-MM-DD-{venueCode}.json
 */

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const data = JSON.parse(event.body);

    console.log(`[Save KeibaBook] 開始: ${data.date} ${data.track}`);

    // バリデーション
    if (!data.date || !data.track || !data.trackCode || !data.races?.length) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '必須フィールドが不足しています (date, track, trackCode, races)' })
      };
    }

    // GitHubに保存
    const result = await saveToGitHub(data);

    console.log(`[Save KeibaBook] 完了: ${result.filePath}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error('[Save KeibaBook] エラー:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: '保存に失敗しました',
        details: error.message
      })
    };
  }
};

/**
 * GitHubに保存
 */
async function saveToGitHub(data) {
  const { date, trackCode, category } = data;
  const [year, month] = date.split('-');
  const cat = category || 'jra';

  const filePath = `${cat}/racebook/${year}/${month}/${date}-${trackCode}.json`;

  const token = process.env.GITHUB_TOKEN_KEIBA_DATA_SHARED;
  const repo = 'apol0510/keiba-data-shared';

  if (!token) {
    throw new Error('GITHUB_TOKEN_KEIBA_DATA_SHARED が設定されていません');
  }

  // 既存ファイルのSHA取得
  let sha = null;
  try {
    const getResponse = await fetch(
      `https://api.github.com/repos/${repo}/contents/${filePath}`,
      {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    if (getResponse.ok) {
      const existingFile = await getResponse.json();
      sha = existingFile.sha;
      console.log('[GitHub] 既存ファイルを更新');
    } else {
      console.log('[GitHub] 新規ファイル作成');
    }
  } catch (error) {
    console.log('[GitHub] 既存ファイルチェックエラー（新規作成）');
  }

  // ファイル内容をBase64エンコード
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');

  const putPayload = {
    message: `📊 レースデータ追加: ${date} ${data.track}(${cat})\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n\nCo-Authored-By: Claude <noreply@anthropic.com>`,
    content: content,
    branch: 'main'
  };

  if (sha) {
    putPayload.sha = sha;
  }

  const putResponse = await fetch(
    `https://api.github.com/repos/${repo}/contents/${filePath}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(putPayload)
    }
  );

  if (!putResponse.ok) {
    const errorText = await putResponse.text();
    throw new Error(`GitHub API エラー: ${putResponse.status} ${errorText}`);
  }

  const result = await putResponse.json();

  console.log('[GitHub] 保存成功:', filePath);

  return {
    success: true,
    filePath: filePath,
    htmlUrl: result.content.html_url,
    message: '保存完了'
  };
}
