/**
 * 中間JSON (JV-Link由来) → keiba-data-shared 既存JRA結果形式 マッパー
 *
 * 入力: 1日分の中間JSON（複数venueを含む）
 * 出力: venue単位の shared 形式 JSON 配列（保存/dispatch 単位）
 *
 * 既存構造は一切変更しない。欠損フィールドは null で埋める。
 */

/**
 * ⚠️ src/lib/constants/venue-codes.ts と完全に一致させること。
 * Node CLIからは .ts を直接 import できないため、ここに同じ定義を置く。
 * 追加/変更時は必ず両方を同時更新すること。
 */
const JRA_VENUE_CODE_MAP = {
  '東京': 'TOK',
  '中山': 'NAK',
  '京都': 'KYO',
  '阪神': 'HAN',
  '中京': 'CHU',
  '新潟': 'NII',
  '福島': 'FKS',
  '小倉': 'KOK',
  '札幌': 'SAP',
  '函館': 'HKD',
};
function getVenueCode(name) {
  return JRA_VENUE_CODE_MAP[name] || 'TOK';
}

/**
 * @typedef {Object} IntermediateResult
 * @property {number} position      - 着順
 * @property {number} horseNumber   - 馬番
 * @property {string} horseName     - 馬名
 * @property {string} [jockey]
 * @property {number} [popularity]
 * @property {number} [odds]
 * @property {number} [bracket]     - 枠番
 * @property {string} [sexAge]
 * @property {string} [weight]
 * @property {string} [trainer]
 * @property {string} [time]
 * @property {string} [margin]
 * @property {string} [lastFurlong]
 *
 * @typedef {Object} PayoutEntry
 * @property {string} [number]
 * @property {string} [combination]
 * @property {number} payout
 * @property {number} [popularity]
 *
 * @typedef {Object} IntermediatePayouts
 * @property {PayoutEntry[]} [tansho]
 * @property {PayoutEntry[]} [fukusho]
 * @property {PayoutEntry[]} [wakuren]
 * @property {PayoutEntry[]} [wide]
 * @property {PayoutEntry[]} [umaren]
 * @property {PayoutEntry[]} [umatan]
 * @property {PayoutEntry[]} [sanrenpuku]
 * @property {PayoutEntry[]} [sanrentan]
 *
 * @typedef {Object} IntermediateRace
 * @property {number} raceNumber
 * @property {string} [raceName]
 * @property {string} [raceSubtitle]
 * @property {number} [distance]
 * @property {'芝'|'ダート'|'障害'|'T'|'D'|'O'} [surface]
 * @property {string} [track]
 * @property {string} [trackCondition]
 * @property {string} [weather]
 * @property {string} [startTime]
 * @property {IntermediateResult[]} results
 * @property {IntermediatePayouts} [payouts]
 * @property {Object} [timeData]
 * @property {Object[]} [cornerData]
 * @property {string} [comment]
 *
 * @typedef {Object} IntermediateVenue
 * @property {string} [code]        - JV-Link 会場コード (ex: 'NAKAYAMA')
 * @property {string} name          - 会場名 (ex: '中山')
 * @property {IntermediateRace[]} races
 *
 * @typedef {Object} IntermediateDay
 * @property {string} date          - 'YYYY-MM-DD'
 * @property {IntermediateVenue[]} venues
 */

/**
 * JV-Linkの1文字surfaceコードをshared形式の日本語に変換。
 * 'T' | '芝' → '芝' / 'D' | 'ダート' → 'ダート' / 'O' | '障害' → '障害'
 */
function normalizeSurface(s) {
  if (!s) return null;
  const map = { T: '芝', D: 'ダート', O: '障害', 芝: '芝', ダート: 'ダート', 障害: '障害' };
  return map[s] ?? s;
}

/**
 * 払戻エントリーを shared 形式に寄せる（number/combination を string にする）。
 */
function normalizePayoutEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map((e) => {
    const out = { payout: Number(e.payout) || 0 };
    if (e.number != null) out.number = String(e.number);
    if (e.combination != null) out.combination = String(e.combination);
    if (e.popularity != null) out.popularity = Number(e.popularity);
    return out;
  });
}

/**
 * 中間JSON の results[] を shared races[i].results[] に変換。
 */
function mapResults(results) {
  if (!Array.isArray(results)) return [];
  return results.map((r) => ({
    rank: Number(r.position ?? r.rank) || null,
    bracket: r.bracket != null ? Number(r.bracket) : null,
    number: r.horseNumber != null ? Number(r.horseNumber) : (r.number != null ? Number(r.number) : null),
    name: r.horseName ?? r.name ?? null,
    sexAge: r.sexAge ?? null,
    weight: r.weight ?? null,
    jockey: r.jockey ?? null,
    trainer: r.trainer ?? null,
    time: r.time ?? null,
    margin: r.margin ?? null,
    lastFurlong: r.lastFurlong ?? null,
    popularity: r.popularity != null ? Number(r.popularity) : null,
  }));
}

/**
 * 中間JSON の1レース を shared races[i] に変換。
 */
function mapRace(race, date, venueName) {
  return {
    date,
    venue: venueName,
    raceNumber: Number(race.raceNumber),
    raceName: race.raceName ?? null,
    raceSubtitle: race.raceSubtitle ?? null,
    distance: race.distance != null ? Number(race.distance) : null,
    surface: normalizeSurface(race.surface),
    track: race.track ?? null,
    startTime: race.startTime ?? null,
    weather: race.weather ?? null,
    trackCondition: race.trackCondition ?? null,
    results: mapResults(race.results),
    payouts: {
      tansho: normalizePayoutEntries(race.payouts?.tansho),
      fukusho: normalizePayoutEntries(race.payouts?.fukusho),
      wakuren: normalizePayoutEntries(race.payouts?.wakuren),
      wide: normalizePayoutEntries(race.payouts?.wide),
      umaren: normalizePayoutEntries(race.payouts?.umaren),
      umatan: normalizePayoutEntries(race.payouts?.umatan),
      sanrenpuku: normalizePayoutEntries(race.payouts?.sanrenpuku),
      sanrentan: normalizePayoutEntries(race.payouts?.sanrentan),
    },
    timeData: race.timeData ?? null,
    cornerData: Array.isArray(race.cornerData) ? race.cornerData : [],
    comment: race.comment ?? '',
  };
}

/**
 * 会場名→会場コード解決。明示指定（venue.code）があり JRA_VENUE_CODE_MAP に存在すればそれを優先。
 */
function resolveVenueCode(venue) {
  if (venue?.code && Object.values(JRA_VENUE_CODE_MAP).includes(venue.code)) {
    return venue.code;
  }
  return getVenueCode(venue?.name ?? '');
}

/**
 * 中間JSON の 1 venue を shared 形式の 1 ファイル分 JSON に変換。
 *
 * @param {IntermediateDay} day
 * @param {IntermediateVenue} venue
 * @returns {Object} shared形式 (save-results-jra.mjs の resultsJSON に渡せる)
 */
export function mapVenueToShared(day, venue) {
  const venueCode = resolveVenueCode(venue);
  return {
    date: day.date,
    venue: venue.name,
    venueCode,
    races: (venue.races ?? []).map((r) => mapRace(r, day.date, venue.name)),
  };
}

/**
 * 中間JSON 1日分 → venue単位 shared JSON の配列
 * @param {IntermediateDay} day
 * @returns {{venueCode:string, venue:string, date:string, data:Object}[]}
 */
export function mapDayToSharedByVenue(day) {
  if (!day || !day.date || !Array.isArray(day.venues)) {
    throw new Error('Invalid intermediate JSON: date / venues[] required');
  }
  return day.venues.map((v) => {
    const data = mapVenueToShared(day, v);
    return { venueCode: data.venueCode, venue: data.venue, date: data.date, data };
  });
}
