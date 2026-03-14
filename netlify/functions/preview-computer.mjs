/**
 * コンピ指数データプレビューAPI（予想データとの自動補完プレビュー）
 * 保存前に補完結果を確認できる
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
    const { raceDate, venue, computerData } = JSON.parse(event.body);

    console.log(`[Preview Computer] 開始: ${raceDate} ${venue}`);

    // パース処理
    const parsedData = parseComputerData(raceDate, venue, computerData);
    console.log(`[Preview Computer] パース完了: ${parsedData.races.length}レース`);

    // デバッグ: 各レースの馬数を確認
    parsedData.races.forEach((race, idx) => {
      console.log(`[Preview Computer] R${race.raceNumber}: ${race.horses.length}頭, 最初の馬: ${race.horses[0]?.name}, 指数: ${race.horses[0]?.computerIndex}`);
    });

    // 予想データで補完
    const enrichedData = await enrichWithPredictionData(parsedData);

    console.log(`[Preview Computer] 補完完了: ${enrichedData.races.length}レース`);

    // 【デバッグ】レスポンス直前の 1R 1頭目確認
    if (enrichedData.races && enrichedData.races[0] && enrichedData.races[0].horses && enrichedData.races[0].horses[0]) {
      console.log('[Preview Computer] ━━━ レスポンス直前 1R 1頭目 ━━━');
      console.log(JSON.stringify(enrichedData.races[0].horses[0], null, 2));
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(enrichedData)
    };

  } catch (error) {
    console.error('[Preview Computer] エラー:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'プレビュー処理に失敗しました',
        details: error.message
      })
    };
  }
};

/**
 * コンピ指数データをパース（parse-computer.mjsと同じ）
 */
function parseComputerData(raceDate, venue, computerData) {
  const lines = computerData.split('\n').map(line => line.trim()).filter(line => line);

  const races = [];
  let currentRaceNumber = null;
  let currentRaceInfo = {};
  let horses = [];
  let inHorseData = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // レース番号検出（例: "1R", "12R", "1R ３歳三組", "5R ジンチョウゲ特別"）
    const raceNumberMatch = line.match(/^(\d{1,2})R(?:\s+(.+))?$/);
    if (raceNumberMatch) {
      if (currentRaceNumber && horses.length > 0) {
        races.push({
          raceNumber: parseInt(currentRaceNumber),
          ...currentRaceInfo,
          horses: horses
        });
      }

      currentRaceNumber = raceNumberMatch[1];
      currentRaceInfo = {};
      // レース番号と同じ行にレース名がある場合は取得
      if (raceNumberMatch[2]) {
        currentRaceInfo.raceName = raceNumberMatch[2].trim();
      }
      horses = [];
      inHorseData = false;
      continue;
    }

    // レース情報行
    const raceInfoMatch = line.match(/^(.+?)(\d{1,2})R\s+(\d{1,2}:\d{2})発走\s+\/\s+(.+?)(\d{3,4})m\s+\((.+?)\)/);
    if (raceInfoMatch) {
      const startTime = raceInfoMatch[3];
      const surfaceAndOther = raceInfoMatch[4].trim();
      const distance = parseInt(raceInfoMatch[5]);
      const direction = raceInfoMatch[6];

      let surface = 'ダート';
      let track = direction;
      if (surfaceAndOther.includes('芝')) {
        surface = '芝';
      } else if (surfaceAndOther.includes('ダート')) {
        surface = 'ダート';
      }

      currentRaceInfo.distance = distance;
      currentRaceInfo.surface = surface;
      currentRaceInfo.track = track;
      currentRaceInfo.startTime = startTime;
      continue;
    }

    // レース名・賞金情報（例: "一般 賞金:1着80万円..."、"３歳 賞金:..."）
    if (line.includes('賞金:')) {
      const raceNameMatch = line.match(/^(.+?)\s+賞金:/);
      if (raceNameMatch) {
        const type = raceNameMatch[1].trim();
        // 「一般」は無視
        if (type !== '一般') {
          // 既存のレース名（1R行で取得済み）がある場合は上書きしない
          if (!currentRaceInfo.raceName) {
            currentRaceInfo.raceName = type;
          }
        }
      }
      continue;
    }

    // レース名のみ（例: "Ｃ３", "如月賞"）※既にレース名がある場合はスキップ
    if (!currentRaceInfo.raceName && line.length > 0 && line.length < 20 && !line.includes('馬') && !line.includes('指数')) {
      currentRaceInfo.raceName = line;
      continue;
    }

    // テーブルヘッダー検出
    if (line.includes('馬番') || line.includes('馬名') || line.includes('指数')) {
      inHorseData = true;
      continue;
    }

    // 馬データ行をパース
    if (inHorseData) {
      if (line.match(/^[1-8]$/) && i + 4 < lines.length) {
        const bracket = parseInt(line);
        const numberLine = lines[i + 1].trim();
        const numberMatch = numberLine.match(/^(\d{1,2})$/);

        if (numberMatch) {
          const number = parseInt(numberMatch[1]);
          let name = lines[i + 2].trim();
          // 馬名の前に付いている「地」「外」などを括弧で囲む
          // 例: 地ソリッドベーシス → (地)ソリッドベーシス
          name = name.replace(/^(地|外|抽|父|市)/, '($1)');
          const indexLine = lines[i + 3].trim();
          const indexMatch = indexLine.match(/^(\d{1,3})$/);

          if (indexMatch) {
            const computerIndex = parseInt(indexMatch[1]);
            let popularity = null;
            const popLine = lines[i + 4].trim();
            const popMatch = popLine.match(/^(\d{1,2})位$/);

            if (popMatch) {
              popularity = parseInt(popMatch[1]);
            }

            horses.push({
              bracket,
              number,
              name,
              computerIndex,
              popularity
            });

            i += 4;
          }
        }
      }
    }
  }

  // 最後のレースを保存
  if (currentRaceNumber && horses.length > 0) {
    races.push({
      raceNumber: parseInt(currentRaceNumber),
      ...currentRaceInfo,
      horses: horses
    });
  }

  const category = getCategoryByVenue(venue);
  const venueCode = getVenueCode(venue);

  return {
    date: raceDate,
    venue: venue,
    venueCode: venueCode,
    category: category,
    dataSource: 'computer-index',
    races: races,
    dataVersion: '1.0',
    createdAt: new Date().toISOString()
  };
}

