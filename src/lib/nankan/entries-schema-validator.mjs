/**
 * 南関 entries schema validator（PR-F2）
 *
 * 目的:
 * - PR-F1a の dry-run script 内の簡易 schema check を、独立した正式 validator にする。
 * - 自動取得出力（将来 PR-F1b）と手作業出力（entries-manager.astro 経由）が
 *   同じ `nankan/entries` schema かを検証する共通基盤。
 * - shared 保存（PR-F3）前の gate として使える。
 *
 * 厳守（純粋・副作用なし）:
 * - 取得しない / 保存しない / fetch しない / fs を触らない / DOM/UI に依存しない。
 * - nankankeiba.com / uma_info / keiba.go.jp へアクセスしない。
 * - featureScores / AI指数 / 印 / 買い目 / 穴馬 に接続しない。
 *
 * 入力: parsedResult JSON（既存 nankan/entries と同一形）。
 * 出力: { ok, errors, warnings, summary }
 *   - errors: ハード失敗（shared 保存を止めるべき）。1件でもあれば ok=false。
 *   - warnings: ソフト（要注意だが保存を止めない）。
 */

import { NANKAN_VENUE_NAME_BY_CODE } from './entries-parser.mjs';

export const NANKAN_VENUE_CODES = Object.keys(NANKAN_VENUE_NAME_BY_CODE); // ['OOI','KAW','FUN','URA']

const TOP_KEYS = ['version', 'createdAt', 'lastUpdated', 'date', 'venue', 'venueCode', 'category', 'totalRaces', 'races'];
const RECORD_KEYS = ['total', 'left', 'right', 'venue', 'distance'];
const RECORD_FIELDS = ['wins', 'seconds', 'thirds', 'unplaced'];
const RECENT_MAX_DEFAULT = 5;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}
function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * parsedResult を検証する。
 * @param {object} data  parsedResult JSON。
 * @param {object} [options]
 *   - expect: { date?, venueCode?, venue?, category? } 期待値（与えれば一致を検証）。
 *   - recentMax: recentRaces 上限（既定 5）。
 *   - recentDatePolicy: 'warning' | 'error'（recentRaces.date 形式崩れの扱い・既定 'warning'）。
 * @returns {{ ok: boolean, errors: string[], warnings: string[], summary: object }}
 */
