/**
 * pastRaces 正規化（段階 A）— admin 保存直前に共通形式へ揃える。
 *
 * 設計方針:
 * - **既存値を破壊しない**。null/undefined のフィールドだけ null で埋める。
 * - **並び順は触らない**。現状の oldest-first を維持する（[0]=最古、[N-1]=最新）。
 *   dark-horse.mjs (extractDarkHorses) と extractLastFinish は
 *   pastRaces[pastRaces.length-1] = 直近 として参照しているため。
 * - 共通フィールド集合を明示的に列挙し、両サイト (intelligence / analytics) が
 *   同じキーを期待できるようにする。新規キー (date, raceName, surface,
 *   popularity, bodyWeightDiff, margin) は段階 B (enricher) で値が入る。
 *   それまでは null。表示側が null safe で読めるよう、キー自体は存在させる。
 * - 並び順契約は race-level の `pastRacesDisplayOrder: "oldest-first"` で
 *   明示する。consumers がこのキーを見て判定できる。
 */

const CANONICAL_FIELDS = Object.freeze([
  'date',
  'venue',
  'venueCode',
  'raceName',
  'raceClass',
  'surface',
  'distance',
  'distanceMeters',
  'distanceGaiji',
  'finish',
  'finishStatus',
  'popularity',
  'jockey',
  'weight',
  'bodyWeight',
  'bodyWeightDiff',
  'time',
  'margin',
  'paceType',
  'paceRank',
  'final3F',
  'courseNote',
  'cond',
  'winner',
]);

export const PAST_RACES_DISPLAY_ORDER = 'oldest-first';

/**
 * 1 件の pastRace を共通形式に揃える。
 * 既存値は維持。未定義キーは null で埋める。
 */
export function normalizePastRace(pr) {
  if (!pr || typeof pr !== 'object') return null;
  const out = {};
  for (const k of CANONICAL_FIELDS) {
    out[k] = pr[k] != null ? pr[k] : null;
  }
  return out;
}

export function normalizePastRacesArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(normalizePastRace).filter(Boolean);
}

/**
 * data.races[*].horses[*].pastRaces を全件正規化（in-place）。
 * race 単位に displayOrder メタを付ける。
 *
 * @param {object} data - racebook JSON or computer JSON
 * @returns {object} 同じ data（in-place）
 */
export function normalizeDataPastRaces(data) {
  if (!data || !Array.isArray(data.races)) return data;
  let touched = 0;
  for (const race of data.races) {
    if (!Array.isArray(race.horses)) continue;
    for (const horse of race.horses) {
      const next = normalizePastRacesArray(horse.pastRaces || []);
      horse.pastRaces = next;
      touched += next.length;
    }
    race.pastRacesDisplayOrder = PAST_RACES_DISPLAY_ORDER;
  }
  if (touched > 0) {
    console.log(`[PastRacesNormalizer] ${touched} past-race entries normalized (order: ${PAST_RACES_DISPLAY_ORDER})`);
  }
  return data;
}
