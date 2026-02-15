/**
 * コンピ指数データ保存API（予想データとの自動補完機能付き）
 * keiba-data-sharedリポジトリに保存
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
    const computerData = JSON.parse(event.body);

    console.log(`[Save Computer] 開始: ${computerData.date} ${computerData.venue}`);

    // 予想データを取得して自動補完
    const enrichedData = await enrichWithPredictionData(computerData);

    // GitHubに保存
    const result = await saveToGitHub(enrichedData);

    console.log(`[Save Computer] 完了: ${result.filePath}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error('[Save Computer] エラー:', error);
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
 * 予想データで補完
 */
async function enrichWithPredictionData(computerData) {
  const { date, venue, category } = computerData;

  // 予想データは中央と南関のみ
  if (category !== 'jra' && category !== 'nankan') {
    console.log('[Enrich] 地方競馬のため補完スキップ');
    return computerData;
  }

  try {
    // 予想データを取得
    const predictionData = await fetchPredictionData(date, category);

    if (!predictionData) {
      console.log('[Enrich] 予想データなし（補完スキップ）');
      return computerData;
    }

    console.log('[Enrich] 予想データ取得成功、補完開始');

    // レースごとに補完
    const enrichedRaces = computerData.races.map(computerRace => {
      // 予想データから同じレース番号のデータを探す
      let predictionRace = null;

      if (category === 'jra') {
        // JRAの場合は会場も一致させる
        const venueRaces = predictionData.venues?.find(v => v.venue === venue);
        if (venueRaces) {
          predictionRace = venueRaces.races.find(r =>
            parseInt(r.raceInfo.raceNumber) === computerRace.raceNumber
          );
        }
      } else {
        // 南関の場合
        predictionRace = predictionData.races?.find(r =>
          r.raceInfo.raceNumber === `${computerRace.raceNumber}R`
        );
      }

      if (!predictionRace) {
        console.log(`[Enrich] R${computerRace.raceNumber}: 予想データなし`);
        return computerRace;
      }

      // 馬ごとに補完
      const enrichedHorses = computerRace.horses.map(computerHorse => {
        // 馬番で一致する馬を探す（最優先）
        let predictionHorse = predictionRace.horses.find(h =>
          h.number === computerHorse.number
        );

        // 馬番で見つからなければ馬名で探す
        if (!predictionHorse) {
          predictionHorse = predictionRace.horses.find(h =>
            h.name === computerHorse.name
          );
        }

        if (!predictionHorse) {
          console.log(`[Enrich] R${computerRace.raceNumber} ${computerHorse.number}番 ${computerHorse.name}: マッチなし`);
          return computerHorse;
        }

        // 補完実行
        return {
          ...computerHorse,
          jockey: predictionHorse.kisyu || null,
          trainer: predictionHorse.kyusya || null,
          weight: predictionHorse.kinryo ? parseFloat(predictionHorse.kinryo) : null,
          ageGender: predictionHorse.seirei || null,
          umacd: predictionHorse.umacd || null,
          enrichedFrom: 'predictions'
        };
      });

      return {
        ...computerRace,
        horses: enrichedHorses
      };
    });

    return {
      ...computerData,
      races: enrichedRaces,
      enrichedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error('[Enrich] 補完エラー:', error);
    console.log('[Enrich] 補完なしで続行');
    return computerData;
  }
}

/**
 * 予想データをGitHubから取得
 */
async function fetchPredictionData(date, category) {
  const [year, month] = date.split('-');
  const fileName = `${date}.json`;
  const url = `https://raw.githubusercontent.com/apol0510/keiba-data-shared/main/${category}/predictions/${year}/${month}/${fileName}`;

  console.log(`[Fetch Prediction] URL: ${url}`);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.log(`[Fetch Prediction] データなし: ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log(`[Fetch Prediction] データ取得成功`);
    return data;

  } catch (error) {
    console.error('[Fetch Prediction] エラー:', error);
    return null;
  }
}

/**
 * GitHubに保存
 */
async function saveToGitHub(data) {
  const { date, category, venueCode } = data;
  const [year, month] = date.split('-');

  // ファイルパス（会場コード付き）
  const filePath = `${category}/predictions/computer/${year}/${month}/${date}-${venueCode}.json`;

  // GitHub APIで保存
  const token = process.env.GITHUB_TOKEN;
  const repo = 'apol0510/keiba-data-shared';

  if (!token) {
    throw new Error('GITHUB_TOKEN が設定されていません');
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

  // GitHubに保存
  const putPayload = {
    message: `📊 コンピ指数追加: ${date} ${data.venue}\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n\nCo-Authored-By: Claude <noreply@anthropic.com>`,
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