/**
 * 会場混入検査（fail fast）
 * trainer/jockeyに異会場の所属記号が含まれていないかチェック
 *
 * 【注意】南関競馬では他場所属の調教師が出走することがある
 * 例: 船橋レースに浦和所属の調教師が出走
 * このため、エラーではなく警告ログのみに変更
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
      // 【修正】エラーではなく警告ログに変更（他場所属の調教師が出走することがあるため）
      const warnMsg = `[Preview Venue Mix WARNING] R${raceNumber} ${horse.number}番 ${horse.name}: 他場所属検出 期待=${expectedVenue}${expectedMark}, trainer=${trainer}, jockey=${jockey}`;
      console.warn(warnMsg);
      // throw new Error は削除（fail fastを無効化）
    }
  }
}

/**
 * 予想データで補完（save-computer.mjsと同じ）
 */
async function enrichWithPredictionData(computerData) {
  const { date, venue, venueCode, category } = computerData;

  if (category !== 'jra' && category !== 'nankan') {
    console.log('[Preview Enrich] 地方競馬のため補完スキップ');
    return computerData;
  }

  try {
    const predictionData = await fetchPredictionData(date, category, venueCode);

    if (!predictionData) {
      console.log('[Preview Enrich] 予想データなし（補完スキップ）');
      return computerData;
    }

    console.log('[Preview Enrich] 予想データ取得成功、補完開始');
    debugPredictionData(predictionData, category);

    // 【デバッグ】予想データ構造を詳細確認
    console.log('[Preview Enrich DEBUG] predictionData.track:', predictionData.track);
    console.log('[Preview Enrich DEBUG] predictionData.tracks:', predictionData.tracks);
    console.log('[Preview Enrich DEBUG] predictionData.races.length:', predictionData.races?.length);
    if (predictionData.races && predictionData.races.length > 0) {
      console.log('[Preview Enrich DEBUG] races[0].raceInfo:', JSON.stringify(predictionData.races[0].raceInfo));
      console.log('[Preview Enrich DEBUG] races[0].horses[0]:', JSON.stringify(predictionData.races[0].horses?.[0]));
    }

    // 【修正】南関の場合、トップレベルチェックは不要（race単位で照合）
    // 理由: date.json には複数会場が含まれる場合がある（tracks配列）
    // 会場一致確認はrace単位で実施（line 294-298）

    const enrichedRaces = computerData.races.map((computerRace, raceIdx) => {
      let predictionRace = null;

      // 【デバッグ】1Rのみ詳細ログ
      if (raceIdx === 0) {
        console.log('[Preview Enrich DEBUG] computerRace.raceNumber:', computerRace.raceNumber, 'type:', typeof computerRace.raceNumber);
        console.log('[Preview Enrich DEBUG] venue:', venue);
      }

      if (category === 'jra') {
        // JRA予想はトップレベルに races 配列（venueCodeごとのファイル）
        predictionRace = predictionData.races?.find(r =>
          parseInt(r.raceInfo.raceNumber) === computerRace.raceNumber
        );
      } else {
        // 【修正】南関：raceNumberとtrackで照合（track必須）
        console.log(`[Preview Enrich DEBUG] 南関照合開始 - R${computerRace.raceNumber}, venue="${venue}"`);
        console.log(`[Preview Enrich DEBUG] predictionData.races.length: ${predictionData.races?.length}`);

        predictionRace = predictionData.races?.find((r, idx) => {
          const raceNum = parseInt(r.raceInfo.raceNumber) || parseInt(r.raceInfo.raceNumber.replace('R', ''));
          const predictionVenue = r.raceInfo.track || r.raceInfo.venue;

          // 【デバッグ】全レースの詳細ログ（最初の5レースのみ）
          if (raceIdx === 0 && idx < 5) {
            console.log(`[Preview Enrich DEBUG] predictionRace[${idx}]:`, {
              rawRaceNumber: r.raceInfo.raceNumber,
              parsedRaceNum: raceNum,
              track: predictionVenue,
              computerRaceNum: computerRace.raceNumber,
              expectedVenue: venue,
              numberMatch: raceNum === computerRace.raceNumber,
              venueMatch: predictionVenue === venue,
              bothMatch: raceNum === computerRace.raceNumber && predictionVenue === venue
            });
          }

          // 会場が一致しない場合は照合しない（異会場マージ禁止）
          if (predictionVenue !== venue) {
            if (raceIdx === 0 && idx < 3) {
              console.log(`[Preview Enrich] R${computerRace.raceNumber}: 会場不一致（予想="${predictionVenue}", コンピ="${venue}"）スキップ`);
            }
            return false;
          }

          const matched = raceNum === computerRace.raceNumber;
          if (raceIdx === 0 && matched) {
            console.log(`[Preview Enrich DEBUG] ✅ 1Rマッチ成功: raceNum=${raceNum}, computerRace.raceNumber=${computerRace.raceNumber}`);
          }
          return matched;
        });
      }

      if (!predictionRace) {
        console.log(`[Preview Enrich] R${computerRace.raceNumber}: 予想データなし（会場またはレース番号不一致）`);
        return computerRace;
      }

      console.log(`[Preview Enrich] R${computerRace.raceNumber}: 予想レース特定`, {
        predictionTrack: predictionRace.raceInfo?.track,
        predictionRaceNumber: predictionRace.raceInfo?.raceNumber,
        expectedVenue: venue
      });

      // 【デバッグ】1Rのみ詳細ログ
      if (raceIdx === 0) {
        console.log('[Preview Enrich DEBUG] predictionRace.horses.length:', predictionRace.horses?.length);
        if (predictionRace.horses && predictionRace.horses.length > 0) {
          console.log('[Preview Enrich DEBUG] predictionRace.horses[0]:', JSON.stringify(predictionRace.horses[0]));
          console.log('[Preview Enrich DEBUG] フィールド名確認:', Object.keys(predictionRace.horses[0]));
        }
        console.log('[Preview Enrich DEBUG] computerRace.horses[0]:', {
          number: computerRace.horses[0]?.number,
          name: computerRace.horses[0]?.name,
          numberType: typeof computerRace.horses[0]?.number
        });
      }

      const enrichedHorses = computerRace.horses.map((computerHorse, horseIdx) => {
        // 【デバッグ】1R 1頭目の補完前データ
        if (raceIdx === 0 && horseIdx === 0) {
          console.log('[Preview Enrich] ━━━ 1R 1頭目 補完前 ━━━');
          console.log(JSON.stringify(computerHorse, null, 2));
        }

        // 【修正】型を正規化して照合（number / string / "1R" 吸収）
        let predictionHorse = predictionRace.horses.find(h =>
          String(h.number) === String(computerHorse.number)
        );

        if (!predictionHorse) {
          predictionHorse = predictionRace.horses.find(h =>
            h.name === computerHorse.name
          );
        }

        // 【デバッグ】1Rの1頭目のみ詳細ログ
        if (raceIdx === 0 && horseIdx === 0) {
          console.log('[Preview Enrich DEBUG] 1R 1頭目の照合結果:', {
            computerNumber: computerHorse.number,
            computerName: computerHorse.name,
            predictionHorseFound: !!predictionHorse,
            predictionHorse: predictionHorse ? {
              number: predictionHorse.number,
              name: predictionHorse.name,
              kisyu: predictionHorse.kisyu,
              kyusya: predictionHorse.kyusya
            } : null
          });
        }

        if (!predictionHorse) {
          if (raceIdx === 0 && horseIdx === 0) {
            console.log(`[Preview Enrich] R${computerRace.raceNumber} ${computerHorse.number}番 ${computerHorse.name}: マッチなし`);
          }
          return computerHorse;
        }

        console.log(`[Preview Enrich] R${computerRace.raceNumber} ${computerHorse.number}番 ${computerHorse.name}: マッチ成功`, {
          matchedBy: predictionHorse.number === computerHorse.number ? 'number' : 'name',
          kisyu: predictionHorse.kisyu,
          kyusya: predictionHorse.kyusya,
          kinryo: predictionHorse.kinryo,
          seirei: predictionHorse.seirei
        });

        const enrichedHorse = {
          ...computerHorse,
          jockey: predictionHorse.kisyu || null,
          trainer: predictionHorse.kyusya || null,
          weight: predictionHorse.kinryo ? parseFloat(predictionHorse.kinryo) : null,
          ageGender: predictionHorse.seirei || null,
          umacd: predictionHorse.umacd || null,
          enrichedFrom: 'predictions'
        };

        // 【デバッグ】1R 1頭目の補完後データ
        if (raceIdx === 0 && horseIdx === 0) {
          console.log('[Preview Enrich] ━━━ 1R 1頭目 補完後 ━━━');
          console.log(JSON.stringify(enrichedHorse, null, 2));
        }

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

    const enrichedResult = {
      ...computerData,
      races: enrichedRaces,
      enrichedAt: new Date().toISOString()
    };

    // 【デバッグ】補完関数の戻り値確認（1R 1頭目）
    if (enrichedResult.races && enrichedResult.races[0] && enrichedResult.races[0].horses && enrichedResult.races[0].horses[0]) {
      console.log('[Preview Enrich] ━━━ enrichWithPredictionData 戻り値 1R 1頭目 ━━━');
      console.log(JSON.stringify(enrichedResult.races[0].horses[0], null, 2));
    }

    return enrichedResult;

  } catch (error) {
    console.error('[Preview Enrich] 補完エラー:', error);
    console.log('[Preview Enrich] 補完なしで続行');
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

  console.log(`[Preview Fetch Prediction DEBUG] 入力: date="${date}", category="${category}", venueCode="${venueCode}"`);

  // 優先: 会場コード付きファイル名（予想データディレクトリ）
  const fileNameWithVenue = `${date}-${venueCode}.json`;
  const urlWithVenue = `https://raw.githubusercontent.com/apol0510/keiba-data-shared/main/${category}/predictions/${year}/${month}/${fileNameWithVenue}`;

  console.log(`[Preview Fetch Prediction] 優先URL: ${urlWithVenue}`);

  try {
    const response = await fetch(urlWithVenue);

    if (response.ok) {
      const data = await response.json();
      console.log(`[Preview Fetch Prediction] ✅ データ取得成功（会場コード付き）: ${fileNameWithVenue}`);
      console.log(`[Preview Fetch Prediction DEBUG] data.track="${data.track}", data.races.length=${data.races?.length}`);
      return data;
    }

    console.log(`[Preview Fetch Prediction] 会場コード付きファイル404: ${fileNameWithVenue} (status=${response.status})`);

    // 南関の場合、フォールバック: date.json を試行（予想データディレクトリ）
    if (category === 'nankan') {
      const fileNameWithoutVenue = `${date}.json`;
      const urlWithoutVenue = `https://raw.githubusercontent.com/apol0510/keiba-data-shared/main/${category}/predictions/${year}/${month}/${fileNameWithoutVenue}`;

      console.log(`[Preview Fetch Prediction] フォールバックURL: ${urlWithoutVenue}`);

      const fallbackResponse = await fetch(urlWithoutVenue);

      if (fallbackResponse.ok) {
        const data = await fallbackResponse.json();
        console.log(`[Preview Fetch Prediction] ✅ データ取得成功（フォールバック）: ${fileNameWithoutVenue}`);
        console.log(`[Preview Fetch Prediction] ⚠️ 注意: 会場コードなしファイル使用、race単位で会場一致確認必須`);
        console.log(`[Preview Fetch Prediction DEBUG] data.track="${data.track}", data.races.length=${data.races?.length}`);
        return data;
      }

      console.log(`[Preview Fetch Prediction] フォールバックも404: ${fileNameWithoutVenue} (status=${fallbackResponse.status})`);
    }

    console.log(`[Preview Fetch Prediction] ❌ データなし: ${response.status}`);
    return null;

  } catch (error) {
    console.error('[Preview Fetch Prediction] エラー:', error);
    return null;
  }
}

/**
 * デバッグ用：予想データの構造を確認
 */
function debugPredictionData(predictionData, category) {
  if (!predictionData) {
    console.log('[Debug] 予想データなし');
    return;
  }

  console.log('[Debug] 予想データ構造確認:');
  console.log('[Debug] - トップレベルキー:', Object.keys(predictionData));
  console.log('[Debug] - racesの有無:', predictionData.races ? 'あり' : 'なし');

  if (predictionData.races && predictionData.races.length > 0) {
    const firstRace = predictionData.races[0];
    console.log('[Debug] - 1レース目のキー:', Object.keys(firstRace));
    console.log('[Debug] - 1レース目のレース番号:', firstRace.raceInfo?.raceNumber || firstRace.raceNumber || '不明');

    if (firstRace.horses && firstRace.horses.length > 0) {
      const firstHorse = firstRace.horses[0];
      console.log('[Debug] - 1頭目のキー:', Object.keys(firstHorse));
      console.log('[Debug] - 1頭目のフィールド:', {
        number: firstHorse.number,
        name: firstHorse.name,
        kisyu: firstHorse.kisyu,
        kyusya: firstHorse.kyusya,
        kinryo: firstHorse.kinryo,
        seirei: firstHorse.seirei
      });
    }
  }
}

function getCategoryByVenue(venue) {
  const jra = ['東京', '中山', '阪神', '京都', '中京', '新潟', '小倉', '札幌', '函館', '福島'];
  const nankan = ['大井', '川崎', '船橋', '浦和'];

  if (jra.includes(venue)) return 'jra';
  if (nankan.includes(venue)) return 'nankan';
  return 'local';
}

function getVenueCode(venue) {
  const codes = {
    // JRA中央競馬
    '東京': 'TOK', '中山': 'NAK', '阪神': 'HAN', '京都': 'KYO',
    '中京': 'CHU', '新潟': 'NII', '小倉': 'KOK', '札幌': 'SAP',
    '函館': 'HKD', '福島': 'FKS',
    // 南関競馬
    '大井': 'OOI', '川崎': 'KAW', '船橋': 'FUN', '浦和': 'URA',
    // 地方競馬
    '門別': 'MON', '帯広': 'OBI', '盛岡': 'MOR', '水沢': 'MIZ', '金沢': 'KNZ',
    '笠松': 'KSM', '名古屋': 'NGY', '園田': 'SON', '姫路': 'HIM',
    '高知': 'KOC', '佐賀': 'SAG'
  };
  return codes[venue] || 'XXX';
}
