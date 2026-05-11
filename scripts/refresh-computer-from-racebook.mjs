#!/usr/bin/env node
/**
 * keiba-data-shared の predictions/computer/**.json を、対応する racebook/**.json から
 * pastRaces を最新化したうえで darkHorses を再抽出する。
 *
 * 主な用途: racebook パース改善後に既存 computer JSON を最新化する。
 *
 * 使い方:
 *   node scripts/refresh-computer-from-racebook.mjs                       # 全件
 *   node scripts/refresh-computer-from-racebook.mjs --category nankan     # 南関のみ
 *   node scripts/refresh-computer-from-racebook.mjs --date 2026-05-12     # 日付指定
 *   node scripts/refresh-computer-from-racebook.mjs --date-from 2026-05-01
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { glob } from 'fs/promises';
import { applyDarkHorsesToComputerData } from '../netlify/functions/_shared/dark-horse.mjs';

const SHARED_DIR = process.env.KEIBA_DATA_SHARED_DIR
  || '/Users/user/Projects/keiba-data-shared';

const args = process.argv.slice(2);
const opts = { category: null, date: null, dateFrom: null };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--category' && args[i + 1]) { opts.category = args[i + 1]; i++; }
  else if (args[i] === '--date' && args[i + 1]) { opts.date = args[i + 1]; i++; }
  else if (args[i] === '--date-from' && args[i + 1]) { opts.dateFrom = args[i + 1]; i++; }
}

const categories = opts.category ? [opts.category] : ['jra', 'nankan'];
let updated = 0;
let unchanged = 0;
let noRacebook = 0;

for (const cat of categories) {
  const pattern = join(SHARED_DIR, cat, 'predictions/computer/**/*.json');
  for await (const fp of glob(pattern)) {
    const m = fp.match(/(\d{4}-\d{2}-\d{2})-([A-Z]+)\.json$/);
    if (!m) continue;
    const [, date, venue] = m;
    if (opts.date && date !== opts.date) continue;
    if (opts.dateFrom && date < opts.dateFrom) continue;

    const compi = JSON.parse(readFileSync(fp, 'utf8'));
    const rbPath = join(SHARED_DIR, cat, 'racebook', date.slice(0, 4), date.slice(5, 7), `${date}-${venue}.json`);
    let racebook = null;
    try {
      racebook = JSON.parse(readFileSync(rbPath, 'utf8'));
    } catch {
      noRacebook++;
      console.log(`⚠️  no racebook: ${cat}/${date}-${venue}`);
      continue;
    }

    const before = JSON.stringify(compi);
    const enriched = applyDarkHorsesToComputerData(compi, racebook);
    const after = JSON.stringify(enriched);
    if (before === after) {
      unchanged++;
      continue;
    }

    enriched.refreshedFromRacebookAt = new Date().toISOString();
    writeFileSync(fp, JSON.stringify(enriched, null, 2));
    const totalDh = enriched.races.reduce((s, r) => s + (r.darkHorses?.length || 0), 0);
    const fb = enriched.races.reduce((s, r) => s + (r.darkHorses?.filter(h => h.fallback).length || 0), 0);
    console.log(`✅ ${cat}/${date}-${venue}: ${totalDh} picks (fallback ${fb})`);
    updated++;
  }
}

console.log(`\nDone. updated=${updated} / unchanged=${unchanged} / noRacebook=${noRacebook}`);
