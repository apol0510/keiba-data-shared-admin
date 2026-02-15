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

    // レース番号検出
    const raceNumberMatch = line.match(/^(\d{1,2})R$/);
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

    // レース名・賞金情報
    if (line.includes('賞金:')) {
      const raceNameMatch = line.match(/^(.+?)\s+賞金:/);
      if (raceNameMatch) {
        const type = raceNameMatch[1].trim();
        if (type !== '一般') {
          if (currentRaceInfo.raceName) {
            currentRaceInfo.raceName = `${type} ${currentRaceInfo.raceName}`;
          } else {
            currentRaceInfo.raceName = type;
          }
        }
      }
      continue;
    }

    // レース名のみ
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
          const name = lines[i + 2].trim();
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
 * 予想データで補完（save-computer.mjsと同じ）
 */
async function enrichWithPredictionData(computerData) {
  const { date, venue, category } = computerData;

  if (category !== 'jra' && category !== 'nankan') {
    console.log('[Preview Enrich] 地方競馬のため補完スキップ');
    return computerData;
  }

  try {
    const predictionData = await fetchPredictionData(date, category);

    if (!predictionData) {
      console.log('[Preview Enrich] 予想データなし（補完スキップ）');
      return computerData;
    }

    console.log('[Preview Enrich] 予想データ取得成功、補完開始');

    const enrichedRaces = computerData.races.map(computerRace => {
      let predictionRace = null;

      if (category === 'jra') {
        const venueRaces = predictionData.venues?.find(v => v.venue === venue);
        if (venueRaces) {
          predictionRace = venueRaces.races.find(r =>
            parseInt(r.raceInfo.raceNumber) === computerRace.raceNumber
          );
        }
      } else {
        predictionRace = predictionData.races?.find(r =>
          r.raceInfo.raceNumber === `${computerRace.raceNumber}R`
        );
      }

      if (!predictionRace) {
        console.log(`[Preview Enrich] R${computerRace.raceNumber}: 予想データなし`);
        return computerRace;
      }

      const enrichedHorses = computerRace.horses.map(computerHorse => {
        let predictionHorse = predictionRace.horses.find(h =>
          h.number === computerHorse.number
        );

        if (!predictionHorse) {
          predictionHorse = predictionRace.horses.find(h =>
            h.name === computerHorse.name
          );
        }

        if (!predictionHorse) {
          console.log(`[Preview Enrich] R${computerRace.raceNumber} ${computerHorse.number}番 ${computerHorse.name}: マッチなし`);
          return computerHorse;
        }

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
    console.error('[Preview Enrich] 補完エラー:', error);
    console.log('[Preview Enrich] 補完なしで続行');
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

  console.log(`[Preview Fetch Prediction] URL: ${url}`);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.log(`[Preview Fetch Prediction] データなし: ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log(`[Preview Fetch Prediction] データ取得成功`);
    return data;

  } catch (error) {
    console.error('[Preview Fetch Prediction] エラー:', error);
    return null;
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
    '門別': 'MON', '盛岡': 'MOR', '水沢': 'MIZ', '金沢': 'KNZ',
    '笠松': 'KSM', '名古屋': 'NGY', '園田': 'SON', '姫路': 'HIM',
    '高知': 'KOC', '佐賀': 'SAG'
  };
  return codes[venue] || 'XXX';
}
