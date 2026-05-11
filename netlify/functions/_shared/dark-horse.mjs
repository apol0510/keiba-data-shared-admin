/**
 * 穴馬抽出ロジック（preview-computer.mjs と save-computer.mjs で共有）
 *
 * - racebook 取得 / pastRaces 補完 / 穴馬抽出を一元化
 * - preview と save で判定ロジックがズレないようにする
 * - データ欠損で処理が落ちないよう、null セーフに実装
 *
 * 抽出方針（2026-05-11 改訂）:
 * - 必須条件: popularityRank > indexRank（gap >= 1）
 * - 前走1着は完全除外
 * - 前走2着は原則除外、例外として gap >= 4 かつ indexRank 3〜6 のみ補完候補
 * - 前走着順優先度: 6〜9着 > 10〜12着 > 4〜5着 > 3着
 * - 穴馬と妙味馬の上昇余地を最大化する設計
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
 * 6〜9着 > 10〜12着 > 4〜5着 > 3着 > 13着〜 > null > 例外2着
 */
function getFinishPriority(lf, isExceptional2nd = false) {
  if (isExceptional2nd) return 7;
  if (lf == null) return 6;
  if (lf >= 6 && lf <= 9) return 1;
  if (lf >= 10 && lf <= 12) return 2;
  if (lf === 4 || lf === 5) return 3;
  if (lf === 3) return 4;
  if (lf >= 13) return 5;
  return 8;
}

/**
 * 1レース分の馬データから穴馬候補を抽出
 *
 * 必須条件:
 * - popularityRank > indexRank（gap >= 1）
 * - 前走1着は完全除外
 * - 前走2着は原則除外、例外は gap >= 4 かつ indexRank 3〜6 のみ
 *
 * スコア:
 *   gapScore = gap × 10
 *   finishScore:
 *     6〜9着: +30 / 10〜12着: +22 / 4〜5着: +16 / 3着: +8
 *     2着(例外): -15 / 13着〜: +5 / null: 0
 *   indexRankBonus: 3〜6位: +5 / 1〜2位: -10
 *
 * カテゴリ:
 *   穴馬: 前走6〜9着 かつ gap >= 2
 *   妙味馬: 前走3〜5着 or 10〜12着 or 例外2着
 *
 * @param {object} race - { horses: [{ number, name, computerIndex, popularity, pastRaces }] }
 * @returns {Array<object>} 穴馬候補（最大3頭、優先度→スコア降順）
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
    // 必須条件: 人気順位 > 指数順位
    if (gap < 1) continue;

    // 前走着順（pastRaces は古い順→新しい順で格納されるため、最新は配列末尾）
    const pr = Array.isArray(h.pastRaces) && h.pastRaces.length > 0
      ? h.pastRaces[h.pastRaces.length - 1]
      : null;
    const lastFinish = extractLastFinish(pr);

    // 前走1着は完全除外
    if (lastFinish === 1) continue;

    // 前走2着は原則除外、gap >= 4 かつ indexRank 3〜6 のみ例外として補完候補に許容
    let isExceptional2nd = false;
    if (lastFinish === 2) {
      if (gap >= 4 && indexRank >= 3 && indexRank <= 6) {
        isExceptional2nd = true;
      } else {
        continue;
      }
    }

    // finishScore
    let finishScore = 0;
    if (lastFinish == null) finishScore = 0;
    else if (lastFinish >= 6 && lastFinish <= 9) finishScore = 30;
    else if (lastFinish >= 10 && lastFinish <= 12) finishScore = 22;
    else if (lastFinish === 4 || lastFinish === 5) finishScore = 16;
    else if (lastFinish === 3) finishScore = 8;
    else if (lastFinish === 2) finishScore = -15; // 例外通過時のみ到達
    else if (lastFinish >= 13) finishScore = 5;

    // indexRank 補正（中位指数を優遇、上位指数は人気サイドに見えるため減点）
    let indexRankBonus = 0;
    if (indexRank >= 3 && indexRank <= 6) indexRankBonus = 5;
    else if (indexRank <= 2) indexRankBonus = -10;

    const gapScore = gap * 10;
    const score = gapScore + finishScore + indexRankBonus;

    // カテゴリ判定
    // 穴馬: 前走6〜9着 かつ gap >= 2
    // 妙味馬: それ以外（3〜5着 / 10〜12着 / 13着〜 / 例外2着 / null）
    let category = 'darkhorse';
    if (isExceptional2nd) {
      category = 'value';
    } else if (lastFinish != null && lastFinish >= 6 && lastFinish <= 9 && gap >= 2) {
      category = 'darkhorse';
    } else if (lastFinish != null && lastFinish >= 10 && lastFinish <= 12) {
      category = 'darkhorse';
    } else {
      category = 'value';
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
      reasons: [],
      exceptional2nd: isExceptional2nd,
    });
  }

  // 優先度（前走着順帯）→ スコア降順でソート
  candidates.sort((a, b) => {
    const pa = getFinishPriority(a.lastFinish, a.exceptional2nd);
    const pb = getFinishPriority(b.lastFinish, b.exceptional2nd);
    if (pa !== pb) return pa - pb;
    return b.score - a.score;
  });

  // 候補ゼロのときは fallback で救済（中位指数から拾う）
  if (candidates.length === 0) {
    return buildFallbackPicks(horses, indexRankMap);
  }

  return candidates.slice(0, 3);
}

/**
 * 通常抽出で候補ゼロの場合の救済ピック
 *
 * gap >= 1 を満たす馬が存在しないレースのみ呼ばれる。
 * 前走1着・前走2着は完全除外（fallback では例外なし）。
 * 前走6〜9着を最優先、次いで 10〜12着 → 4〜5着 → 3着 → 13着以下 → null。
 * 同優先度内では indexRank 3〜6位を優遇。
 * 最大3頭（候補が足りない場合は無理に埋めない）。
 */
