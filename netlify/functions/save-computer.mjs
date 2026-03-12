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
 * 会場混入検査（fail fast）
 * trainer/jockeyに異会場の所属記号が含まれていないかチェック
 */
function validateVenueMix(horse, expectedVenue, raceNumber) {
  const venueMarks = {
    '大井': '(大)',
    '船橋': '(船)',
    '川崎': '(川)',
    '浦和': '(浦)'
  };

  const expectedMark = venueMarks[expectedVenue];
  if (!expectedMark) {
    return; // 南関以外はスキップ
  }

  // trainer/jockeyに含まれる所属記号をチェック
  const trainer = horse.trainer || '';
  const jockey = horse.jockey || '';

  // 異会場の所属記号が含まれていないかチェック
  for (const [venueName, mark] of Object.entries(venueMarks)) {
    if (venueName === expectedVenue) continue; // 同じ会場はスキップ

    if (trainer.includes(mark) || jockey.includes(mark)) {
      const errorMsg = `[Venue Mix ERROR] R${raceNumber} ${horse.number}番 ${horse.name}: 会場混入検出！ 期待=${expectedVenue}${expectedMark}, trainer=${trainer}, jockey=${jockey}`;
      console.error(errorMsg);
      throw new Error(errorMsg); // fail fast
    }
  }
}

/**
 * 予想データで補完
 */
