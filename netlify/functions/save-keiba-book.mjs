/**
 * レースデータ保存API
 * keiba-data-sharedリポジトリに保存
 * パス: jra/racebook/YYYY/MM/YYYY-MM-DD-{venueCode}.json
 */

import { dispatchToTargets } from '../lib/dispatch.mjs';

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

    // コンピ指数で補完（事前にcomputer-managerで保存済みの場合）
    await enrichWithComputerIndex(data);

    // GitHubに保存
    const result = await saveToGitHub(data);

    console.log(`[Save KeibaBook] 完了: ${result.filePath}`);

    // 既存のコンピ指数ファイルへ騎手/調教師/斤量/性齢を逆補完
    // （computer-manager → race-data-importer の順で保存されたケースに対応）
    await backfillComputerFile(data);

    // repository_dispatch: keiba-intelligence + analytics-keiba へ並列送信
    // dispatch対象: JRAと南関のみ。地方全場(local)はdispatchしない
    // JRA → prediction-jra-updated（importPredictionJra.jsを起動）
    // 南関 → prediction-updated（importPrediction.jsを起動）
    const category = data.category || 'jra';
    if (category === 'jra' || category === 'nankan') {
      const eventType = category === 'jra' ? 'prediction-jra-updated' : 'prediction-updated';
      dispatchToTargets(eventType, {
        date: data.date,
        track: data.track,
        trackCode: data.trackCode,
        category,
        source: 'racebook',
      });
    } else if (category === 'local') {
      console.log(`📋 [Save] 地方データ(${data.track}): dispatchスキップ`);
    }

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

/**
 * コンピ指数で補完
 * computer-managerで事前保存されたデータをフェッチし、各馬にcomputerIndexを補完
 * コンピ45以上で印なし → 補欠に昇格、44以下 → 不要馬
 */
