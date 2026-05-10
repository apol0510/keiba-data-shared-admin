/**
 * 穴馬抽出ロジック（preview-computer.mjs と save-computer.mjs で共有）
 *
 * - racebook 取得 / pastRaces 補完 / 穴馬抽出を一元化
 * - preview と save で判定ロジックがズレないようにする
 * - データ欠損で処理が落ちないよう、null セーフに実装
 */

/**
 * keiba-data-shared から racebook JSON を取得（穴馬抽出用に pastRaces を取得する目的）
 * 取得失敗時は null を返す（呼び出し側でハンドリング）
 *
 * @param {string} date - YYYY-MM-DD
 * @param {string} category - 'jra' | 'nankan'
 * @param {string} venueCode - 例: 'OOI', 'TOK'
 * @returns {Promise<object|null>}
 */
export async function fetchRacebookData(date, category, venueCode) {
  if (!date || !category || !venueCode) return null;
  const [year, month] = date.split('-');
  const url = `https://raw.githubusercontent.com/apol0510/keiba-data-shared/main/${category}/racebook/${year}/${month}/${date}-${venueCode}.json`;
  try {
    const r = await fetch(url);
    if (!r.ok) {
      console.log(`[DarkHorse Racebook] ${r.status}: ${url}`);
      return null;
    }
    const data = await r.json();
    console.log(`[DarkHorse Racebook] ✅ ${date}-${venueCode}.json`);
    return data;
  } catch (e) {
    console.warn('[DarkHorse Racebook] fetch error:', e.message);
    return null;
  }
}

/**
 * racebook データから対象レース・馬の馬データを引き当てる
 * raceNumber と馬番/馬名で照合
 */
export function findRacebookHorse(racebookData, raceNumber, target) {
  if (!racebookData || !Array.isArray(racebookData.races)) return null;
  const race = racebookData.races.find(r => parseInt(r.raceNumber) === parseInt(raceNumber));
  if (!race || !Array.isArray(race.horses)) return null;
  let h = race.horses.find(x => String(x.number) === String(target.number));
  if (!h && target.name) {
    h = race.horses.find(x => x.name === target.name);
  }
  return h || null;
}

/**
 * pastRaces[0] から前走着順を抽出
 * 複数候補キーを順に試し、数値化できなければ null を返す
 * 例外的な「除外」「取消」「中止」等は数字以外を含むため null になる
 *
 * @param {object|null} pastRace - pastRaces[0] 想定
 * @returns {number|null}
 */
export function extractLastFinish(pastRace) {
  if (!pastRace) return null;
  const rawFinish =
    pastRace.finish ??
    pastRace.finishPosition ??
    pastRace.position ??
    pastRace.rank ??
    pastRace.chakujun ??
    pastRace.result ??
    null;
  if (rawFinish == null) return null;
  const digits = String(rawFinish).replace(/[^\d]/g, '');
  if (digits.length === 0) return null;
  const n = parseInt(digits, 10);
  if (isNaN(n) || n <= 0) return null;
  return n;
}

/**
 * 1レース分の馬データから穴馬候補を抽出
 *
 * 条件:
 * - 人気順位 > 指数順位（指数の方が上位）
 * - 人気1〜2位は穴馬対象から除外（指数妙味馬扱いの余地はある）
 * - スコア = 指数差スコア + 前走スコア
 *   指数差スコア = (人気順位 - 指数順位) × 10
 *   前走スコア:
 *     8着以下 → +30 / 5〜7着 → +15 / 4着 → +5 / 1〜3着 → -20 + 指数妙味馬区分
 *     データなし → 0（理由文に「前走データなし」を記載）
 *
 * @param {object} race - { horses: [{ number, name, computerIndex, popularity, pastRaces }] }
 * @returns {Array<object>} 穴馬候補（最大3頭、score 降順）
 */
