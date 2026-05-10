#!/usr/bin/env node
// SE レコードを SJIS バイトベースでダンプして offset 検証
import { readFileSync } from 'fs';
import iconv from 'iconv-lite';

const path = process.argv[2] ?? 'tmp/raw-2026-04-11.utf8.txt';
const target = process.argv[3] ?? 'SE';
const occ = parseInt(process.argv[4] ?? '1', 10);

const lines = readFileSync(path, 'utf8').split(/\r?\n/);
let matched = 0;
let payload = '';
for (const line of lines) {
  const m = line.match(/^\[(\d{4})\] ([A-Z0-9]{2})\|len=(\d+)\|(.*)$/);
  if (!m) continue;
  if (m[2] !== target) continue;
  matched++;
  if (matched !== occ) continue;
  payload = m[4];
  console.log(`record=${m[1]} type=${m[2]} len=${m[3]} payloadChars=${payload.length}`);
  break;
}
if (!payload) { console.log('not found'); process.exit(1); }

const bytes = iconv.encode(payload, 'shift_jis');
console.log(`SJIS bytes: ${bytes.length}`);

function slice(start, len, label) {
  const b = bytes.slice(start, start + len);
  const str = iconv.decode(b, 'shift_jis');
  const hex = Array.from(b).map(x => x.toString(16).padStart(2, '0')).join(' ');
  console.log(`  [${start.toString().padStart(3)}:${(start+len).toString().padStart(3)}] ${label.padEnd(20)} = "${str}"  (hex: ${hex.length > 60 ? hex.slice(0,60)+'...' : hex})`);
}

console.log('\n=== Common header ===');
slice(0, 2, 'RecordType');
slice(2, 1, 'DataKubun');
slice(3, 8, 'MakeDate');
slice(11, 4, 'Year');
slice(15, 4, 'MonthDay');
slice(19, 2, 'JyoCD');
slice(21, 2, 'Kaiji');
slice(23, 2, 'Nichiji');
slice(25, 2, 'RaceNum');
slice(27, 1, 'Wakuban');
slice(28, 2, 'Umaban');
slice(30, 10, 'KettoNum');

console.log('\n=== Horse core (trying v4.8 spec) ===');
slice(40, 36, 'Bamei');
slice(76, 2, 'UmaKigoCD');
slice(78, 1, 'SexCD');
slice(79, 1, 'HinsyuCD');
slice(80, 2, 'KeiroCD');
slice(82, 2, 'BarnAge');
slice(84, 1, 'TozaiCD');
slice(85, 5, 'ChokyoshiCode');
slice(90, 8, 'ChokyoshiRyakusho');
slice(98, 6, 'BanushiCode');
slice(104, 40, 'BanushiName');
slice(144, 60, 'Fukushoku');

console.log('\n=== (positions after Fukushoku) ===');
// Fukushoku ends at 204. Next is Reserved(4)? → 208 maybe. Then Kishu.
slice(204, 4, 'Reserved?');
slice(208, 5, 'KishuCode');
slice(213, 34, 'KishuRyakusho');
slice(247, 1, 'Minarai');
slice(248, 3, 'Futan');
slice(251, 1, 'Blinker');

console.log('\n=== Result section (finish etc) ===');
// Hypothesis based on spec: KakuteiJyuni=575?, Time=579?
// Look by data patterns
for (const o of [500, 520, 540, 560, 570, 572, 574, 576, 578, 580, 582, 584, 586, 588, 590]) {
  slice(o, 8, `probe@${o}`);
}

console.log('\n=== Full SJIS hex dump (all bytes) ===');
for (let i = 0; i < bytes.length; i += 32) {
  const chunk = bytes.slice(i, i + 32);
  const hex = Array.from(chunk).map(x => x.toString(16).padStart(2, '0')).join(' ');
  const txt = iconv.decode(chunk, 'shift_jis').replace(/[\x00-\x1f]/g, '.').replace(/ /g, '·');
  console.log(`  @${i.toString().padStart(3)} | ${hex.padEnd(96)} | ${txt}`);
}
