#!/usr/bin/env node
// HRレコードを仮説的に構造解析
// 仮説: JV-Data HR v4.8
//   [0:27]  common header
//   [27:29] TorokuTosu(2)
//   [29:31] SyussoTosu(2)
//   [31:?]  Flag群
//   そこから Tansho[3] / Fukusho[5] / Wakuren[3] / Umaren[3] / Wide[7] / Reserved[3] / Umatan[6] / Sanrenpuku[3] / Sanrentan[6]
//
// 単純化のため、各エントリのサイズを総当たりで試して整合する構造を探る。

import { readFileSync } from 'fs';

const path = process.argv[2] ?? 'tmp/raw-2026-04-11.utf8.txt';
const target = process.argv[3] ?? 'HR';
const occurrence = parseInt(process.argv[4] ?? '1', 10);

const lines = readFileSync(path, 'utf8').split(/\r?\n/);
let matched = 0;
let payload = '';
for (const line of lines) {
  const m = line.match(/^\[(\d{4})\] ([A-Z0-9]{2})\|len=(\d+)\|(.*)$/);
  if (!m) continue;
  if (m[2] !== target) continue;
  matched++;
  if (matched !== occurrence) continue;
  payload = m[4];
  console.log(`record=${m[1]} type=${m[2]} len=${m[3]} payloadChars=${payload.length}`);
  break;
}
if (!payload) {
  console.log('not found'); process.exit(1);
}

// 非空白→空白のランを抽出して、どの位置に実データが固まっているか見る
const runs = [];
let runStart = -1;
for (let i = 0; i < payload.length; i++) {
  const c = payload[i];
  const isData = c !== ' ' && c !== '\0';
  if (isData && runStart < 0) runStart = i;
  else if (!isData && runStart >= 0) {
    runs.push({ start: runStart, end: i - 1, text: payload.slice(runStart, i) });
    runStart = -1;
  }
}
if (runStart >= 0) runs.push({ start: runStart, end: payload.length - 1, text: payload.slice(runStart) });

console.log('\n=== non-space runs ===');
for (const r of runs) {
  const len = r.end - r.start + 1;
  console.log(`  [${r.start}-${r.end}] len=${len} : "${r.text}"`);
}

// 共通ヘッダ
console.log('\n=== header ===');
console.log(`  [0:2]   RecordType   = "${payload.slice(0, 2)}"`);
console.log(`  [2:3]   DataKubun    = "${payload.slice(2, 3)}"`);
console.log(`  [3:11]  MakeDate     = "${payload.slice(3, 11)}"`);
console.log(`  [11:15] Year         = "${payload.slice(11, 15)}"`);
console.log(`  [15:19] MonthDay     = "${payload.slice(15, 19)}"`);
console.log(`  [19:21] JyoCD        = "${payload.slice(19, 21)}"`);
console.log(`  [21:23] Kaiji        = "${payload.slice(21, 23)}"`);
console.log(`  [23:25] Nichiji      = "${payload.slice(23, 25)}"`);
console.log(`  [25:27] RaceNum      = "${payload.slice(25, 27)}"`);
console.log(`  [27:29] TorokuTosu   = "${payload.slice(27, 29)}"`);
console.log(`  [29:31] SyussoTosu   = "${payload.slice(29, 31)}"`);
