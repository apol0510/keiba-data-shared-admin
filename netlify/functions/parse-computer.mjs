/**
 * コンピ指数データパーサー（全競馬場対応）
 * 日刊コンピ指数のテキストデータをJSON形式に変換
 */

export const handler = async (event) => {
  // CORSヘッダー
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // OPTIONSリクエスト処理
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // POSTリクエストのみ許可
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const { raceDate, venue, computerData } = JSON.parse(event.body);

    // バリデーション
    if (!raceDate || !venue || !computerData) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '必須項目が不足しています' })
      };
    }

    console.log(`[Parse Computer] 開始: ${raceDate} ${venue}`);

    // パース実行
    const parsedData = parseComputerData(raceDate, venue, computerData);

    console.log(`[Parse Computer] 完了: ${parsedData.races.length}レース`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(parsedData)
    };

  } catch (error) {
    console.error('[Parse Computer] エラー:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'パース処理に失敗しました',
        details: error.message
      })
    };
  }
};

/**
 * コンピ指数データをパース
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

    // レース番号検出（例: "1R", "12R"）
    const raceNumberMatch = line.match(/^(\d{1,2})R$/);
    if (raceNumberMatch) {
      // 前のレースを保存
      if (currentRaceNumber && horses.length > 0) {
        races.push({
          raceNumber: parseInt(currentRaceNumber),
          ...currentRaceInfo,
          horses: horses
        });
        console.log(`[Parse Computer] R${currentRaceNumber} 保存完了: ${horses.length}頭`);
      }

      // 新しいレース開始
      currentRaceNumber = raceNumberMatch[1];
      currentRaceInfo = {};
      horses = [];
      inHorseData = false;
      console.log(`[Parse Computer] R${currentRaceNumber} 開始`);
      continue;
    }

    // レース情報行（例: "大井1R 10:55発走 / ダート1200m (右)"）
    const raceInfoMatch = line.match(/^(.+?)(\d{1,2})R\s+(\d{1,2}:\d{2})発走\s+\/\s+(.+?)(\d{3,4})m\s+\((.+?)\)/);
    if (raceInfoMatch) {
      const venueInText = raceInfoMatch[1].trim();
      const startTime = raceInfoMatch[3];
      const surfaceAndOther = raceInfoMatch[4].trim();
      const distance = parseInt(raceInfoMatch[5]);
      const direction = raceInfoMatch[6];

      // 表面とコース条件を分離
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

    // レース名・賞金情報（例: "一般 賞金:1着80万円..."）
    if (line.includes('賞金:')) {
      const raceNameMatch = line.match(/^(.+?)\s+賞金:/);
      if (raceNameMatch) {
        const type = raceNameMatch[1].trim();
        // 既存のレース名（等級）と組み合わせる
        if (currentRaceInfo.raceName) {
          currentRaceInfo.raceName = `${type} ${currentRaceInfo.raceName}`;
        } else {
          currentRaceInfo.raceName = type;
        }
      }
      continue;
    }

    // レース名のみ（例: "Ｃ３", "３歳", "如月賞"）
    if (!currentRaceInfo.raceName && line.length > 0 && line.length < 20 && !line.includes('馬') && !line.includes('指数')) {
      currentRaceInfo.raceName = line;
      continue;
    }

    // テーブルヘッダー検出（馬データ開始）
    if (line.includes('馬番') || line.includes('馬名') || line.includes('指数')) {
      inHorseData = true;
      continue;
    }

    // 馬データ行をパース
    if (inHorseData) {
      // 枠番の行（1-8の単独数字）
      if (line.match(/^[1-8]$/) && i + 4 < lines.length) {
        const bracket = parseInt(line);

        // 次の行が馬番（1-18の数字）
        const numberLine = lines[i + 1].trim();
        const numberMatch = numberLine.match(/^(\d{1,2})$/);

        if (numberMatch) {
          const number = parseInt(numberMatch[1]);

          // その次が馬名
          const name = lines[i + 2].trim();

          // その次が指数
          const indexLine = lines[i + 3].trim();
          const indexMatch = indexLine.match(/^(\d{1,3})$/);

          if (indexMatch) {
            const computerIndex = parseInt(indexMatch[1]);

            // その次が人気
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

            // 5行スキップ（枠番→馬番→馬名→指数→人気）
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

  console.log(`[Parse Computer] パース完了: ${races.length}レース検出`);
  races.forEach((race, idx) => {
    console.log(`  R${race.raceNumber}: ${race.horses.length}頭`);
  });

  // カテゴリ判定
  const category = getCategoryByVenue(venue);
  const venueCode = getVenueCode(venue);

  return {
    date: raceDate,
    venue: venue,
    venueCode: venueCode,
    category: category,
    dataSource: 'nikkan-computer',
    races: races,
    dataVersion: '1.0',
    createdAt: new Date().toISOString()
  };
}

/**
 * 競馬場からカテゴリを判定
 */
function getCategoryByVenue(venue) {
  const jra = ['東京', '中山', '阪神', '京都', '中京', '新潟', '小倉', '札幌', '函館', '福島'];
  const nankan = ['大井', '川崎', '船橋', '浦和'];

  if (jra.includes(venue)) return 'jra';
  if (nankan.includes(venue)) return 'nankan';
  return 'local';
}

/**
 * 競馬場コードを取得
 */
function getVenueCode(venue) {
  const codes = {
    '東京': 'TO', '中山': 'NA', '阪神': 'HA', '京都': 'KY',
    '中京': 'CH', '新潟': 'NI', '小倉': 'KO', '札幌': 'SA',
    '函館': 'HK', '福島': 'FU',
    '大井': 'OI', '川崎': 'KA', '船橋': 'FU', '浦和': 'UR',
    '門別': 'MO', '盛岡': 'MO', '水沢': 'MI', '金沢': 'KA',
    '笠松': 'KS', '名古屋': 'NA', '園田': 'SO', '姫路': 'HI',
    '高知': 'KO', '佐賀': 'SA'
  };
  return codes[venue] || 'XX';
}
