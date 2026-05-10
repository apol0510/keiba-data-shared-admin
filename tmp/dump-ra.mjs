#!/usr/bin/env node
import { readFileSync } from 'fs';
import iconv from 'iconv-lite';

const path = process.argv[2] ?? 'tmp/raw-2026-04-11.utf8.txt';
const occ = parseInt(process.argv[3] ?? '1', 10);

const lines = readFileSync(path, 'utf8').split(/\r?\n/);
let matched = 0, payload = '';
for (const line of lines) {
  const m = line.match(/^\[(\d{4})\] RA\|len=(\d+)\|(.*)$/);
  if (!m) continue;
  matched++;
  if (matched !== occ) continue;
  payload = m[3];
  console.log(`record=${m[1]} len=${m[2]} payloadChars=${payload.length}`);
  break;
}
const bytes = iconv.encode(payload, 'shift_jis');
console.log(`SJIS bytes: ${bytes.length}`);

function slice(start, len, label) {
  const b = bytes.slice(start, start + len);
  const str = iconv.decode(b, 'shift_jis').replace(/　/g, '·');
  const hex = Array.from(b).slice(0, 20).map(x => x.toString(16).padStart(2, '0')).join(' ');
  console.log(`  [${start.toString().padStart(4)}:${(start+len).toString().padStart(4)}] ${label.padEnd(22)} = "${str}"  (hex head: ${hex})`);
}

console.log('\n=== RA header ===');
slice(0, 2, 'RecordType');
slice(2, 1, 'DataKubun');
slice(3, 8, 'MakeDate');
slice(11, 4, 'Year');
slice(15, 4, 'MonthDay');
slice(19, 2, 'JyoCD');
slice(21, 2, 'Kaiji');
slice(23, 2, 'Nichiji');
slice(25, 2, 'RaceNum');
slice(27, 2, 'YoubiCD (2)');
slice(29, 4, 'TokuNum (4)');

console.log('\n=== RA current offsets ===');
slice(32, 60, 'Hondai(@32,60)');
slice(92, 60, 'Fukudai(@92,60)');
slice(152, 60, 'Kakko(@152,60)');
slice(572, 20, 'Ryaku10(@572,20)');
slice(592, 12, 'Ryaku6(@592,12)');
slice(604, 6, 'Ryaku3(@604,6)');
slice(610, 1, 'Kubun(@610,1)');
slice(611, 3, 'Nkai(@611,3)');
slice(614, 1, 'Grade(@614,1)');
slice(632, 4, 'Kyori(@632,4)');
slice(640, 2, 'TrackCD(@640,2)');
slice(854, 4, 'HassoTime(@854,4)');

console.log('\n=== byte range 620-720 (find Kyori/TrackCD) ===');
const start = 620, end = 720;
for (let i = start; i < Math.min(bytes.length, end); i += 20) {
  slice(i, 20, `@${i}`);
}

console.log('\n=== byte range 800-900 (find HassoTime) ===');
for (let i = 800; i < Math.min(bytes.length, 900); i += 20) {
  slice(i, 20, `@${i}`);
}

console.log('\n=== tail (last 40 bytes) ===');
slice(Math.max(0, bytes.length - 40), 40, 'tail');
