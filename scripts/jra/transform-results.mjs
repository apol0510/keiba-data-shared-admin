#!/usr/bin/env node
/**
 * 中間JSON → keiba-data-shared 形式 (venue単位) へ変換して ./tmp/jra-shared/ に出力。
 *
 * Usage:
 *   node scripts/jra/transform-results.mjs --in=./tmp/sample.json [--out-dir=./tmp/jra-shared]
 */

import fs from 'node:fs';
import path from 'node:path';
import { mapDayToSharedByVenue } from '../../src/lib/jra/jvlink-mapper.mjs';
import { validateIntermediate, validateShared } from '../../src/lib/jra/validator.mjs';

function parseArgs(argv) {
  const args = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
    else if (a.startsWith('--')) args[a.slice(2)] = true;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const inPath = args.in;
  const outDir = args['out-dir'] || './tmp/jra-shared';

  if (!inPath) {
    console.error('❌ --in=<path> required');
    process.exit(1);
  }

  const raw = fs.readFileSync(inPath, 'utf-8');
  const day = JSON.parse(raw);

  console.log(`📂 入力: ${inPath}`);
  console.log(`📅 対象日: ${day?.date}`);

  const v1 = validateIntermediate(day);
  v1.warnings.forEach((w) => console.warn(`⚠️  ${w}`));
  if (!v1.ok) {
    console.error('❌ 中間JSON バリデーション失敗:');
    v1.errors.forEach((e) => console.error(`   - ${e}`));
    process.exit(1);
  }

  const files = mapDayToSharedByVenue(day);
  console.log(`🏟  venue数: ${files.length}`);

  fs.mkdirSync(outDir, { recursive: true });
  let totalRaces = 0;
  for (const f of files) {
    const v2 = validateShared(f.data);
    v2.warnings.forEach((w) => console.warn(`⚠️  [${f.venue}] ${w}`));
    if (!v2.ok) {
      console.error(`❌ [${f.venue}] shared バリデーション失敗:`);
      v2.errors.forEach((e) => console.error(`   - ${e}`));
      process.exit(1);
    }
    const outPath = path.join(outDir, `${f.date}-${f.venueCode}.json`);
    fs.writeFileSync(outPath, JSON.stringify(f.data, null, 2), 'utf-8');
    totalRaces += f.data.races.length;
    console.log(`✅ ${outPath} (${f.data.races.length}R)`);
  }
  console.log(`\n📊 合計: ${files.length} venue / ${totalRaces} race`);
}

main();
