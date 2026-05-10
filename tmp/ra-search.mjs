#!/usr/bin/env node
// RAレコードで distance-like な値と track-like な値の位置を探す
import { readFileSync } from 'fs';
import iconv from 'iconv-lite';

const path = process.argv[2] ?? 'tmp/raw-2026-04-11.utf8.txt';
const lines = readFileSync(path, 'utf8').split(/\r?\n/);

// Extract all RA records
const records = [];
for (const line of lines) {
  const m = line.match(/^\[(\d{4})\] RA\|len=(\d+)\|(.*)$/);
  if (!m) continue;
  records.push({ idx: m[1], payload: m[3] });
}
console.log(`Total RA records: ${records.length}`);

// For the first 5 RA records, find positions where the 4-byte ASCII value is a plausible distance
for (const rec of records.slice(0, 3)) {
  const bytes = iconv.encode(rec.payload, 'shift_jis');
  console.log(`\n=== RA ${rec.idx} (SJIS ${bytes.length} bytes) ===`);

  // Scan all 4-byte windows that look like distance (1000-3600)
  for (let i = 0; i < bytes.length - 4; i++) {
    const s = iconv.decode(bytes.slice(i, i + 4), 'shift_jis');
    if (/^\d{4}$/.test(s)) {
      const n = parseInt(s, 10);
      if (n >= 1000 && n <= 3600) {
        // Show surrounding bytes
        const around = iconv.decode(bytes.slice(Math.max(0, i - 2), i + 6), 'shift_jis').replace(/　/g, '·');
        console.log(`  [${i.toString().padStart(4)}] dist-candidate="${s}" ctx="${around}"`);
      }
    }
  }

  // Scan for HHMM (発走時刻): HH in 08-22, MM in 00-59
  console.log(`  --- HHMM candidates ---`);
  for (let i = 0; i < bytes.length - 4; i++) {
    const s = iconv.decode(bytes.slice(i, i + 4), 'shift_jis');
    if (/^\d{4}$/.test(s)) {
      const hh = parseInt(s.slice(0, 2), 10);
      const mm = parseInt(s.slice(2, 4), 10);
      if (hh >= 9 && hh <= 17 && mm < 60) {
        const around = iconv.decode(bytes.slice(Math.max(0, i - 2), i + 6), 'shift_jis').replace(/　/g, '·');
        console.log(`  [${i.toString().padStart(4)}] HHMM-candidate="${s}" ctx="${around}"`);
      }
    }
  }
}
