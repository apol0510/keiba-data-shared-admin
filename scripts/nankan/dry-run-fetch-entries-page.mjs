#!/usr/bin/env node
/**
 * 南関 出馬表ページ 取得 dry-run（PR-F1b）
 *
 * 明示 1 URL（出馬表 uma_shosai/{raceID}.do）を低負荷で1回取得し、
 * Shift_JIS→UTF-8 変換 → HTML→parsedResult（direct mapping）→ F2 validator 検証 →
 * stdout/tmp 出力するだけ。**保存なし・クロールなし**。
 *
 * 厳守:
 * - shared へ保存しない / save-entries を呼ばない / GitHub PUT しない / dispatch しない。
 * - token を読まない・出さない。
 * - 対象は出馬表（uma_shosai = レース出馬表）。**uma_info（馬単体・全履歴）は対象外＝拒否**。
 * - keiba.go.jp DataRoom は対象外＝拒否。
 * - 明示 URL のみ。リンクを辿らない・自動巡回しない。
 *
 * CLI 例:
 *   node scripts/nankan/dry-run-fetch-entries-page.mjs --date=2026-06-10 --venue=OOI \
 *     --url=https://www.nankankeiba.com/syousai/2026061020040301.do
 *   ... --out=tmp/nankan/2026-06-10-OOI-R01.entries.dry.json
 *
 * 終了コード: schema error → 1 / 引数不正・スコープ外URL → 2 / 取得失敗 → 3 / OK → 0。
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { convertNankanEntriesHtmlToParsed, isRecordUnsourced } from '../../src/lib/nankan/entries-html-to-parsed.mjs';
import { validateNankanEntriesData } from '../../src/lib/nankan/entries-schema-validator.mjs';
import { NANKAN_VENUE_NAME_BY_CODE } from '../../src/lib/nankan/entries-parser.mjs';

const NANKAN_CODES = Object.keys(NANKAN_VENUE_NAME_BY_CODE);
const UA = 'keiba-data-shared-admin research (contact: apolone_bkm@yahoo.co.jp)';
const L = (s) => process.stderr.write(s + '\n');

function parseArgs(argv) {
  const args = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
    else if (a.startsWith('--')) args[a.slice(2)] = true;
  }
  return args;
}

// 出馬表 ID（16桁）= YYYYMMDD + jyo(2) + kai(2) + nichi(2) + R(2) から date / raceNumber を導出
function deriveFromUrl(url) {
  const m = url.match(/\/(?:syousai|uma_shosai)\/(\d{16})\.do/);
  if (!m) return {};
  const id = m[1];
  return {
    date: `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}`,
    raceNumber: parseInt(id.slice(14, 16), 10)
  };
}

function detectCharset(contentType, htmlHead) {
  const ct = (contentType || '').toLowerCase();
  if (/shift_?jis|sjis|x-sjis|windows-31j/.test(ct)) return 'shift_jis';
  if (/utf-?8/.test(ct)) return 'utf-8';
  // meta からの簡易検出（先頭バイト列を latin1 で覗く）
  if (/shift_?jis|sjis/i.test(htmlHead)) return 'shift_jis';
  return 'shift_jis'; // nankankeiba 既定
}

function writeFileSafe(outPath, content) {
  const lowered = outPath.replace(/\\/g, '/');
  if (/(^|\/)(keiba-data-shared)(\/|$)/.test(lowered) || /(^|\/)nankan\/entries(\/|$)/.test(lowered)) {
    throw new Error(`保存先が共有データ領域です。dry-run は tmp/stdout のみ: ${outPath}`);
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, content, 'utf-8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    L('使い方: --url=<uma_shosai/syousai URL> [--date=YYYY-MM-DD] [--venue=OOI] [--out=tmp/...json]');
    process.exit(0);
  }

  const url = args.url ? String(args.url) : null;
  if (!url) { L('❌ --url=<出馬表URL> が必要です（F1b は明示URL）'); process.exit(2); }

  // スコープガード
  let u;
  try { u = new URL(url); } catch { L(`❌ URL 不正: ${url}`); process.exit(2); }
  if (!/(^|\.)nankankeiba\.com$/.test(u.hostname)) { L(`❌ 対象は nankankeiba.com のみ: ${u.hostname}`); process.exit(2); }
  if (/\/uma_info\//.test(u.pathname)) { L('❌ uma_info（馬単体・全履歴）は対象外'); process.exit(2); }
  if (/keiba\.go\.jp/.test(u.hostname)) { L('❌ keiba.go.jp は対象外'); process.exit(2); }
  if (!/\/(syousai|uma_shosai)\//.test(u.pathname)) {
    L(`⚠ 出馬表(syousai/uma_shosai)以外のパス: ${u.pathname}（続行するが想定外）`);
  }

  const venueCode = args.venue ? String(args.venue) : null;
  if (venueCode && !NANKAN_CODES.includes(venueCode)) {
    L(`❌ 未知の南関 venueCode: ${venueCode}（許可: ${NANKAN_CODES.join('/')}）`); process.exit(2);
  }

  // ---- 取得（1回・redirect 追従）----
  let res, buf;
  try {
    res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
    buf = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    L(`❌ 取得失敗: ${e.message}`); process.exit(3);
  }

  const contentType = res.headers.get('content-type') || '';
  const head = buf.slice(0, 1024).toString('latin1');
  const charset = detectCharset(contentType, head);

  let html;
  try {
    html = new TextDecoder(charset).decode(buf);
  } catch (e) {
    L(`❌ デコード失敗(${charset}): ${e.message}`); process.exit(3);
  }

  const derived = deriveFromUrl(url);
  const date = args.date || derived.date || '';
  const venueName = venueCode ? NANKAN_VENUE_NAME_BY_CODE[venueCode] : '';

  // ---- HTML → parsedResult ----
  let parsed;
  try {
    parsed = convertNankanEntriesHtmlToParsed(html, {
      date, venue: venueName, venueCode: venueCode || '',
      category: 'nankan', raceNumber: derived.raceNumber, sourceUrl: url
    });
  } catch (e) {
    L(`❌ HTML→parsedResult 失敗: ${e.message}`); process.exit(3);
  }

  // ---- validator ----
  const v = validateNankanEntriesData(parsed, {
    expect: { date: date || undefined, venueCode: venueCode || undefined, venue: venueName || undefined, category: 'nankan' }
  });
  const recordUnsourced = isRecordUnsourced(parsed);

  // ---- 出力（schema OK のときのみ JSON を出す）----
  const outPath = args.out ? String(args.out) : null;
  let outErr = null;
  if (v.ok) {
    try {
      const json = JSON.stringify(parsed, null, 2);
      if (outPath) writeFileSafe(outPath, json);
      else process.stdout.write(json + '\n');
    } catch (e) { outErr = e.message; }
  }

  // ---- ログ ----
  L('────────────────────────────────────────');
  L('[DRY_RUN] 保存しません（stdout/tmp のみ・shared PUT なし・save-entries 非呼出）');
  L(`  url(req)    : ${url}`);
  L(`  url(final)  : ${res.url}`);
  L(`  status      : ${res.status}`);
  L(`  content-type: ${contentType}`);
  L(`  charset     : ${charset}`);
  L(`  size        : ${buf.length} bytes`);
  L(`  date        : ${parsed.date || '-'}`);
  L(`  venue       : ${parsed.venue || '-'} (${parsed.venueCode || '-'})`);
  L(`  raceNumber  : ${parsed.races[0]?.raceNumber ?? '-'}`);
  L(`  raceName    : ${parsed.races[0]?.raceName || '-'}`);
  L(`  horse count : ${v.summary.totalHorses}`);
  L(`  record 充足率   : ${v.summary.recordCoverage}${recordUnsourced ? '  ← record は当ページ未収録(番組表/成績ビュー由来・F1b未取得)' : ''}`);
  L(`  recentRaces 充足率: ${v.summary.recentRacesCoverage}`);
  L(`  schema warn : ${v.warnings.length}件`);
  L(`  output      : ${outErr ? `❌ ${outErr}` : (outPath || 'stdout')}`);
  L(`  schema      : ${v.ok ? '✅ OK' : `❌ ${v.errors.length}件 error`}`);
  if (!v.ok) v.errors.slice(0, 20).forEach(e => L(`     - [error] ${e}`));
  if (v.warnings.length) v.warnings.slice(0, 6).forEach(e => L(`     - [warn]  ${e}`));

  if (outErr) process.exit(1);
  process.exit(v.ok ? 0 : 1);
}

main();