async function enrichWithComputerIndex(data) {
  const { date, trackCode, category } = data;
  const cat = category || 'jra';
  const [year, month] = date.split('-');
  const token = process.env.GITHUB_TOKEN_KEIBA_DATA_SHARED;
  const repo = 'apol0510/keiba-data-shared';

  // コンピ指数ファイルパス
  const compiPath = `${cat}/predictions/computer/${year}/${month}/${date}-${trackCode}.json`;
  const url = `https://api.github.com/repos/${repo}/contents/${compiPath}`;

  console.log(`[Enrich] コンピ指数取得: ${compiPath}`);

  try {
    const headers = token
      ? { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' }
      : { 'Accept': 'application/vnd.github.v3+json' };

    const res = await fetch(url, { headers });
    let compiJson = null;

    if (res.ok) {
      const fileData = await res.json();
      compiJson = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf-8'));
      if (!compiJson.races) compiJson = null;
    }

    if (!compiJson) {
      console.log(`[Enrich] コンピ指数なし、印のみで振り分け確定`);
    }

    const COMPI_THRESHOLD = 45;
    let enriched = 0;

    for (const race of data.races) {
      const compiRace = compiJson?.races?.find(r => r.raceNumber === race.raceNumber);

      for (const horse of race.horses) {
        // コンピ指数の補完（コンピデータがある場合）
        if (compiRace) {
          const compiHorse = compiRace.horses?.find(ch => ch.number === horse.number);
          if (compiHorse?.computerIndex) {
            if (!horse.computerIndex || horse.computerIndex === '') {
              horse.computerIndex = String(compiHorse.computerIndex);
              enriched++;
            }
          }
        }

        // 印なし（totalScore=0）で assignment=無 の馬を再評価
        if (horse.totalScore === 0 && horse.assignment === '無') {
          const ci = parseInt(horse.computerIndex || '0');
          if (ci > 0 && ci >= COMPI_THRESHOLD) {
            // コンピ45以上: 補欠に昇格
            horse.assignment = '補欠';
          }
          // コンピ44以下 or コンピなし: 「無」のまま
        }
      }

      // assignments を再構築
      rebuildAssignments(race);
    }

    if (compiJson) {
      console.log(`[Enrich] コンピ指数補完: ${enriched}頭`);
    }

  } catch (err) {
    console.warn('[Enrich] コンピ指数補完エラー（続行）:', err.message);
  }
}

/**
 * 既存のコンピ指数ファイルへ騎手/調教師/斤量/性齢を逆補完
 * racebook 保存後、predictions/computer/ に同日同会場のファイルがあれば
 * jockey/trainer/weight/ageGender を racebook 側の値で埋めて再保存する。
 * これにより computer-manager → race-data-importer の順で保存しても
 * 表示側 (predictions/computer/ 参照) に騎手・調教師が反映される。
 */
async function backfillComputerFile(data) {
  const { date, trackCode, category } = data;
  const cat = category || 'jra';
  const [year, month] = date.split('-');
  const token = process.env.GITHUB_TOKEN_KEIBA_DATA_SHARED;
  const repo = 'apol0510/keiba-data-shared';

  if (!token) {
    console.log('[Backfill] token未設定、スキップ');
    return;
  }

  const compiPath = `${cat}/predictions/computer/${year}/${month}/${date}-${trackCode}.json`;
  const url = `https://api.github.com/repos/${repo}/contents/${compiPath}`;

  try {
    const getRes = await fetch(url, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!getRes.ok) {
      console.log(`[Backfill] コンピ指数ファイルなし、スキップ: ${compiPath}`);
      return;
    }

    const fileData = await getRes.json();
    const sha = fileData.sha;
    const compiJson = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf-8'));

    if (!compiJson?.races?.length) {
      console.log('[Backfill] races配列なし、スキップ');
      return;
    }

    let updated = 0;
    for (const compiRace of compiJson.races) {
      const rbRace = data.races.find(r => r.raceNumber === compiRace.raceNumber);
      if (!rbRace) continue;

      for (const compiHorse of compiRace.horses || []) {
        let rbHorse = rbRace.horses.find(h => h.number === compiHorse.number);
        if (!rbHorse) {
          rbHorse = rbRace.horses.find(h => h.name && h.name === compiHorse.name);
        }
        if (!rbHorse) continue;

        // racebook側が真値。空のフィールドを埋める（既存値も上書き）
        if (rbHorse.jockey) { compiHorse.jockey = rbHorse.jockey; updated++; }
        if (rbHorse.trainer) { compiHorse.trainer = rbHorse.trainer; }
        if (rbHorse.weight != null) { compiHorse.weight = rbHorse.weight; }
        const sa = rbHorse.sexAge || rbHorse.ageGender;
        if (sa) { compiHorse.ageGender = sa; }
      }
    }

    if (updated === 0) {
      console.log('[Backfill] 補完対象なし、スキップ');
      return;
    }

    compiJson.backfilledFrom = 'racebook';
    compiJson.backfilledAt = new Date().toISOString();

    const putPayload = {
      message: `🔄 コンピ指数へ騎手/調教師を逆補完: ${date} ${data.track}\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)`,
      content: Buffer.from(JSON.stringify(compiJson, null, 2)).toString('base64'),
      branch: 'main',
      sha
    };

    const putRes = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(putPayload)
    });

    if (putRes.ok) {
      console.log(`[Backfill] コンピ指数更新成功: ${updated}頭補完`);
    } else {
      const errTxt = await putRes.text();
      console.warn(`[Backfill] 更新失敗: ${putRes.status} ${errTxt}`);
    }
  } catch (err) {
    console.warn('[Backfill] エラー（続行）:', err.message);
  }
}

/**
 * assignments を再構築
 * assignment フィールドから逆引きして assignments オブジェクトを更新
 */
function rebuildAssignments(race) {
  const a = { main: null, sub: null, hole: null, connectTop: null, connect: [], reserve: [], none: [] };

  for (const h of race.horses) {
    switch (h.assignment) {
      case '本命': a.main = h.number; break;
      case '対抗': a.sub = h.number; break;
      case '単穴': a.hole = h.number; break;
      case '連下最上位': a.connectTop = h.number; break;
      case '連下': a.connect.push(h.number); break;
      case '補欠': a.reserve.push(h.number); break;
      default: a.none.push(h.number); break;
    }
  }

  race.assignments = a;
}
