/**
 * 中間JSON / shared JSON バリデータ
 *
 * validateIntermediate: 中間JSON構造チェック（必須項目・undefined/null防止）
 * validateShared:       shared形式チェック（save前の最終gate）
 *
 * 返り値: { ok: boolean, errors: string[], warnings: string[] }
 */

function isString(v) { return typeof v === 'string' && v.length > 0; }
function isNumber(v) { return typeof v === 'number' && !Number.isNaN(v); }

export function validateIntermediate(day) {
  const errors = [];
  const warnings = [];

  if (!day || typeof day !== 'object') {
    return { ok: false, errors: ['intermediate root is not an object'], warnings };
  }
  if (!isString(day.date) || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)) {
    errors.push(`invalid date: ${day.date}`);
  }
  if (!Array.isArray(day.venues) || day.venues.length === 0) {
    errors.push('venues[] is empty or missing');
  }

  (day.venues || []).forEach((v, vi) => {
    const vtag = `venues[${vi}]`;
    if (!isString(v.name)) errors.push(`${vtag}.name missing`);
    if (!Array.isArray(v.races) || v.races.length === 0) {
      errors.push(`${vtag}.races[] is empty`);
    }
    (v.races || []).forEach((r, ri) => {
      const rtag = `${vtag}.races[${ri}]`;
      if (!isNumber(Number(r.raceNumber))) errors.push(`${rtag}.raceNumber invalid`);
      if (!Array.isArray(r.results)) {
        errors.push(`${rtag}.results[] missing`);
      } else if (r.results.length === 0) {
        warnings.push(`${rtag}.results[] is empty (取り止め/中止?)`);
      }
      (r.results || []).forEach((res, xi) => {
        const xtag = `${rtag}.results[${xi}]`;
        if (!isNumber(Number(res.position ?? res.rank))) warnings.push(`${xtag}.position missing (除外/取消?)`);
        if (!isNumber(Number(res.horseNumber ?? res.number))) errors.push(`${xtag}.horseNumber missing`);
        if (!isString(res.horseName ?? res.name)) errors.push(`${xtag}.horseName missing`);
      });
    });
  });

  return { ok: errors.length === 0, errors, warnings };
}

export function validateShared(data) {
  const errors = [];
  const warnings = [];
  if (!data || typeof data !== 'object') {
    return { ok: false, errors: ['shared root is not an object'], warnings };
  }
  for (const k of ['date', 'venue', 'venueCode']) {
    if (!isString(data[k])) errors.push(`shared.${k} missing`);
  }
  if (!Array.isArray(data.races)) {
    errors.push('shared.races[] missing');
  } else {
    data.races.forEach((r, i) => {
      if (!isNumber(r.raceNumber)) errors.push(`races[${i}].raceNumber invalid`);
      if (!Array.isArray(r.results)) errors.push(`races[${i}].results[] missing`);
      if (!r.payouts || typeof r.payouts !== 'object') errors.push(`races[${i}].payouts missing`);
      // undefined 検査（JSON化したとき undefined が string 化される罠を避ける）
      for (const key of Object.keys(r)) {
        if (r[key] === undefined) warnings.push(`races[${i}].${key} is undefined (→ null化推奨)`);
      }
    });
  }
  return { ok: errors.length === 0, errors, warnings };
}
