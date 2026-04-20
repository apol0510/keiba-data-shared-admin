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

// ================================================================
// テキスト正規化 (③ 文字化け除去)
// ================================================================

const GARBLED_RE = /\ufffd/g;
const CTRL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
const MULTI_SPACE_RE = /[\s\u3000]{2,}/g;

/**
 * 汎用テキスト正規化。
 *  1. NFKC 正規化 (全角英数→半角, 半角カナ→全角, etc.)
 *  2. 制御文字除去
 *  3. Unicode replacement char (U+FFFD) 除去
 *  4. 連続空白を1つの半角スペースに圧縮
 *  5. trim
 */
function normalizeText(s) {
  if (!s) return null;
  let t = String(s);
  t = t.normalize('NFKC');
  t = t.replace(CTRL_RE, '');
  t = t.replace(GARBLED_RE, '');
  t = t.replace(MULTI_SPACE_RE, ' ');
  t = t.trim();
  return t || null;
}

/**
 * JV-Link 由来の馬名を正規化する。
 *
 * SE レコードの Bamei フィールドはオフセットずれにより
 * 「馬名＋全角スペースパディング＋コード＋調教師名」が結合する事がある。
 * 例: "ホテルストリート　　　　　　　　　　00210103101109伊藤大士"
 *
 * 処理:
 *  1. normalizeText (NFKC, 制御文字除去)
 *  2. 馬名末尾の非名前データを切り落とす:
 *     - 先頭の連続カタカナ/漢字/長音符/中黒/ー を馬名本体として抽出
 *     - それ以降のスペース+数字+漢字(コード)は廃棄
 *  3. original (入力そのまま) / normalized / searchKey (カタカナ大文字統一) の3層を返す
 */
function normalizeHorseName(raw) {
  if (!raw) return { original: null, normalized: null, searchKey: null };
  const original = String(raw).trim();
  const text = normalizeText(raw);
  if (!text) return { original, normalized: null, searchKey: null };
  // JRA馬名: カタカナ・漢字・ー・ヴ・中黒(・)・アルファベット(外国馬) のみで構成
  // 連続スペース or 数字 が現れたら馬名終了
  const nameMatch = text.match(/^[\p{Script=Katakana}\p{Script=Han}\p{Script=Latin}ー・\-]+/u);
  const normalized = nameMatch ? nameMatch[0] : text;
  // searchKey: 全角カタカナに統一、小文字→大文字 (ァ→ア 等)
  const searchKey = normalized
    .replace(/[ぁ-ん]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/[ァィゥェォッャュョヮ]/g, (c) => {
      const map = { 'ァ':'ア','ィ':'イ','ゥ':'ウ','ェ':'エ','ォ':'オ','ッ':'ツ','ャ':'ヤ','ュ':'ユ','ョ':'ヨ','ヮ':'ワ' };
      return map[c] || c;
    });
  return { original, normalized, searchKey };
}

/**
 * 騎手・調教師名を正規化する。
 *
 * SE オフセットずれで勝負服の色情報が混入する場合がある。
 * 例: "緑，黄星散，桃袖緑二本輪" ← 勝負服の色であり騎手名ではない
 *
 * 検知ルール:
 *  - 読点(、)・全角コンマ(，)を含む → 勝負服と判定し null を返す
 *  - 「袖」「縞」「輪」「菱」「星」「散」「格子」を2つ以上含む → 勝負服と判定
 */
function normalizePersonName(raw) {
  if (!raw) return null;
  const text = normalizeText(raw);
  if (!text) return null;
  // 勝負服パターン検知
  if (/[，,、]/.test(text)) return null;
  const silkKeywords = ['袖', '縞', '輪', '菱', '星散', '格子', '一本', '二本', 'ダイヤモンド', '十字', '玉霰'];
  const hits = silkKeywords.filter((kw) => text.includes(kw));
  if (hits.length >= 2) return null;
  return text;
}

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
  return results.map((r) => {
    const rawName = r.horseName ?? r.name ?? null;
    const hn = normalizeHorseName(rawName);
    return {
      rank: Number(r.position ?? r.rank) || null,
      bracket: r.bracket != null ? Number(r.bracket) : null,
      number: r.horseNumber != null ? Number(r.horseNumber) : (r.number != null ? Number(r.number) : null),
      name: hn.normalized ?? hn.original ?? null,
      nameOriginal: hn.original,
      nameNormalized: hn.normalized,
      nameSearchKey: hn.searchKey,
      sexAge: r.sexAge ?? null,
      weight: r.weight ?? null,
      jockey: normalizePersonName(r.jockey),
      trainer: normalizePersonName(r.trainer),
      time: r.time ?? null,
      margin: r.margin ?? null,
      lastFurlong: r.lastFurlong ?? null,
      popularity: r.popularity != null ? Number(r.popularity) : null,
      odds: r.odds != null ? Number(r.odds) : null,
    };
  });
}

/**
 * 中間JSON の1レース を shared races[i] に変換。
 */
function mapRace(race, date, venueName) {
  // raceName fallback: RA正式 > RA短縮 > "{venue}{N}R" (絶対 null にしない)
  const rn = Number(race.raceNumber);
  const fallbackName = `${venueName}${Number.isFinite(rn) ? rn : '?'}R`;
  const resolvedName =
    normalizeText(race.raceName) ||
    normalizeText(race.raceSubtitle) ||
    fallbackName;

  const dist = race.distance != null ? Number(race.distance) : null;
  const surf = normalizeSurface(race.surface);
  const tc = race.trackCondition ?? null;
  const wx = race.weather ?? null;
  const mappedResults = mapResults(race.results);

  // ── raceName の source 判定 ──
  const raceNameSource =
    normalizeText(race.raceName) ? 'RA' :
    normalizeText(race.raceSubtitle) ? 'RA-sub' : 'fallback';

  // ── metadataSource: 各フィールドがどのレコードに由来するか ──
  const metadataSource = {
    raceName: raceNameSource,
    distance: dist != null ? 'RA' : null,
    surface: surf != null ? 'RA' : null,
    trackCondition: tc != null ? 'RA' : null,
    weather: wx != null ? 'RA' : null,
  };

  // ── aiInput: AI予想ロジック向け最小構成 ──
  const aiInput = {
    surface: surf,
    distance: dist,
    trackCondition: tc,
    weather: wx,
    pace: null, // 現時点では未取得 (HR/ラップデータ連携後に拡張)
    entries: mappedResults.map((h) => ({
      number: h.number,
      nameSearchKey: h.nameSearchKey,
      jockey: h.jockey,
      trainer: h.trainer,
      popularity: h.popularity,
      odds: h.odds ?? null,
    })),
  };

  return {
    date,
    venue: venueName,
    raceNumber: rn,
    raceName: resolvedName,
    raceSubtitle: race.raceSubtitle ?? null,
    distance: dist,
    surface: surf,
    track: race.track ?? null,
    startTime: race.startTime ?? null,
    weather: wx,
    trackCondition: tc,
    results: mappedResults,
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
    aiInput,
    metadataSource,
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
