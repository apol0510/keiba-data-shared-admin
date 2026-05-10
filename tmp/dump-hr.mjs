#!/usr/bin/env node
// HR レコード構造ダンパ
// 入力: raw-YYYY-MM-DD.utf8.txt
// 出力: 指定行のHRを 15byte 単位でオフセット付き表示

import { readFileSync } from 'fs';

const path = process.argv[2] ?? 'tmp/raw-2026-04-11.utf8.txt';
const target = process.argv[3] ?? 'HR'; // HR / RA / SE
const n = parseInt(process.argv[4] ?? '1', 10);

const lines = readFileSync(path, 'utf8').split(/\r?\n/);
let matched = 0;
for (const line of lines) {
  const m = line.match(/^\[(\d{4})\] ([A-Z0-9]{2})\|len=(\d+)\|(.*)$/);
  if (!m) continue;
  const [, idx, type, len, payload] = m;
  if (type !== target) continue;
  matched++;
  if (matched !== n) continue;

  console.log(`=== record #${idx} type=${type} len=${len} payloadLen=${payload.length} ===`);
  const width = 30;
  for (let i = 0; i < payload.length; i += width) {
    const chunk = payload.slice(i, i + width);
    // 可視化: 空白→'·'、制御文字→'.'
    const visible = chunk
      .replace(/ /g, '·')
      .replace(/[\x00-\x1f]/g, '.');
    console.log(`[${String(i).padStart(4, '0')}] ${visible}`);
  }
  break;
}
if (matched === 0) console.log(`no ${target} record found`);
