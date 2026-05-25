#!/usr/bin/env node
/**
 * 段階A/B 適用前後を per-horse で厳密比較するスクリプト。
 *
 * チェック:
 *   - pastRaces 件数が一致（減っていない）
 *   - 各 pastRace の既存値（venue, finish, jockey, weight, time, paceType, bodyWeight, final3F, winner, raceClass）が破壊されていない
 *   - 並び順が一致（[i] 同士の venue が同じ）
 *   - displayOrder メタが付与されている
 *   - distance / distanceMeters は補完できたものだけ埋まり、ダメだったものは null のまま
 *
 * 異常があれば赤字で出力し、終了コード 1。
 */

import fs from 'node:fs';
import path from 'node:path';
import { normalizeDataPastRaces } from '../netlify/lib/past-races-normalizer.mjs';
import { enrichDataPastRaces } from '../netlify/lib/past-races-enricher.mjs';

const PRESERVE_FIELDS = ['venue', 'raceClass', 'finish', 'jockey', 'weight', 'time', 'paceType', 'paceRank', 'bodyWeight', 'final3F', 'winner', 'courseNote', 'cond'];

function inferCategory(srcArg) {
  if (/\/jra\//.test(srcArg)) return 'jra';
  if (/\/nankan\//.test(srcArg)) return 'nankan';
  return null;
}

async function compareOne(srcArg) {
  const data = JSON.parse(fs.readFileSync(path.resolve(srcArg), 'utf-8'));
  const category = data.category || inferCategory(srcArg);
  const after = JSON.parse(JSON.stringify(data));

  normalizeDataPastRaces(after);
  if (category === 'jra' || category === 'nankan') {
    await enrichDataPastRaces(after, { category, raceDate: after.date });
  }

  // ---- per-horse 比較 ----
  let horseCount = 0;
  let pastRaceCount = 0;
  let countDelta = 0;
  let orderMismatches = 0;
  let displayOrderMissing = 0;
  const preserveBreaks = []; // field damaged
  let distanceFilledCount = 0;
  let distanceLeftNull = 0;
  let popularityFilled = 0;

  for (let ri = 0; ri < (data.races || []).length; ri++) {
    const raceBefore = data.races[ri];
    const raceAfter = after.races[ri];
    if (raceAfter.pastRacesDisplayOrder !== 'oldest-first') {
      displayOrderMissing++;
    }
    for (let hi = 0; hi < (raceBefore.horses || []).length; hi++) {
      const hBefore = raceBefore.horses[hi];
      const hAfter = raceAfter.horses[hi];
      horseCount++;
      const prBefore = hBefore.pastRaces || [];
      const prAfter = hAfter.pastRaces || [];
      if (prBefore.length !== prAfter.length) countDelta++;
      pastRaceCount += prAfter.length;

      for (let pi = 0; pi < prAfter.length; pi++) {
        const a = prAfter[pi];
        const b = prBefore[pi] || {};
        // 並び順チェック (venue 一致)
        if ((b.venue || null) !== a.venue) {
          orderMismatches++;
        }
        // 既存値非破壊チェック
        for (const f of PRESERVE_FIELDS) {
          const beforeVal = b[f];
          const afterVal = a[f];
          if (beforeVal == null) continue; // 元 null は埋まってもOK
          if (beforeVal !== afterVal) {
            preserveBreaks.push({ race: raceBefore.raceNumber, horse: hBefore.name, pi, field: f, before: beforeVal, after: afterVal });
          }
        }
        // distance 補完カウント
        const hadDist = b.distance != null || b.distanceMeters != null;
        const hasDist = a.distance != null || a.distanceMeters != null;
        if (!hadDist && hasDist) distanceFilledCount++;
        if (!hadDist && !hasDist) distanceLeftNull++;
        // popularity
        if (b.popularity == null && a.popularity != null) popularityFilled++;
      }
    }
  }

  console.log(`\n========= ${srcArg} (${category}) =========`);
  console.log(`horses=${horseCount}  pastRaces(after)=${pastRaceCount}`);
  const ok = (label, cond, detail = '') => {
    console.log(`  ${cond ? '✅' : '❌'} ${label}${detail ? ' — ' + detail : ''}`);
    if (!cond) process.exitCode = 1;
  };
  ok('件数減なし', countDelta === 0, `delta=${countDelta}`);
  ok('並び順保持 (venue 同位置一致)', orderMismatches === 0, `mismatches=${orderMismatches}`);
  ok('displayOrder メタ付与 (race 単位)', displayOrderMissing === 0, `missing race count=${displayOrderMissing}`);
  ok('既存値非破壊 (venue/finish/jockey/weight/time/paceType/bodyWeight/final3F/winner/raceClass/cond/courseNote)', preserveBreaks.length === 0, `broken=${preserveBreaks.length}`);
  if (preserveBreaks.length > 0) {
    console.log('    最初の5件:');
    for (const b of preserveBreaks.slice(0, 5)) {
      console.log(`      R${b.race} ${b.horse} past[${b.pi}].${b.field}: ${JSON.stringify(b.before)} → ${JSON.stringify(b.after)}`);
    }
  }
  console.log(`  ℹ️ distance 補完済: ${distanceFilledCount}件 (元null→値)`);
  console.log(`  ℹ️ distance 補完不可で null 維持: ${distanceLeftNull}件 (results 不在=2025以前)`);
  console.log(`  ℹ️ popularity 補完済: ${popularityFilled}件`);
}

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('Usage: node scripts/compare-past-races.mjs <path> [<path> ...]');
  process.exit(1);
}
for (const t of targets) await compareOne(t);
console.log('\n=========================================================');
console.log(process.exitCode === 1 ? '❌ 一部失敗' : '✅ 全件パス');