export function validateNankanEntriesData(data, options = {}) {
  const errors = [];
  const warnings = [];
  const expect = options.expect || {};
  const recentMax = Number.isInteger(options.recentMax) ? options.recentMax : RECENT_MAX_DEFAULT;
  const recentDatePolicy = options.recentDatePolicy === 'error' ? 'error' : 'warning';

  // ---------- top-level ----------
  if (!isPlainObject(data)) {
    errors.push('data がオブジェクトでない');
    return { ok: false, errors, warnings, summary: summarizeNankanEntriesData(data) };
  }

  for (const k of TOP_KEYS) {
    if (!(k in data)) errors.push(`top-level key 欠落: ${k}`);
  }

  if ('version' in data && !isNonEmptyString(data.version)) warnings.push('version が空/非文字列');
  if ('createdAt' in data && !isNonEmptyString(data.createdAt)) warnings.push('createdAt が空/非文字列');
  if ('lastUpdated' in data && !isNonEmptyString(data.lastUpdated)) warnings.push('lastUpdated が空/非文字列');

  // date
  if (!isNonEmptyString(data.date)) {
    errors.push('date が空');
  } else if (!DATE_RE.test(data.date)) {
    errors.push(`date 形式不正（YYYY-MM-DD 期待）: ${data.date}`);
  } else if (expect.date && data.date !== expect.date) {
    errors.push(`date 不一致: ${data.date} != ${expect.date}`);
  }

  // category
  if (data.category !== 'nankan') {
    errors.push(`category が 'nankan' でない: ${data.category}`);
  }

  // ---------- venue ----------
  if (!isNonEmptyString(data.venueCode)) {
    errors.push('venueCode が空');
  } else {
    if (/[,\s]/.test(data.venueCode)) {
      errors.push(`venueCode に区切り文字（1 JSON = 1 venue 違反の疑い）: ${data.venueCode}`);
    }
    if (!NANKAN_VENUE_CODES.includes(data.venueCode)) {
      errors.push(`venueCode が南関(OOI/KAW/FUN/URA)でない: ${data.venueCode}`);
    } else {
      const expectedName = NANKAN_VENUE_NAME_BY_CODE[data.venueCode];
      if (isNonEmptyString(data.venue) && data.venue !== expectedName) {
        errors.push(`venue名(${data.venue}) と venueCode(${data.venueCode}=${expectedName}) が不整合`);
      }
    }
    if (expect.venueCode && data.venueCode !== expect.venueCode) {
      errors.push(`venueCode 不一致: ${data.venueCode} != ${expect.venueCode}`);
    }
  }
  if (!isNonEmptyString(data.venue)) errors.push('venue 名が空');
  if (expect.venue && data.venue !== expect.venue) {
    errors.push(`venue 不一致: ${data.venue} != ${expect.venue}`);
  }

  // ---------- races ----------
  if (!Array.isArray(data.races)) {
    errors.push('races が配列でない');
    return { ok: errors.length === 0, errors, warnings, summary: summarizeNankanEntriesData(data) };
  }
  if (data.races.length === 0) {
    errors.push('races が空（0レース）＝抽出に失敗の疑い');
  }
  if (data.totalRaces !== data.races.length) {
    errors.push(`totalRaces(${data.totalRaces}) != races.length(${data.races.length})`);
  }

  data.races.forEach((race, ri) => {
    const rtag = `race[${ri}]`;
    if (!isPlainObject(race)) {
      errors.push(`${rtag} がオブジェクトでない`);
      return;
    }
    if (!isFiniteNumber(race.raceNumber)) errors.push(`${rtag} raceNumber が数値でない`);
    if (typeof race.raceName !== 'string') errors.push(`${rtag} raceName が文字列でない`);
    else if (race.raceName.trim() === '') warnings.push(`${rtag} raceName が空`);

    // surface
    if (typeof race.surface !== 'string') warnings.push(`${rtag} surface が文字列でない`);
    else if (race.surface.trim() === '') warnings.push(`${rtag} surface が空`);

    // distance: race レベルは文字列 or 数値（空許容＝warning）
    if (race.distance == null || race.distance === '') {
      warnings.push(`${rtag} distance が空`);
    } else if (typeof race.distance !== 'string' && !isFiniteNumber(race.distance)) {
      warnings.push(`${rtag} distance が文字列/数値でない`);
    }

    if (!Array.isArray(race.horses) || race.horses.length === 0) {
      errors.push(`${rtag} horses が空`);
      return;
    }

    // headCount: 数値かつ horses.length と整合（不整合は warning）
    if (!isFiniteNumber(race.headCount)) {
      warnings.push(`${rtag} headCount が数値でない`);
    } else if (race.headCount !== race.horses.length) {
      warnings.push(`${rtag} headCount(${race.headCount}) != horses.length(${race.horses.length})`);
    }

    race.horses.forEach((h, hi) => {
      const htag = `${rtag}.horse[${hi}]`;
      if (!isPlainObject(h)) { errors.push(`${htag} がオブジェクトでない`); return; }

      // number: 数値 or 文字列として存在
      if (h.number == null || (typeof h.number !== 'number' && typeof h.number !== 'string')) {
        errors.push(`${htag} number が無い/型不正`);
      }
      if (!isNonEmptyString(h.name)) errors.push(`${htag} name が空`);

      // gender / age（ソフト）
      if (!isNonEmptyString(h.gender)) warnings.push(`${htag} gender が空`);
      if (!(isFiniteNumber(h.age) || h.age === null)) warnings.push(`${htag} age が数値/null でない`);

      // jockey / trainer（空は warning）
      if (!isNonEmptyString(h.jockey)) warnings.push(`${htag} jockey が空`);
      if (!isNonEmptyString(h.trainer)) warnings.push(`${htag} trainer が空`);

      // record（ハード）
      validateRecord(h.record, htag, errors);

      // recentRaces（ハード: 配列 & <= recentMax）
      if (!Array.isArray(h.recentRaces)) {
        errors.push(`${htag} recentRaces が配列でない`);
      } else {
        if (h.recentRaces.length > recentMax) {
          errors.push(`${htag} recentRaces が ${recentMax} 件超 (${h.recentRaces.length})`);
        }
        h.recentRaces.forEach((rr, rri) => {
          validateRecentRace(rr, `${htag}.recent[${rri}]`, warnings, recentDatePolicy === 'error' ? errors : warnings);
        });
      }
    });
  });

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: summarizeNankanEntriesData(data)
  };
}

