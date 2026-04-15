#!/usr/bin/env node
/**
 * --raw-dump の出力 (raw-YYYY-MM-DD.txt) を読み、
 * レコード種別ごとの件数 / 長さ範囲 / 先頭サンプル1件 を集計して出す。
 *
 * 入力フォーマット (Program.cs DoRawDump の出力):
 *   [0001] RA|len=1272|<record>
 *   [0002] SE|len=1143|<record>
 *   # file: CENTRALY_YYYYMMDD.jvd
 *
 * Usage:
 *   node scripts/jra/classify-raw.mjs /tmp/raw-2026-04-11.txt
 */

import fs from 'node:fs';

const inPath = process.argv[2];
if (!inPath) {
  console.error('usage: classify-raw.mjs <raw.txt>');
  process.exit(1);
}

const lines = fs.readFileSync(inPath, 'utf-8').split(/\r?\n/);

const stats = new Map(); // type -> { count, minLen, maxLen, sample }
let fileCount = 0;
for (const line of lines) {
  if (line.startsWith('# file:')) { fileCount++; continue; }
  const m = line.match(/^\[\d+\]\s+([A-Z0-9]{2})\|len=(\d+)\|(.*)$/);
  if (!m) continue;
  const [, type, lenStr, rec] = m;
  const len = Number(lenStr);
  const s = stats.get(type) ?? { count: 0, minLen: Infinity, maxLen: 0, sample: rec };
  s.count++;
  s.minLen = Math.min(s.minLen, len);
  s.maxLen = Math.max(s.maxLen, len);
  stats.set(type, s);
}

console.log(`📂 ${inPath}`);
console.log(`📄 file switches: ${fileCount}`);
console.log(`📊 record type summary:\n`);
const rows = [...stats.entries()].sort((a, b) => b[1].count - a[1].count);
for (const [type, s] of rows) {
  console.log(`  ${type}: count=${s.count}  len=${s.minLen}..${s.maxLen}`);
}
console.log(`\n--- sample (first per type) ---`);
for (const [type, s] of rows) {
  console.log(`\n[${type}] len=${s.sample.length}`);
  console.log(s.sample);
}