function buildFallbackPicks(horses, indexRankMap) {
  if (!Array.isArray(horses) || horses.length === 0) return [];

  const annotated = horses
    .map(h => {
      const indexRank = indexRankMap.get(String(h.number));
      if (!indexRank) return null;
      const popularityRank = h.popularity != null ? parseInt(h.popularity, 10) : null;
      const pr = Array.isArray(h.pastRaces) && h.pastRaces.length > 0
        ? h.pastRaces[h.pastRaces.length - 1]
        : null;
      const lastFinish = extractLastFinish(pr);
      return { h, indexRank, popularityRank, lastFinish };
    })
    .filter(Boolean)
    // 前走1着・2着は fallback でも除外
    .filter(({ lastFinish }) => lastFinish !== 1 && lastFinish !== 2);

  if (annotated.length === 0) return [];

  // 優先度: 前走着順帯 → indexRank 3〜6位優遇 → indexRank 昇順
  const sorted = annotated.slice().sort((a, b) => {
    const pa = getFinishPriority(a.lastFinish);
    const pb = getFinishPriority(b.lastFinish);
    if (pa !== pb) return pa - pb;
    const aMid = a.indexRank >= 3 && a.indexRank <= 6 ? 0 : 1;
    const bMid = b.indexRank >= 3 && b.indexRank <= 6 ? 0 : 1;
    if (aMid !== bMid) return aMid - bMid;
    return a.indexRank - b.indexRank;
  });

  const picks = sorted.slice(0, 3);

  return picks.map(({ h, indexRank, popularityRank, lastFinish }) => {
    const gap = popularityRank != null ? popularityRank - indexRank : 0;
    const isDarkhorse = lastFinish != null && (
      (lastFinish >= 6 && lastFinish <= 9) ||
      (lastFinish >= 10 && lastFinish <= 12)
    );
    return {
      number: h.number,
      name: h.name,
      popularityRank: popularityRank || indexRank,
      indexRank,
      gap: gap > 0 ? gap : 0,
      lastFinish,
      score: 50,
      category: isDarkhorse ? 'darkhorse' : 'value',
      computerIndex: h.computerIndex,
      reasons: [],
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
