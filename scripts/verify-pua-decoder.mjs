#!/usr/bin/env node
/**
 * PUA distance decoder の dry-run 検証ツール。
 *
 * 使い方:
 *   node scripts/verify-pua-decoder.mjs <racebook json>
 *   node scripts/verify-pua-decoder.mjs <racebook json> --synthetic
 *
 * 通常モード:
 *   - racebook JSON を読み、各 stage 後の充足率を出力。
 *     Stage 0: raw
 *     Stage 1: normalize 後
 *     Stage 2: enrich-by-results 後
 *     Stage 3: PUA decode 後
 *   - 各 stage で distanceMeters / distanceGaiji 件数、per-PDF map・seed map 内容、
 *     既存値非破壊チェックを行う。
 *
 * --synthetic モード:
 *   - 既存保存 JSON は distanceGaiji=null のため、decoder の動作を確認するために
 *     合成データを生成 → decoder にかける → 結果と内訳を表示。
 *   - 「もし parser が distanceGaiji を正しく captures したら」のシミュレーション。
 */

import fs from 'node:fs';
import path from 'node:path';
import { normalizeDataPastRaces } from '../netlify/lib/past-races-normalizer.mjs';
import { enrichByResults, enrichDataPastRaces } from '../netlify/lib/past-races-enricher.mjs';
import {
  buildPerPdfMap,
  loadSeedMap,
  decodeDataPastRaces,
} from '../netlify/lib/past-races-pua-decoder.mjs';

const PR_PRESERVE = ['venue','raceClass','finish','jockey','weight','time','paceType','paceRank','bodyWeight','final3F','winner','courseNote','cond'];
const HORSE_TOP = ['number','name','sire','dam','sexAge','sex','age','weight','jockey','trainer','computerIndex','marks','ranking','markScore','normalizedMark','rankingBonus','compiRank','compiRankBonus','totalScore','assignment','predictedOdds','shortComment','training','recentFormSource'];
const RACE_TOP = ['raceNumber','raceClass','conditions','distance','distanceMeters','startTime','horseCount','predictorCount','assignments'];

