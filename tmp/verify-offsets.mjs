#!/usr/bin/env node
// 新 offset を JS 側で再実装して、raw-2026-04-11 から復元できるか検証。
// RecordParser.cs に反映した定数をそのまま使う。

import { readFileSync } from 'fs';
import iconv from 'iconv-lite';

const lines = readFileSync('tmp/raw-2026-04-11.utf8.txt', 'utf8').split(/\r?\n/);

function* records(type) {
  for (const line of lines) {
    const m = line.match(/^\[(\d{4})\] ([A-Z0-9]{2})\|len=(\d+)\|(.*)$/);
    if (!m || m[2] !== type) continue;
    yield { idx: m[1], len: +m[3], payload: m[4] };
  }
}

function trimZeros(s) {
  const t = s.trim().replace(/^0+/, '');
  return t.length === 0 ? '0' : t;
}
function formatKumi(kumi) {
  const s = kumi.trim();
  if (s.length === 2) return `${s[0]}-${s[1]}`;
  if (s.length === 4) return `${trimZeros(s.slice(0, 2))}-${trimZeros(s.slice(2, 4))}`;
  if (s.length === 6) return `${trimZeros(s.slice(0, 2))}-${trimZeros(s.slice(2, 4))}-${trimZeros(s.slice(4, 6))}`;
  return s;
}
function parsePayouts(r, start, slots, kLen, pLen, nLen, single) {
  const out = [];
  const size = kLen + pLen + nLen;
  for (let i = 0; i < slots; i++) {
    const off = start + i * size;
    if (off + size > r.length) break;
    const kumi = r.substr(off, kLen);
    const pay = r.substr(off + kLen, pLen);
    const ninki = r.substr(off + kLen + pLen, nLen);
    if (!kumi.trim()) continue;
    const payInt = parseInt(pay, 10);
    if (!payInt || isNaN(payInt)) continue;
    const entry = { payout: payInt, popularity: parseInt(ninki, 10) || null };
    if (single) entry.number = trimZeros(kumi);
    else entry.combination = formatKumi(kumi);
    out.push(entry);
  }
  return out;
}

function parseHR(r) {
  return {
    tansho:     parsePayouts(r, 102, 3, 2, 9, 2, true),
    fukusho:    parsePayouts(r, 141, 5, 2, 9, 2, true),
    wakuren:    parsePayouts(r, 206, 3, 2, 9, 2, false),
    umaren:     parsePayouts(r, 245, 3, 4, 9, 3, false),
    wide:       parsePayouts(r, 293, 7, 4, 9, 3, false),
    umatan:     parsePayouts(r, 453, 6, 4, 9, 3, false),
    sanrenpuku: parsePayouts(r, 549, 3, 6, 9, 3, false),
    sanrentan:  parsePayouts(r, 603, 6, 6, 9, 4, false),
  };
}

// Sample 3 HR records
console.log('=== HR verification ===');
let n = 0;
for (const rec of records('HR')) {
  if (n >= 3) break;
  n++;
  const hr = parseHR(rec.payload);
  const head = {
    record: rec.idx,
    jyo: rec.payload.slice(19, 21),
    kaiji: rec.payload.slice(21, 23),
    nichi: rec.payload.slice(23, 25),
    race: rec.payload.slice(25, 27),
    toroku: rec.payload.slice(27, 29),
    syusso: rec.payload.slice(29, 31),
  };
  console.log(`\n#${head.record} Jyo${head.jyo} K${head.kaiji}-${head.nichi} R${head.race} (登録${head.toroku} 出走${head.syusso})`);
  for (const [k, v] of Object.entries(hr)) {
    if (v.length === 0) continue;
    console.log(`  ${k}: ${JSON.stringify(v)}`);
  }
}

// RA verification
console.log('\n=== RA verification ===');
n = 0;
for (const rec of records('RA')) {
  if (n >= 3) break;
  n++;
  const bytes = iconv.encode(rec.payload, 'shift_jis');
  const slice = (off, len) => iconv.decode(bytes.slice(off, off + len), 'shift_jis').trim();
  const hondai = slice(32, 60);
  const kyori = slice(697, 4);
  const track = slice(705, 2);
  const hasso = slice(873, 4);
  const grade = slice(614, 1);
  console.log(`  #${rec.idx} race="${hondai}" kyori=${kyori}m track=${track} hasso=${hasso} grade=${grade}`);
}

// SE verification
console.log('\n=== SE verification ===');
n = 0;
for (const rec of records('SE')) {
  if (n >= 5) break;
  n++;
  const bytes = iconv.encode(rec.payload, 'shift_jis');
  const slice = (off, len) => iconv.decode(bytes.slice(off, off + len), 'shift_jis').trim();
  const wakuban = rec.payload.substr(27, 1);
  const umaban = rec.payload.substr(28, 2);
  const bamei = slice(40, 36);
  const sex = slice(78, 1);
  const age = slice(82, 2);
  const chokyo = slice(90, 8);
  const kishu = slice(306, 8);
  const futan = slice(288, 3);
  console.log(`  #${rec.idx} ${wakuban}枠${umaban}番 "${bamei}" 性${sex} ${age}歳 調教師${chokyo} 騎手${kishu} 斤量${futan}`);
}
