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

    // コンピ指数で補完（事前にcomputer-managerで保存済みの場合）
    await enrichWithComputerIndex(data);

    // GitHubに保存
    const result = await saveToGitHub(data);

    console.log(`[Save KeibaBook] 完了: ${result.filePath}`);

    // keiba-intelligenceへの自動インポートトリガー（repository_dispatch）
    const KEIBA_INTELLIGENCE_TOKEN = process.env.KEIBA_INTELLIGENCE_TOKEN || process.env.GITHUB_TOKEN_KEIBA_DATA_SHARED;
    const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'apol0510';

    const category = data.category || 'jra';

    // dispatch対象: JRAと南関のみ。地方全場(local)はdispatchしない
    if (KEIBA_INTELLIGENCE_TOKEN && (category === 'jra' || category === 'nankan')) {
      const dispatchUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/keiba-intelligence/dispatches`;

      fetch(dispatchUrl, {
        method: 'POST',
        headers: {
          'Authorization': `token ${KEIBA_INTELLIGENCE_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event_type: 'prediction-updated',
          client_payload: {
            date: data.date,
            track: data.track,
            trackCode: data.trackCode,
            category: category,
            source: 'racebook'
          }
        })
      }).then(response => {
        if (response.ok) {
          console.log(`✅ keiba-intelligenceにインポートトリガー送信 (prediction-updated, date: ${data.date})`);
        } else {
          console.warn(`⚠️ dispatch失敗: ${response.status}`);
        }
      }).catch(err => {
        console.warn('⚠️ dispatch送信エラー:', err.message);
      });
    } else if (category === 'local') {
      console.log(`📋 [Save] 地方データ(${data.track}): keiba-intelligence dispatchスキップ`);
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
    if (!res.ok) {
      console.log(`[Enrich] コンピ指数なし (${res.status})、補完スキップ`);
      return;
    }

    const fileData = await res.json();
    const compiJson = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf-8'));

    if (!compiJson.races) {
      console.log('[Enrich] コンピ指数にracesなし');
      return;
    }

    let enriched = 0;
    const COMPI_THRESHOLD = 45; // この値以上は抑え馬として有効

    for (const race of data.races) {
      const compiRace = compiJson.races.find(r => r.raceNumber === race.raceNumber);
      if (!compiRace || !compiRace.horses) continue;

      for (const horse of race.horses) {
        // コンピ指数を補完（馬番一致で照合）
        const compiHorse = compiRace.horses.find(ch => ch.number === horse.number);
        if (!compiHorse) continue;

        const compiVal = compiHorse.computerIndex;
        if (compiVal && (!horse.computerIndex || horse.computerIndex === '')) {
          horse.computerIndex = String(compiVal);
          enriched++;
        }

        // 印なし（totalScore=0）で assignment=無 の馬を再評価
        if (horse.totalScore === 0 && horse.assignment === '無') {
          const ci = parseInt(horse.computerIndex || compiVal || '0');
          if (ci >= COMPI_THRESHOLD) {
            horse.assignment = '補欠';
          } else {
            horse.assignment = '不要';
          }
        }
      }

      // assignments を再構築（不要馬を除外）
      rebuildAssignments(race);
    }

    console.log(`[Enrich] コンピ指数補完: ${enriched}頭`);

  } catch (err) {
    console.warn('[Enrich] コンピ指数補完エラー（続行）:', err.message);
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
      case '不要': break; // 不要馬はどこにも入れない
      default: a.none.push(h.number); break;
    }
  }

  race.assignments = a;
}
