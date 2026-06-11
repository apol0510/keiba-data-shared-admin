#!/usr/bin/env node
/**
 * 南関 entries テキスト → JSON 変換の dry-run（PR-F1a）
 *
 * 目的:
 * - コピペ相当のローカルテキスト（出馬表テキスト）を、既存 `nankan/entries` schema の
 *   parsedResult JSON へ変換し、stdout または tmp に出力するだけ。
 * - **取得しない・保存しない**（fetch / HTML整形は PR-F1b、shared 保存は PR-F3）。
 *
 * 厳守:
 * - shared へ保存しない / save-entries を呼ばない / GitHub PUT しない。
 * - nankankeiba.com / uma_info / keiba.go.jp へアクセスしない。
 * - token を読まない・出さない。
 * - featureScores / AI指数 / 印 / 買い目 / 穴馬 に接続しない。
 *
 * CLI 例:
 *   node scripts/nankan/dry-run-parse-entries.mjs --date=2026-06-29 --venue=OOI --input=tmp/entries-2026-06-29-OOI.txt
 *   cat tmp/x.txt | node scripts/nankan/dry-run-parse-entries.mjs --date=2026-06-29 --venue=OOI
 *   node scripts/nankan/dry-run-parse-entries.mjs --date=2026-06-29 --venue=OOI --input=... --out=tmp/2026-06-29-OOI.entries.dry.json
 *
 * 複数会場（将来拡張・F1a では単一でよいが構造は塞がない）:
 *   --venues=OOI,FUN --inputs=tmp/a.txt,tmp/b.txt
 *
 * 終了コード: schema 不一致が1つでもあれば 1、それ以外 0。
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseEntriesText, NANKAN_VENUE_NAME_BY_CODE } from '../../src/lib/nankan/entries-parser.mjs';
import { validateNankanEntriesData } from '../../src/lib/nankan/entries-schema-validator.mjs';

const NANKAN_CODES = Object.keys(NANKAN_VENUE_NAME_BY_CODE); // ['OOI','KAW','FUN','URA']

// ---------- CLI パース ----------
function parseArgs(argv) {
  const args = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
    else if (a.startsWith('--')) args[a.slice(2)] = true;
  }
  return args;
}

function csv(v) {
  return String(v).split(',').map(s => s.trim()).filter(Boolean);
}

// ---------- 1 venue 処理 ----------
function processVenue({ date, code, inputPath, outPath, useStdin }) {
  const venueName = NANKAN_VENUE_NAME_BY_CODE[code];
  const result = { code, venueName, inputPath: inputPath || (useStdin ? '<stdin>' : null) };

  let text;
  try {
    text = useStdin ? readFileSync(0, 'utf-8') : readFileSync(inputPath, 'utf-8');
  } catch (e) {
    result.ok = false;
    result.error = `入力読込失敗: ${e.message}`;
    return result;
  }

  let parsed;
  const warnings = [];
  try {
    parsed = parseEntriesText(text, {
      date,
      venue: venueName,
      venueCode: code,
      category: 'nankan',
      onWarn: (m) => warnings.push(m)
    });
  } catch (e) {
    result.ok = false;
    result.error = `parse 失敗: ${e.message}`;
    return result;
  }

  const v = validateNankanEntriesData(parsed, {
    expect: { date, venueCode: code, venue: venueName, category: 'nankan' }
  });

  result.parsed = parsed;
  result.parseWarnings = warnings;        // parser からの警告
  result.schemaErrors = v.errors;         // validator のハード失敗
  result.schemaWarnings = v.warnings;     // validator のソフト警告
  result.summary = v.summary;
  result.raceCount = v.summary.totalRaces;
  result.horseCount = v.summary.totalHorses;
  result.outPath = outPath || null;
  result.ok = v.ok;
  return result;
}

// ---------- 出力 ----------
function emit(result) {
  const json = JSON.stringify(result.parsed, null, 2);
  if (result.outPath) {
    // tmp への書き出しのみ許可（shared には書かない）
    writeFileSafe(result.outPath, json);
  } else {
    process.stdout.write(json + '\n');
  }
}

function writeFileSafe(outPath, content) {
  // 安全策: shared/ や nankan/entries 直下など共有データへの書き込みを拒否
  const lowered = outPath.replace(/\\/g, '/');
  if (/(^|\/)(keiba-data-shared)(\/|$)/.test(lowered) || /(^|\/)nankan\/entries(\/|$)/.test(lowered)) {
    throw new Error(`保存先が共有データ領域です。dry-run は tmp/stdout のみ: ${outPath}`);
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, content, 'utf-8');
}

// ---------- ログ ----------
function logVenue(r) {
  const L = (s) => process.stderr.write(s + '\n');
  L('────────────────────────────────────────');
  L(`[DRY_RUN] 保存しません（stdout/tmp のみ・shared PUT なし）`);
  L(`  date        : ${r.date ?? '-'}`);
  L(`  venue       : ${r.venueName ?? '-'}`);
  L(`  venueCode   : ${r.code}`);
  L(`  input       : ${r.inputPath ?? '-'}`);
  if (!r.ok && r.error) { L(`  RESULT      : ❌ ${r.error}`); return; }
  const s = r.summary || {};
  L(`  race count  : ${r.raceCount}`);
  L(`  horse count : ${r.horseCount}`);
  L(`  record 充足率   : ${s.recordCoverage ?? '-'}`);
  L(`  recentRaces 充足率: ${s.recentRacesCoverage ?? '-'}`);
  const pw = (r.parseWarnings && r.parseWarnings.length) || 0;
  const sw = (r.schemaWarnings && r.schemaWarnings.length) || 0;
  L(`  warnings    : parser ${pw}件 / schema ${sw}件`);
  L(`  output      : ${r.outPath ? r.outPath : 'stdout'}`);
  L(`  schema      : ${r.ok ? '✅ OK' : `❌ ${r.schemaErrors.length}件 error`}`);
  if (!r.ok) r.schemaErrors.slice(0, 20).forEach(e => L(`     - [error] ${e}`));
  if (sw > 0) r.schemaWarnings.slice(0, 8).forEach(e => L(`     - [warn]  ${e}`));
}

// ---------- main ----------
function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.h) {
    process.stderr.write('使い方: --date=YYYY-MM-DD --venue=OOI --input=path.txt [--out=tmp/...json]\n');
    process.stderr.write('  複数会場(将来): --venues=OOI,FUN --inputs=a.txt,b.txt\n');
    process.exit(0);
  }

  const date = args.date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    process.stderr.write('❌ --date=YYYY-MM-DD が必要です\n');
    process.exit(2);
  }

  // venue 群（単一 --venue / 複数 --venues）。F1a は単一基本だが構造は複数を塞がない。
  let venues;
  if (args.venues) venues = csv(args.venues);
  else if (args.venue) venues = [String(args.venue)];
  else { process.stderr.write('❌ --venue=OOI（または --venues=OOI,FUN）が必要です\n'); process.exit(2); }

  for (const v of venues) {
    if (!NANKAN_CODES.includes(v)) {
      process.stderr.write(`❌ 未知の南関 venueCode: ${v}（許可: ${NANKAN_CODES.join('/')}）\n`);
      process.exit(2);
    }
  }

  // 入力群（--input 単一 / --inputs 複数 / stdin）
  let inputs = [];
  if (args.inputs) inputs = csv(args.inputs);
  else if (args.input) inputs = [String(args.input)];

  const useStdin = inputs.length === 0;
  if (useStdin && venues.length > 1) {
    process.stderr.write('❌ stdin 入力は単一 venue のみ。複数 venue は --inputs を使用\n');
    process.exit(2);
  }
  if (!useStdin && inputs.length !== venues.length) {
    process.stderr.write(`❌ venue 数(${venues.length}) と input 数(${inputs.length}) が不一致\n`);
    process.exit(2);
  }

  // 出力群（--out 単一 / --outs 複数）。省略時 stdout。
  let outs = [];
  if (args.outs) outs = csv(args.outs);
  else if (args.out) outs = [String(args.out)];

  const results = [];
  for (let i = 0; i < venues.length; i++) {
    const r = processVenue({
      date,
      code: venues[i],
      inputPath: useStdin ? null : inputs[i],
      outPath: outs[i] || null,
      useStdin
    });
    r.date = date;
    // 出力（schema OK の場合のみ JSON を出す。不一致は出さない＝保存しないの一貫性）
    if (r.ok && r.parsed) {
      try { emit(r); } catch (e) { r.ok = false; r.error = e.message; r.schemaErrors = r.schemaErrors || []; }
    }
    logVenue(r);
    results.push(r);
  }

  // summary（複数 venue 時）
  if (venues.length > 1) {
    const L = (s) => process.stderr.write(s + '\n');
    L('════════════════════════════════════════');
    L(`[SUMMARY] date=${date}`);
    for (const r of results) {
      const status = r.ok ? `OK ${r.raceCount}R/${r.horseCount}頭` : `FAIL (${r.error || (r.schemaErrors?.length + '件不一致')})`;
      L(`  ${r.code}: ${status}`);
    }
  }

  const anyFail = results.some(r => !r.ok);
  process.exit(anyFail ? 1 : 0);
}

main();
