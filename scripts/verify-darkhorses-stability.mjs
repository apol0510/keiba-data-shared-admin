#!/usr/bin/env node
/**
 * 段階A/B 適用が darkHorses 抽出に影響を与えないことを検証する。
 *
 * - 既存 computer JSON を読み、applyDarkHorsesToComputerData を 2 通り適用:
 *   (1) 何もせずそのまま (BEFORE)
 *   (2) normalize + enrich を適用してから (AFTER)
 * - 各レースの darkHorses 配列を比較し、馬番・スコア・カテゴリ・lastFinish が同一であることを確認。
 *
 * 期待: extractLastFinish は pastRaces[最後] (=最新) を参照するだけで、enrich が
 * 追加するのは新フィールドのみで finish は触らないため、darkHorses 結果は完全に同一になる。
 */

import fs from 'node:fs';
import path from 'node:path';
import { applyDarkHorsesToComputerData } from '../netlify/functions/_shared/dark-horse.mjs';
import { normalizeDataPastRaces } from '../netlify/lib/past-races-normalizer.mjs';
import { enrichDataPastRaces } from '../netlify/lib/past-races-enricher.mjs';

function inferCategory(srcArg) {
  if (/\/jra\//.test(srcArg)) return 'jra';
  if (/\/nankan\//.test(srcArg)) return 'nankan';
  return null;
}

async function run(srcArg) {
  const data = JSON.parse(fs.readFileSync(path.resolve(srcArg), 'utf-8'));
  const category = data.category || inferCategory(srcArg);

  // BEFORE: そのまま darkHorses 抽出
  const beforeRun = applyDarkHorsesToComputerData(JSON.parse(JSON.stringify(data)), null);

  // AFTER: normalize + enrich してから darkHorses 抽出
  const afterData = JSON.parse(JSON.stringify(data));
  normalizeDataPastRaces(afterData);
  if (category === 'jra' || category === 'nankan') {
    await enrichDataPastRaces(afterData, { category, raceDate: afterData.date });
  }
  const afterRun = applyDarkHorsesToComputerData(afterData, null);

  console.log(`\n========= ${srcArg} (${category}) =========`);
  let mismatches = 0;
  for (let i = 0; i < beforeRun.races.length; i++) {
    const r1 = beforeRun.races[i];
    const r2 = afterRun.races[i];
    const dh1 = r1.darkHorses || [];
    const dh2 = r2.darkHorses || [];
    const k1 = dh1.map(d => `${d.number}:${d.category}:${d.score}:${d.lastFinish}`).join('|');
    const k2 = dh2.map(d => `${d.number}:${d.category}:${d.score}:${d.lastFinish}`).join('|');
    if (k1 !== k2) {
      mismatches++;
      console.log(`  ❌ R${r1.raceNumber} darkHorses mismatch:`);
      console.log(`     BEFORE: ${k1}`);
      console.log(`     AFTER : ${k2}`);
    }
  }
  if (mismatches === 0) {
    console.log(`  ✅ 全 ${beforeRun.races.length} レースで darkHorses が同一`);
  } else {
    process.exitCode = 1;
  }
}

for (const t of process.argv.slice(2)) await run(t);