async function enrichWithPredictionData(computerData) {
  const { date, venue, venueCode, category } = computerData;

  // 予想データは中央と南関のみ
  if (category !== 'jra' && category !== 'nankan') {
    console.log('[Enrich] 地方競馬のため補完スキップ');
    return computerData;
  }

  try {
    // 予想データを取得
    const predictionData = await fetchPredictionData(date, category, venueCode);

    if (!predictionData) {
      console.log('[Enrich] 予想データなし（補完スキップ）');
      return computerData;
    }

    console.log('[Enrich] 予想データ取得成功、補完開始');

    // 【修正】南関の場合、トップレベルチェックは不要（race単位で照合）
    // 理由: date.json には複数会場が含まれる場合がある（tracks配列）
    // 会場一致確認はrace単位で実施（line 142-146）
    const { venue } = computerData;

    // レースごとに補完
    const enrichedRaces = computerData.races.map(computerRace => {
      // 予想データから同じレース番号のデータを探す
      let predictionRace = null;

      if (category === 'jra') {
        // JRA予想はトップレベルに races 配列（venueCodeごとのファイル）
        predictionRace = predictionData.races?.find(r =>
          parseInt(r.raceInfo.raceNumber) === computerRace.raceNumber
        );
      } else {
        // 【修正】南関：raceNumberとtrackで照合（track必須）
        console.log(`[Enrich DEBUG] 南関照合開始 - R${computerRace.raceNumber}, venue="${venue}"`);
        console.log(`[Enrich DEBUG] predictionData.races.length: ${predictionData.races?.length}`);

        predictionRace = predictionData.races?.find((r, idx) => {
          const raceNum = parseInt(r.raceInfo.raceNumber) || parseInt(r.raceInfo.raceNumber.replace('R', ''));
          const predictionVenue = r.raceInfo.track || r.raceInfo.venue;

          // 【デバッグ】最初の3レースの詳細ログ
          if (idx < 3) {
            console.log(`[Enrich DEBUG] predictionRace[${idx}]:`, {
              rawRaceNumber: r.raceInfo.raceNumber,
              parsedRaceNum: raceNum,
              track: predictionVenue,
              computerRaceNum: computerRace.raceNumber,
              expectedVenue: venue,
              numberMatch: raceNum === computerRace.raceNumber,
              venueMatch: predictionVenue === venue
            });
          }

          // 会場が一致しない場合は照合しない（異会場マージ禁止）
          if (predictionVenue !== venue) {
            console.log(`[Enrich] R${computerRace.raceNumber}: 会場不一致（予想="${predictionVenue}", コンピ="${venue}"）スキップ`);
            return false;
          }

          const matched = raceNum === computerRace.raceNumber;
          if (matched) {
            console.log(`[Enrich DEBUG] ✅ マッチ成功: R${computerRace.raceNumber}, raceNum=${raceNum}`);
          }
          return matched;
        });
      }

      if (!predictionRace) {
        console.log(`[Enrich] R${computerRace.raceNumber}: 予想データなし`);
        return computerRace;
      }

      // 馬ごとに補完
      const enrichedHorses = computerRace.horses.map(computerHorse => {
        // 【修正】馬番で一致する馬を探す（会場一致は既にレースレベルで確認済み）
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
        const enrichedHorse = {
          ...computerHorse,
          jockey: predictionHorse.kisyu || null,
          trainer: predictionHorse.kyusya || null,
          weight: predictionHorse.kinryo ? parseFloat(predictionHorse.kinryo) : null,
          ageGender: predictionHorse.seirei || null,
          umacd: predictionHorse.umacd || null,
          enrichedFrom: 'predictions'
        };

        // 【新規】会場混入検査（南関のみ）
        if (category === 'nankan') {
          validateVenueMix(enrichedHorse, venue, computerRace.raceNumber);
        }

        return enrichedHorse;
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
 * 会場コード付きファイルを優先し、なければ従来の date.json にフォールバック
 * - JRA: 常に ${date}-${venueCode}.json
 * - 南関: ${date}-${venueCode}.json → ${date}.json（フォールバック）
 */
async function fetchPredictionData(date, category, venueCode) {
  const [year, month] = date.split('-');

  console.log(`[Fetch Prediction DEBUG] 入力: date="${date}", category="${category}", venueCode="${venueCode}"`);

  // 優先: 会場コード付きファイル名
  const fileNameWithVenue = `${date}-${venueCode}.json`;
  const urlWithVenue = `https://raw.githubusercontent.com/apol0510/keiba-data-shared/main/${category}/predictions/${year}/${month}/${fileNameWithVenue}`;

  console.log(`[Fetch Prediction] 優先URL: ${urlWithVenue}`);

  try {
    const response = await fetch(urlWithVenue);

    if (response.ok) {
      const data = await response.json();
      console.log(`[Fetch Prediction] ✅ データ取得成功（会場コード付き）: ${fileNameWithVenue}`);
      console.log(`[Fetch Prediction DEBUG] data.track="${data.track}", data.races.length=${data.races?.length}`);
      return data;
    }

    console.log(`[Fetch Prediction] 会場コード付きファイル404: ${fileNameWithVenue} (status=${response.status})`);

    // 南関の場合、フォールバック: date.json を試行
    if (category === 'nankan') {
      const fileNameWithoutVenue = `${date}.json`;
      const urlWithoutVenue = `https://raw.githubusercontent.com/apol0510/keiba-data-shared/main/${category}/predictions/${year}/${month}/${fileNameWithoutVenue}`;

      console.log(`[Fetch Prediction] フォールバックURL: ${urlWithoutVenue}`);

      const fallbackResponse = await fetch(urlWithoutVenue);

      if (fallbackResponse.ok) {
        const data = await fallbackResponse.json();
        console.log(`[Fetch Prediction] ✅ データ取得成功（フォールバック）: ${fileNameWithoutVenue}`);
        console.log(`[Fetch Prediction] ⚠️ 注意: 会場コードなしファイル使用、race単位で会場一致確認必須`);
        console.log(`[Fetch Prediction DEBUG] data.track="${data.track}", data.races.length=${data.races?.length}`);
        return data;
      }

      console.log(`[Fetch Prediction] フォールバックも404: ${fileNameWithoutVenue} (status=${fallbackResponse.status})`);
    }

    console.log(`[Fetch Prediction] ❌ データなし: ${response.status}`);
    return null;

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