export function extractDarkHorses(race) {
  const horses = Array.isArray(race?.horses) ? race.horses : [];
  if (horses.length < 2) return [];

  // 指数順位（高い指数 = 上位）
  const indexed = horses
    .filter(h => h.computerIndex != null && !isNaN(parseFloat(h.computerIndex)))
    .map(h => ({ h, ci: parseFloat(h.computerIndex) }))
    .sort((a, b) => b.ci - a.ci);
  const indexRankMap = new Map();
  indexed.forEach((entry, i) => indexRankMap.set(String(entry.h.number), i + 1));

  const candidates = [];
  for (const h of horses) {
    const popularityRank = h.popularity != null ? parseInt(h.popularity, 10) : null;
    const indexRank = indexRankMap.get(String(h.number)) || null;
    if (!popularityRank || !indexRank) continue;

    const gap = popularityRank - indexRank;
    if (gap <= 0) continue; // 指数の方が上位でなければ対象外

    // 前走着順（pastRaces は古い順→新しい順で格納されるため、最新は配列末尾）
    const pr = Array.isArray(h.pastRaces) && h.pastRaces.length > 0
      ? h.pastRaces[h.pastRaces.length - 1]
      : null;
    const lastFinish = extractLastFinish(pr);

    // スコア計算
    const gapScore = gap * 10;
    let finishScore = 0;
    let category = 'darkhorse'; // 'darkhorse' | 'value'
    if (lastFinish != null) {
      if (lastFinish >= 8) finishScore = 30;
      else if (lastFinish >= 5) finishScore = 15;
      else if (lastFinish === 4) finishScore = 5;
      else if (lastFinish <= 3) {
        finishScore = -20;
        category = 'value';
      }
    }

    // 人気1〜2位は穴馬扱いから除外（強好走で指数妙味としても残せない場合は完全に外す）
    if (popularityRank <= 2) {
      if (lastFinish != null && lastFinish <= 3) continue;
      category = 'value';
    }

    const score = gapScore + finishScore;

    // 理由文
    const reasons = [];
    reasons.push(`人気${popularityRank}位／指数${indexRank}位（差${gap}）`);
    if (lastFinish != null) {
      if (lastFinish >= 8) reasons.push('前走凡走で人気を落としている可能性');
      else if (lastFinish >= 5) reasons.push('前走伸び切れず指数上は巻き返し余地あり');
      else if (lastFinish === 4) reasons.push('前走僅差4着、指数は上位');
      else reasons.push('前走好走、指数も裏付け（妙味タイプ）');
    } else {
      reasons.push('前走データなし、指数差のみで判定');
    }

    candidates.push({
      number: h.number,
      name: h.name,
      popularityRank,
      indexRank,
      gap,
      lastFinish,
      score,
      category,
      computerIndex: h.computerIndex,
      reasons,
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  // フォールバック: 通常抽出で 0 件（人気と指数順位が完全一致するレース等）の場合、
  // 中位指数（3〜5位優先、不足分は 6〜7位）から最大 3 頭をピックアップ。
  // 候補ゼロのままだとカードが「該当馬なし」になり情報量が乏しくなるための救済処置。
  if (candidates.length === 0) {
    return buildFallbackPicks(horses, indexRankMap);
  }

  return candidates.slice(0, 3);
}

/**
 * 通常抽出で候補ゼロの場合の救済ピック
 * 指数3〜5位の中位馬から最大3頭。前走3着以内なら category=value（妙味馬）、
 * それ以外は category=darkhorse として返す。スコアは 50 固定（★★★相当）。
 */
function buildFallbackPicks(horses, indexRankMap) {
  if (!Array.isArray(horses) || horses.length === 0) return [];

  const annotated = horses
    .map(h => {
      const indexRank = indexRankMap.get(String(h.number));
      if (!indexRank) return null;
      const popularityRank = h.popularity != null ? parseInt(h.popularity, 10) : null;
      return { h, indexRank, popularityRank };
    })
    .filter(Boolean);

  if (annotated.length === 0) return [];

  // 優先順位: 3〜5位 → 6〜7位
  const tier1 = annotated.filter(x => x.indexRank >= 3 && x.indexRank <= 5);
  const tier2 = annotated.filter(x => x.indexRank >= 6 && x.indexRank <= 7);
  const sortByRank = (a, b) => a.indexRank - b.indexRank;
  const picks = [...tier1.sort(sortByRank), ...tier2.sort(sortByRank)].slice(0, 3);

  return picks.map(({ h, indexRank, popularityRank }) => {
    const pr = Array.isArray(h.pastRaces) && h.pastRaces.length > 0
      ? h.pastRaces[h.pastRaces.length - 1]
      : null;
    const lastFinish = extractLastFinish(pr);
    const isValue = lastFinish != null && lastFinish <= 3;
    return {
      number: h.number,
      name: h.name,
      popularityRank: popularityRank || indexRank,
      indexRank,
      gap: 0,
      lastFinish,
      score: 50,
      category: isValue ? 'value' : 'darkhorse',
      computerIndex: h.computerIndex,
      reasons: ['人気と指数評価が拮抗するレースのため中位指数から抽出', '中位指数の妙味候補'],
      fallback: true,
    };
  });
}

/**
 * computerData に対して racebook の pastRaces をマージし、各レースに darkHorses を追加する
 * - racebookData が null の場合でも穴馬抽出は試みる（pastRaces なしで指数差のみ判定）
 * - 元の computerData は破壊せず、新オブジェクトを返す
 *
 * @param {object} computerData
 * @param {object|null} racebookData
 * @returns {object} 拡張後の computerData
 */
export function applyDarkHorsesToComputerData(computerData, racebookData) {
  const generatedAt = new Date().toISOString();
  const enrichedRaces = (computerData.races || []).map(race => {
    const enrichedHorses = (race.horses || []).map(h => {
      // 既に pastRaces があれば優先、なければ racebook から取得
      if (Array.isArray(h.pastRaces) && h.pastRaces.length > 0) return h;
      const rh = findRacebookHorse(racebookData, race.raceNumber, h);
      return { ...h, pastRaces: rh?.pastRaces || [] };
    });
    const raceForExtract = { ...race, horses: enrichedHorses };
    const darkHorses = extractDarkHorses(raceForExtract);
    return { ...race, horses: enrichedHorses, darkHorses };
  });
  return {
    ...computerData,
    races: enrichedRaces,
    darkHorsesGeneratedAt: generatedAt,
  };
}
