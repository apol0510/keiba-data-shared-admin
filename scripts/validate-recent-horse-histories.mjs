#!/usr/bin/env node
/**
 * 南関 recentHorseHistories 保存前検査 validator — Phase 4 preflight
 *
 * 設計: docs/nankan-recent-horse-histories-implementation-plan.md §10.3
 *
 * Phase 3 で生成した tmp JSON を入力に、shared PUT 可否を判定する（PASS / HOLD / FAIL）。
 *   - 入力を読むだけ。JSON生成・保存・shared PUT・dispatch・AK/KI接続はしない。
 *   - generator 本体（enrich-recent-horse-histories.mjs）は触らない。
 *   - --file は admin repo 内 tmp/ 配下のみ許可。shared 実パス指定は FAIL。
 *
 * 使い方:
 *   node scripts/validate-recent-horse-histories.mjs --file=tmp/nankan/recentHorseHistories/2026/05/2026-05-29-URA.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_ROOT = path.resolve(__dirname, '..');
const TMP_ROOT = path.join(ADMIN_ROOT, 'tmp');
const SHARED_ROOT = process.env.KEIBA_DATA_SHARED_ROOT
  ? path.resolve(process.env.KEIBA_DATA_SHARED_ROOT)
  : path.resolve(__dirname, '..', '..', 'keiba-data-shared');

const SCHEMA_VERSION = 'nankan-recent-horse-histories-v0';

// 閾値（§10.3）
const MATCH_RATE_WARN = 0.30;
const NO_RESULT_FILE_RATE_WARN = 0.70;
const PASSING_ORDER_MISSING_RATE_WARN = 0.30;
const TIME_FAIL_RATE_STRONG_WARN = 0.05; // >=5% 強warn
const TIME_FAIL_RATE_HOLD = 0.10;        // >=10% HOLD
const SUSPECT_RATE_WARN = 0.10;          // result-present-horse-absent / racebook-pastrace-suspect が多い
const DEFICIENCY_RATE_WARN = 0.70;       // no-surface 等が多い

const USAGE = `南関 recentHorseHistories 保存前検査 validator (Phase 4: preflight)

Usage:
  node scripts/validate-recent-horse-histories.mjs --file=tmp/nankan/recentHorseHistories/YYYY/MM/YYYY-MM-DD-{VENUE}.json

Options:
  --file=<path>   検査対象の tmp JSON（admin repo 内 tmp/ 配下のみ）。必須
  --help, -h      このヘルプ

判定: PASS / HOLD / FAIL（HOLD = 構造OKだが time-fail 等で人間確認が必要）
`;

// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { file: null, help: false };
  for (const raw of argv) {
    const [k, v] = raw.includes('=') ? raw.split(/=(.*)/s) : [raw, true];
    switch (k) {
      case '--file': args.file = v; break;
      case '--help': case '-h': args.help = true; break;
      default: console.error(`Unknown argument: ${k}`); process.exit(1);
    }
  }
  return args;
}

function isWithin(parent, child) {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function isGitTracked(absPath) {
  try {
    execSync(`git ls-files --error-unmatch -- ${JSON.stringify(absPath)}`, { cwd: ADMIN_ROOT, stdio: 'ignore' });
    return true;
  } catch { return false; }
}

function sharedIsClean() {
  try {
    const out = execSync('git status --porcelain', { cwd: SHARED_ROOT, encoding: 'utf8' });
    return out.trim() === '';
  } catch { return null; } // shared が無い等
}

// JSON生成物が admin の git tracked/untracked に出ていないか
function jsonNotExposedInGit(absFile) {
  try {
    const out = execSync('git status --porcelain', { cwd: ADMIN_ROOT, encoding: 'utf8' });
    // tmp/ 配下は .gitignore 済 → 出てこないはず。recentHorseHistories の .json が status に出たら露出
    const exposed = out.split('\n').filter(l => /recentHorseHistories\/.*\.json/.test(l));
    return exposed.length === 0;
  } catch { return true; }
}

// ---------------------------------------------------------------------------
// 集計
// ---------------------------------------------------------------------------
function collect(json) {
  const s = {
    races: 0, horses: 0, recentTotal: 0,
    sourceEnriched: 0, sourceRacebook: 0,
    matchedHeadCountMissing: 0, ambiguousAsEnriched: 0,
    flags: {},
    timeFail: 0, timeFailContaminated: 0, timeFailSamples: [],
    fieldSizeKeyFound: false, headCountKeyFound: false,
    unknownVenue: 0, noResultFile: 0, outside: 0, nameMiss: 0, ambiguous: 0,
    matched: 0, passingOrderMissingMatched: 0,
    suspectAbsent: 0, suspectPastrace: 0,
    noSurface: 0, noTrackCond: 0, noPopularity: 0, noMargin: 0,
  };
  const inc = (f) => { s.flags[f] = (s.flags[f] || 0) + 1; };
  const races = json.races || [];
  s.races = races.length;
  for (const race of races) {
    const horses = race.horses || [];
    s.horses += horses.length;
    for (const h of horses) {
      for (const rr of (h.recentRaces || [])) {
        s.recentTotal++;
        const keys = Object.keys(rr);
        if (keys.includes('headCount')) s.headCountKeyFound = true;
        if (keys.includes('fieldSize')) s.fieldSizeKeyFound = true;
        for (const f of (rr.dataQualityFlags || [])) inc(f);

        const enriched = rr.source === 'results-enriched';
        if (enriched) { s.sourceEnriched++; s.matched++; } else if (rr.source === 'racebook-only') s.sourceRacebook++;

        const fl = rr.dataQualityFlags || [];
        if (enriched && (rr.headCount == null)) s.matchedHeadCountMissing++;
        if (fl.includes('match-ambiguous') && enriched) s.ambiguousAsEnriched++;
        if (enriched && rr.passingOrder == null) s.passingOrderMissingMatched++;

        if (fl.includes('result-present-horse-absent')) s.suspectAbsent++;
        if (fl.includes('racebook-pastrace-suspect')) s.suspectPastrace++;
        if (fl.includes('no-surface')) s.noSurface++;
        if (fl.includes('no-track-condition')) s.noTrackCond++;
        if (fl.includes('no-popularity')) s.noPopularity++;
        if (fl.includes('no-margin')) s.noMargin++;
        if (fl.includes('no-result-file')) s.noResultFile++;
        if (fl.includes('outside-nankan')) s.outside++;

        // time-fail: time が正規化済(M:SS.d / 0:SS.d)でない → 失敗扱い
        const t = rr.time;
        const normalized = typeof t === 'string' && /^\d+:\d{2}\.\d$/.test(t);
        if (t != null && !normalized) {
          s.timeFail++;
          if (/[頭枠]/.test(String(t))) s.timeFailContaminated++;
          if (s.timeFailSamples.length < 10) {
            s.timeFailSamples.push({ horseName: h.horseName, raceNumber: race.raceNumber, time: t, date: rr.date, venue: rr.venue });
          }
        }
      }
    }
  }
  s.matchRate = s.recentTotal ? s.matched / s.recentTotal : 0;
  s.noResultFileRate = s.recentTotal ? s.noResultFile / s.recentTotal : 0;
  s.timeFailRate = s.recentTotal ? s.timeFail / s.recentTotal : 0;
  s.passingOrderMissingRate = s.matched ? s.passingOrderMissingMatched / s.matched : 0;
  return s;
}

// ---------------------------------------------------------------------------
// 判定
// ---------------------------------------------------------------------------
function judge({ absFile, parsed, json, s, pastTotalExpected }) {
  const errors = [], warnings = [], holds = [];

  // ---- FAIL 条件 ----
  if (isWithin(SHARED_ROOT, absFile)) errors.push(`--file が keiba-data-shared 実パス配下です: ${absFile}`);
  if (!isWithin(TMP_ROOT, absFile)) errors.push(`--file が admin repo 内 tmp/ 配下ではありません: ${absFile}`);
  if (!parsed.ok) { errors.push(`JSON parse 不可: ${parsed.err}`); return { status: 'FAIL', errors, warnings, holds }; }
  if (json.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion 不一致: ${json.schemaVersion}`);
  for (const k of ['date', 'venue', 'venueName']) if (json[k] == null || json[k] === '') errors.push(`必須項目欠落: ${k}`);
  if (!Array.isArray(json.races) || json.races.some(r => !Array.isArray(r.horses))) errors.push('races/horses 構造欠落');
  if (json.races && json.races.some(r => (r.horses || []).some(h => !Array.isArray(h.recentRaces)))) errors.push('recentRaces 構造欠落');

  // recentRaces総数検査: pastTotalExpected が渡された場合のみ厳密比較。なければ source 内訳整合のみ
  if (pastTotalExpected != null && s.recentTotal !== pastTotalExpected) {
    errors.push(`recentRaces総数(${s.recentTotal}) != 入力pastRaces総数(${pastTotalExpected})`);
  }
  if (s.sourceEnriched + s.sourceRacebook !== s.recentTotal) {
    errors.push(`source内訳合計(${s.sourceEnriched}+${s.sourceRacebook}) != recentRaces総数(${s.recentTotal})`);
  }
  if (s.matchedHeadCountMissing > 0) errors.push(`results-enriched で headCount 欠損: ${s.matchedHeadCountMissing}件`);
  if (s.fieldSizeKeyFound) errors.push('fieldSize キーが出力されている');
  if (!s.headCountKeyFound && s.recentTotal > 0) errors.push('headCount キーが出力されていない');
  if (s.ambiguousAsEnriched > 0) errors.push(`ambiguous が results-enriched として採用されている: ${s.ambiguousAsEnriched}件`);

  const sharedClean = sharedIsClean();
  if (sharedClean === false) errors.push('keiba-data-shared に変更がある（clean でない）');
  if (!jsonNotExposedInGit(absFile)) errors.push('JSON生成物が admin の git tracked/untracked に出ている');

  // ---- HOLD 条件 ----
  if (s.timeFailRate >= TIME_FAIL_RATE_HOLD) holds.push(`time-fail率 ${(s.timeFailRate * 100).toFixed(1)}% >= ${TIME_FAIL_RATE_HOLD * 100}%（PUT前に人間確認必須）`);

  // ---- warn 条件 ----
  if (s.timeFail > 0) warnings.push(`time-fail ${s.timeFail}件（率 ${(s.timeFailRate * 100).toFixed(1)}%）`);
  if (s.timeFailRate >= TIME_FAIL_RATE_STRONG_WARN && s.timeFailRate < TIME_FAIL_RATE_HOLD) warnings.push(`【強warn】time-fail率 ${(s.timeFailRate * 100).toFixed(1)}% >= ${TIME_FAIL_RATE_STRONG_WARN * 100}%`);
  if (s.unknownVenue > 0) warnings.push(`unknown-venue ${s.unknownVenue}件`);
  if (s.matchRate < MATCH_RATE_WARN) warnings.push(`match率が低い: ${(s.matchRate * 100).toFixed(1)}%`);
  if (s.noResultFileRate >= NO_RESULT_FILE_RATE_WARN) warnings.push(`no-result-file率が高い: ${(s.noResultFileRate * 100).toFixed(1)}%`);
  if (s.passingOrderMissingRate >= PASSING_ORDER_MISSING_RATE_WARN) warnings.push(`passingOrder欠損率(matched基準)が高い: ${(s.passingOrderMissingRate * 100).toFixed(1)}%`);
  if (s.recentTotal && s.suspectAbsent / s.recentTotal >= SUSPECT_RATE_WARN) warnings.push(`result-present-horse-absent が多い: ${s.suspectAbsent}件`);
  if (s.recentTotal && s.suspectPastrace / s.recentTotal >= SUSPECT_RATE_WARN) warnings.push(`racebook-pastrace-suspect が多い: ${s.suspectPastrace}件`);
  for (const [label, n] of [['no-surface', s.noSurface], ['no-track-condition', s.noTrackCond], ['no-popularity', s.noPopularity], ['no-margin', s.noMargin]]) {
    if (s.recentTotal && n / s.recentTotal >= DEFICIENCY_RATE_WARN) warnings.push(`${label} が多い: ${n}件`);
  }

  let status;
  if (errors.length) status = 'FAIL';
  else if (holds.length) status = 'HOLD';
  else status = 'PASS';
  return { status, errors, warnings, holds, sharedClean };
}

// ---------------------------------------------------------------------------
function printSummary(absFile, json, s, verdict) {
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  const flagKeys = [
    'source-results-enriched', 'source-racebook-only',
    'no-result-match', 'no-result-file', 'outside-nankan',
    'result-present-horse-absent', 'racebook-pastrace-suspect', 'horse-name-mismatch', 'match-ambiguous',
    'year-inferred',
    'no-track-condition', 'no-corner-order', 'no-popularity', 'no-margin', 'no-field-size', 'no-surface',
  ];
  console.log(`=== recentHorseHistories preflight: ${path.relative(ADMIN_ROOT, absFile)} ===`);
  console.log(`[meta]   schemaVersion=${json.schemaVersion}  date=${json.date}  venue=${json.venue}  venueName=${json.venueName}`);
  console.log(`[規模]   races=${s.races}  horses=${s.horses}  recentRaces=${s.recentTotal}`);
  console.log(`[source] results-enriched=${s.sourceEnriched}  racebook-only=${s.sourceRacebook}  (合計=${s.sourceEnriched + s.sourceRacebook})`);
  console.log(`[突合]   match率=${pct(s.matchRate)}  no-result-file率=${pct(s.noResultFileRate)}  passingOrder欠損率(matched)=${pct(s.passingOrderMissingRate)}`);
  console.log(`[キー]   headCount存在=${s.headCountKeyFound}  fieldSize存在=${s.fieldSizeKeyFound}`);
  console.log(`[time]   time-fail=${s.timeFail}件 (率 ${pct(s.timeFailRate)})  頭/枠混入疑い=${s.timeFailContaminated}件`);
  if (s.timeFailSamples.length) {
    console.log(`[time-failサンプル(最大10件)]`);
    for (const x of s.timeFailSamples) console.log(`         - ${x.horseName} R${x.raceNumber} time="${x.time}" ${x.date} ${x.venue}`);
  }
  console.log(`[flags]`);
  for (const k of flagKeys) console.log(`         ${k.padEnd(28)}: ${s.flags[k] || 0}`);
  console.log(`[env]    keiba-data-shared clean=${verdict.sharedClean}`);
  console.log(`[判定]   ${verdict.status}`);
  for (const e of verdict.errors) console.log(`         ✗ FAIL: ${e}`);
  for (const h of verdict.holds) console.log(`         ⏸ HOLD: ${h}`);
  for (const w of verdict.warnings) console.log(`         ⚠ WARN: ${w}`);
}

// ---------------------------------------------------------------------------
function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(USAGE); process.exit(0); }
  if (!args.file) { console.error('--file=<tmp配下path> が必要です。\n' + USAGE); process.exit(1); }

  const absFile = path.resolve(args.file);
  let parsed = { ok: false, err: null }, json = {};
  if (fs.existsSync(absFile)) {
    try { json = JSON.parse(fs.readFileSync(absFile, 'utf8')); parsed = { ok: true }; }
    catch (e) { parsed = { ok: false, err: e.message }; }
  } else {
    parsed = { ok: false, err: `ファイルが存在しません: ${absFile}` };
  }

  const s = collect(json);
  const verdict = judge({ absFile, parsed, json, s });
  printSummary(absFile, json, s, verdict);

  process.exit(verdict.status === 'FAIL' ? 2 : verdict.status === 'HOLD' ? 3 : 0);
}

main();
