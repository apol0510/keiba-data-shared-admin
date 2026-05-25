#!/usr/bin/env node
/**
 * pastRaces 検証スクリプト
 *
 * 用途:
 *   ローカル or リモートの racebook/computer JSON を読み、
 *   (a) 並び順、(b) 共通フィールド充足率、(c) results 突合補完の試行効果
 *   を計測してレポート出力する。段階 A/B 修正の前後で挙動差分を確認するために使う。
 *
 * 使い方:
 *   node scripts/verify-past-races.mjs <path-or-url> [--enrich]
 *
 * 例:
 *   node scripts/verify-past-races.mjs ../keiba-data-shared/jra/racebook/2026/05/2026-05-24-TOK.json
 *   node scripts/verify-past-races.mjs ../keiba-data-shared/jra/racebook/2026/05/2026-05-24-TOK.json --enrich
 *
 * 出力:
 *   - 馬数、pastRaces 総数、各フィールド非null率
 *   - 並び順検査 (oldest-first / newest-first / mixed)
 *   - --enrich 指定時は normalizer+enricher を dry-run 適用し、補完件数を出力
 */

import fs from 'node:fs';
import path from 'node:path';
import { normalizeDataPastRaces } from '../netlify/lib/past-races-normalizer.mjs';
import { enrichDataPastRaces } from '../netlify/lib/past-races-enricher.mjs';

const FIELDS = [
  'date', 'venue', 'venueCode', 'raceName', 'raceClass', 'surface',
  'distance', 'distanceMeters', 'distanceGaiji',
  'finish', 'finishStatus', 'popularity',
  'jockey', 'weight', 'bodyWeight', 'bodyWeightDiff',
  'time', 'margin', 'paceType', 'paceRank', 'final3F',
  'courseNote', 'cond', 'winner',
];

async function loadData(srcArg) {
  if (/^https?:\/\//.test(srcArg)) {
    const res = await fetch(srcArg);
    if (!res.ok) throw new Error(`fetch failed: ${srcArg} status=${res.status}`);
    return JSON.parse(await res.text());
  }
  const p = path.resolve(srcArg);
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function inferCategory(data, srcArg) {
  if (data.category === 'jra' || data.category === 'nankan' || data.category === 'local') return data.category;
  const s = String(srcArg);
  if (/\/jra\//.test(s)) return 'jra';
  if (/\/nankan\//.test(s)) return 'nankan';
  if (/\/local\//.test(s)) return 'local';
  return null;
}

function analyze(data, label) {
  let horseCount = 0;
  let pastRacesTotal = 0;
  const countDist = {};
  const fieldFill = {};
  for (const f of FIELDS) fieldFill[f] = 0;
  const orderObservations = { ascending: 0, descending: 0, single: 0, mixed: 0, unknown: 0 };

  for (const race of (data.races || [])) {
    for (const horse of (race.horses || [])) {
      horseCount++;
      const prs = horse.pastRaces || [];
      pastRacesTotal += prs.length;
      countDist[prs.length] = (countDist[prs.length] || 0) + 1;
      for (const pr of prs) {
        for (const f of FIELDS) {
          if (pr[f] != null) fieldFill[f]++;
        }
      }
      // 並び順を venue 末尾の "M.D" で観察
      if (prs.length < 2) {
        if (prs.length === 1) orderObservations.single++;
        else orderObservations.unknown++;
      } else {
        const dates = prs.map(p => {
          const m = String(p.venue || '').match(/(\d{1,2})\.(\d{1,2})\s*$/);
          return m ? (Number(m[1]) * 100 + Number(m[2])) : null;
        });
        if (dates.some(d => d == null)) { orderObservations.unknown++; continue; }
        let asc = true, desc = true;
        for (let i = 1; i < dates.length; i++) {
          if (dates[i] < dates[i - 1]) asc = false;
          if (dates[i] > dates[i - 1]) desc = false;
        }
        // 注意: 年跨ぎは月.日比較だと逆に見えるため、観察は参考値
        if (asc && !desc) orderObservations.ascending++;
        else if (!asc && desc) orderObservations.descending++;
        else orderObservations.mixed++;
      }
    }
  }

  console.log(`\n=== ${label} ===`);
  console.log(`horses: ${horseCount}, pastRaces total: ${pastRacesTotal} (avg ${(pastRacesTotal / Math.max(1, horseCount)).toFixed(2)})`);
  console.log(`count distribution: ${JSON.stringify(countDist)}`);
  console.log(`pastRacesDisplayOrder meta (first race): ${data.races?.[0]?.pastRacesDisplayOrder || 'なし'}`);
  console.log(`order observation (M.D ascending): ${JSON.stringify(orderObservations)}`);
  console.log('field fill rate:');
  for (const f of FIELDS) {
    const n = fieldFill[f];
    const pct = pastRacesTotal > 0 ? ((n / pastRacesTotal) * 100).toFixed(1) : '0.0';
    const bar = '█'.repeat(Math.floor(n / Math.max(1, pastRacesTotal) * 20));
    console.log(`  ${f.padEnd(18)} ${String(n).padStart(5)}/${pastRacesTotal} (${pct.padStart(5)}%) ${bar}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node scripts/verify-past-races.mjs <path-or-url> [--enrich]');
    process.exit(1);
  }
  const src = args[0];
  const doEnrich = args.includes('--enrich');

  const data = await loadData(src);
  const category = inferCategory(data, src);

  analyze(data, `BEFORE (raw): ${src}`);

  if (doEnrich) {
    const cloned = JSON.parse(JSON.stringify(data));
    normalizeDataPastRaces(cloned);
    if (category === 'jra' || category === 'nankan') {
      await enrichDataPastRaces(cloned, { category, raceDate: cloned.date });
    } else {
      console.warn(`enrich skipped: unknown category for ${src}`);
    }
    analyze(cloned, `AFTER (normalize + enrich)`);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
