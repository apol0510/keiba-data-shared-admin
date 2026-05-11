/**
 * 穴馬抽出ロジック（preview-computer.mjs と save-computer.mjs で共有）
 *
 * - racebook 取得 / pastRaces 補完 / 穴馬抽出を一元化
 * - preview と save で判定ロジックがズレないようにする
 * - データ欠損で処理が落ちないよう、null セーフに実装
 *
 * 抽出方針（2026-05-12 改訂）:
 * - 必須条件:
 *   - popularityRank !== 1（人気1位を除外）
 *   - computerIndex > 50
 *   - lastFinish !== 1
 *   - lastFinish !== 2
 *   - popularityRank > indexRank（gap >= 1）
 * - 通常抽出の優先度: 6〜9着 > 10〜12着 > 3〜5着
 * - 通常抽出 0 頭のレースは fallback で最低 1 頭確保。
 *   fallback でも 人気1位 / 前走連対 は絶対除外。指数50以下は最後にだけ緩和可能。
 * - fallback は category='fallback'（画面では「注目候補」表示）。
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
 * 前走着順の優先度（小さいほど優先）
 * 通常抽出: 6〜9着 > 10〜12着 > 3〜5着
 * fallback: 6〜12着 > 3〜5着 > その他
 */
function getNormalFinishPriority(lf) {
  if (lf == null) return 99;
  if (lf >= 6 && lf <= 9) return 1;
  if (lf >= 10 && lf <= 12) return 2;
  if (lf === 4 || lf === 5) return 3;
  if (lf === 3) return 4;
  return 99;
}

function getFallbackFinishPriority(lf) {
  if (lf == null) return 5;
  if (lf >= 6 && lf <= 12) return 1;
  if (lf === 3 || lf === 4 || lf === 5) return 2;
  if (lf >= 13) return 3;
  return 4;
}

/**
 * 1レース分の馬データから穴馬候補を抽出
 *
 * 通常抽出（必須条件すべて満たす馬のみ）:
 * - popularityRank !== 1
 * - computerIndex > 50
 * - lastFinish !== 1
 * - lastFinish !== 2
 * - popularityRank > indexRank（gap >= 1）
 *
 * 通常抽出が 0 頭の場合のみ fallback で最低 1 頭を確保。
 *
 * @param {object} race - { horses: [{ number, name, computerIndex, popularity, pastRaces }] }
 * @returns {Array<object>}
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

    // 人気1位を除外
    if (popularityRank === 1) continue;

    // 指数50以下を除外
    const ci = h.computerIndex != null ? parseFloat(h.computerIndex) : null;
    if (ci == null || ci <= 50) continue;

    // 必須条件: gap >= 1
    const gap = popularityRank - indexRank;
    if (gap < 1) continue;

    // 前走着順
    const pr = Array.isArray(h.pastRaces) && h.pastRaces.length > 0
      ? h.pastRaces[h.pastRaces.length - 1]
      : null;
    const lastFinish = extractLastFinish(pr);

    // 前走1着・2着は完全除外
    if (lastFinish === 1 || lastFinish === 2) continue;

    // 通常抽出は 前走3〜5 / 6〜9 / 10〜12 のみ
    const priority = getNormalFinishPriority(lastFinish);
    if (priority === 99) continue;

    // スコア（並び順用）
    let finishScore = 0;
    if (lastFinish >= 6 && lastFinish <= 9) finishScore = 30;
    else if (lastFinish >= 10 && lastFinish <= 12) finishScore = 22;
    else if (lastFinish === 4 || lastFinish === 5) finishScore = 16;
    else if (lastFinish === 3) finishScore = 8;

    let indexRankBonus = 0;
    if (indexRank >= 3 && indexRank <= 6) indexRankBonus = 5;
    else if (indexRank <= 2) indexRankBonus = -10;

    const score = gap * 10 + finishScore + indexRankBonus;

    // カテゴリ: 穴馬=前走6〜12着 / 妙味馬=前走3〜5着
    const category = (lastFinish >= 6 && lastFinish <= 12) ? 'darkhorse' : 'value';

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
      reasons: [],
      exceptional2nd: false,
    });
  }

  // 優先度（前走着順帯）→ スコア降順
  candidates.sort((a, b) => {
    const pa = getNormalFinishPriority(a.lastFinish);
    const pb = getNormalFinishPriority(b.lastFinish);
    if (pa !== pb) return pa - pb;
    return b.score - a.score;
  });

  if (candidates.length === 0) {
    return buildFallbackPicks(horses, indexRankMap);
  }

  return candidates.slice(0, 3);
}

/**
 * 通常抽出 0 頭の場合の救済ピック（最低 1 頭確保）。
 *
 * 絶対除外: 人気1位 / 前走1着 / 前走2着。
 * 指数50以下は最初は除外、それでも 0 頭になる場合のみ最後に緩和。
 * 優先度: 前走6〜12着 > 前走3〜5着 > その他 → indexRank 昇順 → computerIndex 降順。
 */
function buildFallbackPicks(horses, indexRankMap) {
  if (!Array.isArray(horses) || horses.length === 0) return [];

  const annotated = horses
    .map(h => {
      const indexRank = indexRankMap.get(String(h.number));
      if (!indexRank) return null;
      const popularityRank = h.popularity != null ? parseInt(h.popularity, 10) : null;
      const ci = h.computerIndex != null ? parseFloat(h.computerIndex) : null;
      const pr = Array.isArray(h.pastRaces) && h.pastRaces.length > 0
        ? h.pastRaces[h.pastRaces.length - 1]
        : null;
      const lastFinish = extractLastFinish(pr);
      return { h, indexRank, popularityRank, ci, lastFinish };
    })
    .filter(Boolean)
    // 絶対除外: 人気1位 / 前走1着 / 前走2着
    .filter(({ popularityRank }) => popularityRank !== 1)
    .filter(({ lastFinish }) => lastFinish !== 1 && lastFinish !== 2);

  if (annotated.length === 0) return [];

  const pickOne = (pool) => {
    if (pool.length === 0) return null;
    const sorted = pool.slice().sort((a, b) => {
      const pa = getFallbackFinishPriority(a.lastFinish);
      const pb = getFallbackFinishPriority(b.lastFinish);
      if (pa !== pb) return pa - pb;
      if (a.indexRank !== b.indexRank) return a.indexRank - b.indexRank;
      return (b.ci ?? 0) - (a.ci ?? 0);
    });
    return sorted[0];
  };

  // 第一段: 指数 > 50 のなかから選ぶ
  let pick = pickOne(annotated.filter(({ ci }) => ci != null && ci > 50));
  // 第二段: 全馬指数50以下のレースだけ最後に緩和
  if (!pick) pick = pickOne(annotated);
  if (!pick) return [];

  const { h, indexRank, popularityRank, lastFinish } = pick;
  const gap = popularityRank != null ? popularityRank - indexRank : 0;
  return [{
    number: h.number,
    name: h.name,
    // popularity 欠損レースでは null のまま保持する（indexRank で偽装しない）
    popularityRank: popularityRank ?? null,
    indexRank,
    gap: gap > 0 ? gap : 0,
    lastFinish,
    score: 50,
    category: 'fallback',
    computerIndex: h.computerIndex,
    reasons: [],
    fallback: true,
  }];
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