function inferCategory(srcArg) {
  if (/\/jra\//.test(srcArg)) return 'jra';
  if (/\/nankan\//.test(srcArg)) return 'nankan';
  return null;
}

function countFilled(data) {
  let total = 0, withDist = 0, withGaiji = 0;
  for (const r of data.races || []) {
    for (const h of r.horses || []) {
      for (const pr of h.pastRaces || []) {
        total++;
        if (pr.distanceMeters != null) withDist++;
        if (pr.distanceGaiji) withGaiji++;
      }
    }
  }
  return { total, withDist, withGaiji };
}

function horseLevelStats(data) {
  let horses = 0, allDist = 0, partial = 0, zero = 0, noPast = 0;
  for (const r of data.races || []) {
    for (const h of r.horses || []) {
      horses++;
      const prs = h.pastRaces || [];
      if (prs.length === 0) { noPast++; continue; }
      const w = prs.filter(p => p.distanceMeters != null).length;
      if (w === prs.length) allDist++;
      else if (w === 0) zero++;
      else partial++;
    }
  }
  return { horses, allDist, partial, zero, noPast };
}

function checkNonDestruction(before, after) {
  let prCntChanged = 0, orderBroken = 0, prFieldBroken = 0, hTopBroken = 0, rTopBroken = 0;
  for (let ri = 0; ri < before.races.length; ri++) {
    const rb = before.races[ri], ra = after.races[ri];
    for (const f of RACE_TOP) {
      if (JSON.stringify(rb[f]) !== JSON.stringify(ra[f])) rTopBroken++;
    }
    for (let hi = 0; hi < rb.horses.length; hi++) {
      const hb = rb.horses[hi], ha = ra.horses[hi];
      for (const f of HORSE_TOP) {
        if (JSON.stringify(hb[f]) !== JSON.stringify(ha[f])) hTopBroken++;
      }
      const prB = hb.pastRaces || [], prA = ha.pastRaces || [];
      if (prB.length !== prA.length) prCntChanged++;
      for (let pi = 0; pi < prA.length; pi++) {
        const a = prA[pi], b = prB[pi] || {};
        if ((b.venue || null) !== a.venue) orderBroken++;
        for (const f of PR_PRESERVE) {
          if (b[f] != null && b[f] !== a[f]) prFieldBroken++;
        }
      }
    }
  }
  return { prCntChanged, orderBroken, prFieldBroken, hTopBroken, rTopBroken };
}

function reportStage(label, stage) {
  const pct = (n, d) => d > 0 ? (n / d * 100).toFixed(1) : '0.0';
  console.log(
    `  ${label}: distance ${stage.withDist}/${stage.total} (${pct(stage.withDist, stage.total)}%), ` +
    `distanceGaiji ${stage.withGaiji}/${stage.total}`
  );
}

function reportNonDestruction(diff) {
  const ok = (l, c) => console.log(`  ${c ? '✅' : '❌'} ${l}`);
  ok('pastRaces 件数変化なし', diff.prCntChanged === 0);
  ok('並び順 (venue 同位置) 保持', diff.orderBroken === 0);
  ok('pastRaces 既存値非破壊 (venue/raceClass/finish/jockey/weight/time/paceType/paceRank/bodyWeight/final3F/winner/courseNote/cond)', diff.prFieldBroken === 0);
  ok('horse top-level 22 フィールド不変 (AI/印/totalScore/assignment 等)', diff.hTopBroken === 0);
  ok('race top-level 9 フィールド不変 (assignments=買い目 含む)', diff.rTopBroken === 0);
}

async function runNormalMode(src) {
  const data = JSON.parse(fs.readFileSync(path.resolve(src), 'utf-8'));
  const category = data.category || inferCategory(src);
  console.log(`\n=========== ${src} (${category}) ===========`);

  const stage0 = countFilled(data);
  reportStage('Stage 0 (raw)', stage0);

  const w1 = JSON.parse(JSON.stringify(data));
  normalizeDataPastRaces(w1);
  const stage1 = countFilled(w1);
  reportStage('Stage 1 (normalize)', stage1);

  const w2 = JSON.parse(JSON.stringify(w1));
  await enrichByResults(w2, { category, raceDate: w2.date });
  const stage2 = countFilled(w2);
  reportStage('Stage 2 (+ enrich-by-results)', stage2);

  const w3 = JSON.parse(JSON.stringify(w2));
  const decodeStats = decodeDataPastRaces(w3, { category });
  const stage3 = countFilled(w3);
  reportStage('Stage 3 (+ PUA decode)', stage3);

  console.log('\n--- PUA decode 内訳 ---');
  console.log(`  per-PDF map: ${decodeStats.perPdfMapSize} codepoint`);
  if (decodeStats.perPdfMapSize > 0) {
    for (const [hex, d] of Object.entries(decodeStats.perPdfMap)) console.log(`    U+${hex}: ${d}m`);
  }
  console.log(`  seed map: ${decodeStats.seedMapSize} codepoint (fallback)`);
  console.log(`  per-PDF 適用: ${decodeStats.perPdfApplied}`);
  console.log(`  seed-fallback 適用: ${decodeStats.seedApplied}`);
  console.log(`  conflict 件数 (per-PDF map から除外): ${decodeStats.conflicts.length}`);
  if (decodeStats.conflicts.length > 0) {
    for (const c of decodeStats.conflicts.slice(0, 5)) {
      console.log(`    U+${c.hex}: ${JSON.stringify(c.distribution)}`);
    }
  }
  console.log(`  null のまま残った件数: ${decodeStats.leftNull}`);
  console.log(`    - distanceGaiji 自体が無い: ${decodeStats.leftNullReasons.gaijiMissing}`);
  console.log(`    - map に該当 codepoint なし: ${decodeStats.leftNullReasons.noMapMatch}`);
  if (decodeStats.perPdfVsSeedDiff.length > 0) {
    console.log(`  per-PDF vs seed の差異 (per-PDF 採用): ${decodeStats.perPdfVsSeedDiff.length}`);
    for (const d of decodeStats.perPdfVsSeedDiff) console.log(`    U+${d.hex}: per-PDF=${d.perPdf}m vs seed=${d.seed}m`);
  }

  console.log('\n--- 馬単位の distance 充足 (Stage 3 後) ---');
  const hl = horseLevelStats(w3);
  console.log(`  horses: ${hl.horses}, 過去走0件(新馬等): ${hl.noPast}`);
  console.log(`  全 pastRaces で distance 確定: ${hl.allDist} (${(hl.allDist / hl.horses * 100).toFixed(1)}%)`);
  console.log(`  一部 distance あり: ${hl.partial}`);
  console.log(`  全 pastRaces で distance なし: ${hl.zero}`);

  console.log('\n--- 既存値非破壊検証 (raw vs Stage 3) ---');
  const diff = checkNonDestruction(data, w3);
  reportNonDestruction(diff);
}

async function runSyntheticMode() {
  console.log('\n=========== Synthetic Mode: decoder ロジック検証 ===========');
  console.log('（既存保存 JSON は distanceGaiji=null のため、合成データで decoder の動きを実地確認）');

  // 14 codepoint seed map 全部に対応する past race + そうでない未学習 codepoint + 既存値あり馬を混在
  const data = {
    date: '2026-05-25',
    venueCode: 'TOK',
    category: 'jra',
    races: [
      {
        raceNumber: 1,
        raceClass: 'TEST',
        distance: '1600m',
        distanceMeters: 1600,
        startTime: '10:00',
        horseCount: 6,
        assignments: { main: 1, sub: 2, hole: 3, connectTop: 4, connect: [5], reserve: [6], none: [] },
        horses: [
          // (A) 既に results で distance 確定済 (per-PDF 教師ペアになる) - 1800m
          { number: 1, name: 'A', pastRaces: [
            { venue: 'X', distanceGaiji: '', distanceMeters: 1800, time: '1.58.0' },
            { venue: 'Y', distanceGaiji: '', distanceMeters: null, time: '1.57.5' },  // per-PDF で 1800 確定
          ] },
          // (B) per-PDF にない codepoint, seed map にある (U+E582 → 1600m)
          { number: 2, name: 'B', pastRaces: [
            { venue: 'Z', distanceGaiji: '', distanceMeters: null, time: '1.40.0' },  // seed-fallback で 1600
          ] },
          // (C) 未学習 codepoint (U+EFFF)
          { number: 3, name: 'C', pastRaces: [
            { venue: 'W', distanceGaiji: '', distanceMeters: null, time: '1.30.0' },  // どこにも無い → null
          ] },
          // (D) distanceGaiji 自体が無い
          { number: 4, name: 'D', pastRaces: [
            { venue: 'V', distanceGaiji: null, distanceMeters: null, time: '1.20.0' },  // gaiji なし → null
          ] },
          // (E) conflict ケース: 同じ U+E590 で 1200/2000 拮抗
          { number: 5, name: 'E', pastRaces: [
            { venue: 'P', distanceGaiji: '', distanceMeters: 1200, time: '1.10.0' },
            { venue: 'Q', distanceGaiji: '', distanceMeters: 2000, time: '1.59.0' },
            { venue: 'R', distanceGaiji: '', distanceMeters: null, time: '1.45.0' },  // conflict → null
          ] },
          // (F) 既存 distanceMeters を上書きしないこと
          { number: 6, name: 'F', pastRaces: [
            { venue: 'S', distanceGaiji: '', distanceMeters: 9999, time: '1.50.0' },  // 既存値非破壊
          ] },
        ],
      },
    ],
  };

  // normalize で null pad（distanceGaiji キーは保持される）
  normalizeDataPastRaces(data);

  console.log('\nBEFORE decoder:');
  for (const h of data.races[0].horses) {
    for (const pr of h.pastRaces) {
      const hex = pr.distanceGaiji ? pr.distanceGaiji.charCodeAt(0).toString(16).toUpperCase() : '(none)';
      console.log(`  ${h.name}#${h.number}: gaiji=U+${hex} distanceMeters=${pr.distanceMeters}`);
    }
  }

  const stats = decodeDataPastRaces(data, { category: 'jra' });

  console.log('\nAFTER decoder:');
  for (const h of data.races[0].horses) {
    for (const pr of h.pastRaces) {
      const hex = pr.distanceGaiji ? pr.distanceGaiji.charCodeAt(0).toString(16).toUpperCase() : '(none)';
      console.log(`  ${h.name}#${h.number}: gaiji=U+${hex} distanceMeters=${pr.distanceMeters}`);
    }
  }

  console.log('\n--- 期待動作 vs 結果 ---');
  const expects = [
    ['A#1 past[0] (既存値)', 1800, data.races[0].horses[0].pastRaces[0].distanceMeters],
    ['A#1 past[1] (per-PDF 1800)', 1800, data.races[0].horses[0].pastRaces[1].distanceMeters],
    ['B#2 (seed-fallback 1600)', 1600, data.races[0].horses[1].pastRaces[0].distanceMeters],
    ['C#3 (未学習 → null)', null, data.races[0].horses[2].pastRaces[0].distanceMeters],
    ['D#4 (gaiji なし → null)', null, data.races[0].horses[3].pastRaces[0].distanceMeters],
    ['E#5 past[0] (既存 1200)', 1200, data.races[0].horses[4].pastRaces[0].distanceMeters],
    ['E#5 past[2] (conflict → null)', null, data.races[0].horses[4].pastRaces[2].distanceMeters],
    ['F#6 (既存値 9999 非破壊)', 9999, data.races[0].horses[5].pastRaces[0].distanceMeters],
  ];
  let allOk = true;
  for (const [label, expected, actual] of expects) {
    const ok = expected === actual;
    if (!ok) allOk = false;
    console.log(`  ${ok ? '✅' : '❌'} ${label}: expected=${expected}, actual=${actual}`);
  }
  console.log(allOk ? '\n✅ 全期待動作通り' : '\n❌ 一部失敗');

  console.log('\n--- stats ---');
  console.log(`  per-PDF 適用: ${stats.perPdfApplied}`);
  console.log(`  seed-fallback 適用: ${stats.seedApplied}`);
  console.log(`  conflict: ${stats.conflicts.length}`);
  console.log(`  null 残: ${stats.leftNull} (gaiji-missing: ${stats.leftNullReasons.gaijiMissing}, no-map-match: ${stats.leftNullReasons.noMapMatch})`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--synthetic') || args.length === 0) {
    await runSyntheticMode();
  }
  for (const a of args) {
    if (a.startsWith('--')) continue;
    await runNormalMode(a);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