function validateRecord(record, htag, errors) {
  if (!isPlainObject(record)) {
    errors.push(`${htag} record が無い/オブジェクトでない`);
    return;
  }
  for (const rk of RECORD_KEYS) {
    if (!isPlainObject(record[rk])) {
      errors.push(`${htag} record.${rk} が無い`);
      continue;
    }
    for (const f of RECORD_FIELDS) {
      const v = record[rk][f];
      if (typeof v !== 'number' || Number.isNaN(v)) {
        errors.push(`${htag} record.${rk}.${f} が数値でない/NaN`);
      }
    }
  }
}

function validateRecentRace(rr, tag, warnings, dateBucket) {
  if (!isPlainObject(rr)) {
    warnings.push(`${tag} がオブジェクトでない`);
    return;
  }
  if (!isFiniteNumber(rr.order)) warnings.push(`${tag} order が数値でない`);
  // finish または finishStatus のどちらか
  const hasFinish = isFiniteNumber(rr.finish);
  const hasStatus = isNonEmptyString(rr.finishStatus);
  if (!hasFinish && !hasStatus) warnings.push(`${tag} finish/finishStatus がいずれも無い`);
  // date（推奨 YYYY-MM-DD・崩れは policy バケットへ）
  if (!isNonEmptyString(rr.date)) {
    warnings.push(`${tag} date が空`);
  } else if (!DATE_RE.test(rr.date)) {
    dateBucket.push(`${tag} date 形式が YYYY-MM-DD でない: ${rr.date}`);
  }
  if (!isNonEmptyString(rr.venue)) warnings.push(`${tag} venue が空`);
  if (!(isFiniteNumber(rr.distance) || rr.distance == null)) warnings.push(`${tag} distance が数値/null でない`);
  if (typeof rr.raceName !== 'string') warnings.push(`${tag} raceName が文字列でない`);
  if (typeof rr.jockey !== 'string') warnings.push(`${tag} jockey が文字列でない`);
  if (!(isFiniteNumber(rr.weight) || rr.weight == null)) warnings.push(`${tag} weight が数値/null でない`);
}

/**
 * parsedResult のサマリを返す（検証可否に関わらず計算できる範囲で）。
 * @param {object} data
 * @returns {{ date, venue, venueCode, totalRaces, totalHorses, recordCoverage, recentRacesCoverage, warningsCount, errorsCount }}
 *   warningsCount / errorsCount は validate 経由で上書きされる（単独呼び出し時は 0）。
 */
export function summarizeNankanEntriesData(data) {
  const summary = {
    date: isPlainObject(data) ? (data.date ?? null) : null,
    venue: isPlainObject(data) ? (data.venue ?? null) : null,
    venueCode: isPlainObject(data) ? (data.venueCode ?? null) : null,
    totalRaces: 0,
    totalHorses: 0,
    recordCoverage: '0%',
    recentRacesCoverage: '0%',
    warningsCount: 0,
    errorsCount: 0
  };
  if (!isPlainObject(data) || !Array.isArray(data.races)) return summary;

  summary.totalRaces = data.races.length;
  let horses = 0, recordFilled = 0, recentFilled = 0;
  for (const race of data.races) {
    for (const h of (race?.horses || [])) {
      horses++;
      const t = h?.record?.total;
      if (t && isFiniteNumber(t.wins) && (t.wins + t.seconds + t.thirds + t.unplaced) > 0) recordFilled++;
      if (Array.isArray(h?.recentRaces) && h.recentRaces.length > 0) recentFilled++;
    }
  }
  const pct = (n) => horses === 0 ? '0%' : `${Math.round((n / horses) * 100)}%`;
  summary.totalHorses = horses;
  summary.recordCoverage = pct(recordFilled);
  summary.recentRacesCoverage = pct(recentFilled);
  return summary;
}
