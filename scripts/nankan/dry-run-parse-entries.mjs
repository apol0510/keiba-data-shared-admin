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

// ---------- 簡易 schema チェック（本格 validator は PR-F2） ----------
const RECORD_KEYS = ['total', 'left', 'right', 'venue', 'distance'];
const RECORD_FIELDS = ['wins', 'seconds', 'thirds', 'unplaced'];
const TOP_KEYS = ['version', 'createdAt', 'lastUpdated', 'date', 'venue', 'venueCode', 'category', 'totalRaces', 'races'];

function basicSchemaCheck(result, expect) {
  const errors = [];
  for (const k of TOP_KEYS) {
    if (!(k in result)) errors.push(`top-level key 欠落: ${k}`);
  }
  if (expect.date && result.date !== expect.date) errors.push(`date 不一致: ${result.date} != ${expect.date}`);
  if (expect.venueCode && result.venueCode !== expect.venueCode) errors.push(`venueCode 不一致: ${result.venueCode} != ${expect.venueCode}`);
  if (expect.venue && result.venue !== expect.venue) errors.push(`venue 不一致: ${result.venue} != ${expect.venue}`);
  if (expect.category && result.category !== expect.category) errors.push(`category 不一致: ${result.category} != ${expect.category}`);

  if (!Array.isArray(result.races)) {
    errors.push('races が配列でない');
    return errors;
  }
  if (result.races.length === 0) {
    errors.push('races が空（0レース）＝抽出に失敗（入力形式・date/venue を確認）');
  }
  if (result.totalRaces !== result.races.length) {
    errors.push(`totalRaces(${result.totalRaces}) != races.length(${result.races.length})`);
  }

  result.races.forEach((race, ri) => {
    if (race.raceNumber == null) errors.push(`race[${ri}] raceNumber 欠落`);
    if (!Array.isArray(race.horses) || race.horses.length === 0) {
      errors.push(`race[${ri}] horses 空`);
      return;
    }
    race.horses.forEach((h, hi) => {
      const tag = `race[${ri}].horse[${hi}]`;
      if (h.number == null) errors.push(`${tag} number 欠落`);
      if (!h.name) errors.push(`${tag} name 欠落`);
      if (!h.record || typeof h.record !== 'object') {
        errors.push(`${tag} record 欠落`);
      } else {
        for (const rk of RECORD_KEYS) {
          if (!h.record[rk]) { errors.push(`${tag} record.${rk} 欠落`); continue; }
          for (const f of RECORD_FIELDS) {
            if (typeof h.record[rk][f] !== 'number') errors.push(`${tag} record.${rk}.${f} 非数値`);
          }
        }
      }
      if (!Array.isArray(h.recentRaces)) errors.push(`${tag} recentRaces 非配列`);
      else if (h.recentRaces.length > 5) errors.push(`${tag} recentRaces > 5 (${h.recentRaces.length})`);
    });
  });

  return errors;
}

// ---------- 充足率 ----------
function fillRates(result) {
  let horses = 0, recordFilled = 0, recentFilled = 0;
  for (const race of result.races) {
    for (const h of race.horses || []) {
      horses++;
      const t = h.record?.total;
      if (t && (t.wins + t.seconds + t.thirds + t.unplaced) > 0) recordFilled++;
      if (Array.isArray(h.recentRaces) && h.recentRaces.length > 0) recentFilled++;
    }
  }
  const pct = (n) => horses === 0 ? '0%' : `${Math.round((n / horses) * 100)}%`;
  return { horses, recordFilled, recentFilled, recordPct: pct(recordFilled), recentPct: pct(recentFilled) };
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

  const errors = basicSchemaCheck(parsed, { date, venueCode: code, venue: venueName, category: 'nankan' });
  const rates = fillRates(parsed);

  result.parsed = parsed;
  result.warnings = warnings;
  result.schemaErrors = errors;
  result.rates = rates;
  result.raceCount = parsed.races.length;
  result.horseCount = rates.horses;
  result.outPath = outPath || null;
  result.ok = errors.length === 0;
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
  L(`  race count  : ${r.raceCount}`);
  L(`  horse count : ${r.horseCount}`);
  L(`  record 充足率   : ${r.rates.recordPct} (${r.rates.recordFilled}/${r.rates.horses})`);
  L(`  recentRaces 充足率: ${r.rates.recentPct} (${r.rates.recentFilled}/${r.rates.horses})`);
  if (r.warnings && r.warnings.length) L(`  warnings    : ${r.warnings.length}件`);
  L(`  output      : ${r.outPath ? r.outPath : 'stdout'}`);
  L(`  schema      : ${r.ok ? '✅ OK' : `❌ ${r.schemaErrors.length}件不一致`}`);
  if (!r.ok) r.schemaErrors.slice(0, 20).forEach(e => L(`     - ${e}`));
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
