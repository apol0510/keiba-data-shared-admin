#!/usr/bin/env node
/**
 * 南関 entries JSON validator CLI（PR-F2・read-only）
 *
 * 既存の entries JSON ファイル（手作業出力・shared 実例・dry-run 出力）を
 * `validateNankanEntriesData` に通して検証し、summary / errors / warnings を表示する。
 *
 * 厳守:
 * - **read-only**。ファイルを読むだけ。保存・書き込み・fetch・GitHub PUT は一切しない。
 * - nankankeiba.com / uma_info / keiba.go.jp へアクセスしない。
 * - token を読まない・出さない。
 *
 * CLI 例:
 *   node scripts/nankan/validate-entries-json.mjs --input=tmp/nankan/2026-06-29-OOI.entries.dry.json
 *   node scripts/nankan/validate-entries-json.mjs --inputs=a.json,b.json
 *   node scripts/nankan/validate-entries-json.mjs --input=/path/to/shared/nankan/entries/2026/04/2026-04-07-KAW.json
 *
 * 終了コード: いずれかの入力で errors があれば 1、それ以外 0。引数不正は 2。
 */

import { readFileSync } from 'node:fs';
import { validateNankanEntriesData } from '../../src/lib/nankan/entries-schema-validator.mjs';

function parseArgs(argv) {
  const args = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
    else if (a.startsWith('--')) args[a.slice(2)] = true;
  }
  return args;
}
const csv = (v) => String(v).split(',').map(s => s.trim()).filter(Boolean);
const L = (s) => process.stderr.write(s + '\n');

function validateOne(path) {
  const r = { path };
  let text;
  try {
    text = readFileSync(path, 'utf-8');
  } catch (e) {
    r.ok = false; r.error = `読込失敗: ${e.message}`; return r;
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    r.ok = false; r.error = `JSON parse 失敗: ${e.message}`; return r;
  }
  const v = validateNankanEntriesData(data);
  r.ok = v.ok;
  r.errors = v.errors;
  r.warnings = v.warnings;
  r.summary = v.summary;
  return r;
}

function report(r) {
  L('────────────────────────────────────────');
  L(`  input       : ${r.path}`);
  if (r.error) { L(`  RESULT      : ❌ ${r.error}`); return; }
  const s = r.summary || {};
  L(`  date        : ${s.date ?? '-'}`);
  L(`  venue       : ${s.venue ?? '-'} (${s.venueCode ?? '-'})`);
  L(`  totalRaces  : ${s.totalRaces}`);
  L(`  totalHorses : ${s.totalHorses}`);
  L(`  record coverage     : ${s.recordCoverage}`);
  L(`  recentRaces coverage: ${s.recentRacesCoverage}`);
  L(`  warnings    : ${r.warnings.length}件`);
  L(`  schema      : ${r.ok ? '✅ OK' : `❌ ${r.errors.length}件 error`}`);
  if (!r.ok) r.errors.slice(0, 20).forEach(e => L(`     - [error] ${e}`));
  if (r.warnings.length) r.warnings.slice(0, 8).forEach(e => L(`     - [warn]  ${e}`));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    L('使い方: --input=<entries.json>  (または --inputs=a.json,b.json)');
    process.exit(0);
  }
  let inputs = [];
  if (args.inputs) inputs = csv(args.inputs);
  else if (args.input) inputs = [String(args.input)];
  if (inputs.length === 0) { L('❌ --input=<json> が必要です'); process.exit(2); }

  const results = inputs.map(validateOne);
  results.forEach(report);

  if (results.length > 1) {
    L('════════════════════════════════════════');
    L('[SUMMARY]');
    for (const r of results) {
      const status = r.error ? `READ/PARSE FAIL` : (r.ok ? 'OK' : `${r.errors.length} error`);
      const cov = r.summary ? ` rec ${r.summary.recordCoverage}/recent ${r.summary.recentRacesCoverage}` : '';
      L(`  ${r.path}: ${status}${cov}`);
    }
  }

  const anyFail = results.some(r => !r.ok);
  process.exit(anyFail ? 1 : 0);
}

main();
