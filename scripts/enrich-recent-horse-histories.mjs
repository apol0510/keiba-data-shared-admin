#!/usr/bin/env node
/**
 * 南関 recentHorseHistories 生成 — Phase 2 stdout dry-run generator
 *
 * 設計: docs/nankan-recent-horse-histories-implementation-plan.md §10.1
 *
 * 本スクリプトは Phase 2 の「stdout summary のみ」実装である。
 *   - JSON生成・ローカル保存・shared PUT・workflow_dispatch・AK/KI接続はしない。
 *   - --dry-run は既定ON。--push / --write-local は明示エラーで exit 1。
 *   - --out が指定されても保存しない（summary に「指定あり・保存なし」と表示するだけ）。
 *
 * 突合ルール:
 *   - parent horseName 完全/正規化一致を必須ゲート
 *   - date + venueCode + normalized parent horseName を基本キー
 *   - distanceMeters は降格専用の検証補助（名前一致でも距離矛盾なら AMBIGUOUS）
 *   - time/distance/finish/winner 類似だけでは採用しない
 *   - ambiguous は採用しない
 *   - horse-name-mismatch は正規化一致で救済できた場合だけ（result-present-horse-absent とは別物）
 *
 * 使い方:
 *   node scripts/enrich-recent-horse-histories.mjs --date=2026-05-29 --venue=URA --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_ROOT = path.resolve(__dirname, '..');           // keiba-data-shared-admin
const TMP_ROOT = path.join(ADMIN_ROOT, 'tmp');              // Phase 3 で許可する唯一の書き込み先（.gitignore 済）
// admin/scripts/ から見て keiba-data-shared は admin repo の兄弟
const SHARED_ROOT = process.env.KEIBA_DATA_SHARED_ROOT
  ? path.resolve(process.env.KEIBA_DATA_SHARED_ROOT)
  : path.resolve(__dirname, '..', '..', 'keiba-data-shared');

const SCHEMA_VERSION = 'nankan-recent-horse-histories-v0';
const VENUE_MAP = { '大井': 'OOI', '川崎': 'KAW', '船橋': 'FUN', '浦和': 'URA' };
const VENUE_NAME = { OOI: '大井', KAW: '川崎', FUN: '船橋', URA: '浦和' };
const NANKAN_CODES = new Set(['OOI', 'KAW', 'FUN', 'URA']);
const OUTSIDE_NANKAN = new Set([
  '門別', '盛岡', '水沢', '金沢', '笠松', '名古屋', '園田', '姫路', '高知', '佐賀', '帯広',
  '中山', '東京', '京都', '阪神', '中京', '新潟', '福島', '小倉', '札幌', '函館',
]);

const MATCH_RATE_WARN = 0.30;       // match率 < 30% で warn
const NO_RESULT_FILE_RATE_WARN = 0.70; // no-result-file率 >= 70% で warn
const PASSING_ORDER_MISSING_RATE_WARN = 0.30; // passingOrder欠損率(matched基準) >= 30% で warn

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { date: null, venue: null, dryRun: true, dryRunExplicit: false, out: null, writeLocal: false, push: false, help: false };
  for (const raw of argv) {
    const [k, v] = raw.includes('=') ? raw.split(/=(.*)/s) : [raw, true];
    switch (k) {
      case '--date': args.date = v; break;
      case '--venue': args.venue = typeof v === 'string' ? v.toUpperCase() : v; break;
      case '--dry-run': args.dryRun = true; args.dryRunExplicit = true; break;
      case '--out': args.out = v; break;
      case '--write-local': args.writeLocal = true; break;
      case '--push': args.push = true; break;
      case '--help': case '-h': args.help = true; break;
      default:
        console.error(`Unknown argument: ${k}`);
        process.exit(1);
    }
  }
  return args;
}

const USAGE = `南関 recentHorseHistories generator (Phase 2: dry-run summary only)

Usage:
  node scripts/enrich-recent-horse-histories.mjs --date=YYYY-MM-DD --venue=OOI|KAW|FUN|URA [--dry-run]

Options:
  --date=YYYY-MM-DD   対象開催日（必須）
  --venue=CODE        会場 3文字コード OOI/KAW/FUN/URA（必須）
  --dry-run           stdout summary のみ（既定ON）
  --out=<path>        出力先候補。Phase 2 では保存しない（表示のみ）
  --write-local       【Phase 2では無効】指定するとエラー終了
  --push              【Phase 2では未実装】指定するとエラー終了
  --help, -h          このヘルプ
`;

// ---------------------------------------------------------------------------
// I/O: loadRacebook / loadResultsIndex
// ---------------------------------------------------------------------------
function loadRacebook(date, venue) {
  const [y, m] = date.split('-');
  const p = path.join(SHARED_ROOT, 'nankan', 'racebook', y, m, `${date}-${venue}.json`);
  if (!fs.existsSync(p)) {
    throw new Error(`racebook が見つかりません（生成中止）: ${p}`);
  }
  return { path: p, json: JSON.parse(fs.readFileSync(p, 'utf8')) };
}

function loadResultsIndex() {
  const cache = new Map();
  let loadCount = 0;
  function load(date, code) {
    if (!code) return null;
    const key = `${date}-${code}`;
    if (cache.has(key)) return cache.get(key);
    const [y, m] = date.split('-');
    const p = path.join(SHARED_ROOT, 'nankan', 'results', y, m, `${date}-${code}.json`);
    let v = null;
    try {
      if (fs.existsSync(p)) { v = JSON.parse(fs.readFileSync(p, 'utf8')); loadCount++; }
    } catch { v = null; }
    cache.set(key, v);
    return v;
  }
  return { load, get loadCount() { return loadCount; } };
}

// ---------------------------------------------------------------------------
// 純粋関数群
// ---------------------------------------------------------------------------
function parsePastRaceDate(venueStr, baseDate) {
  const m = String(venueStr || '').match(/^(\D+?)\s*(\d{1,2})\.(\d{1,2})$/);
  if (!m) return { ok: false, name: null, date: null, yearInferred: false };
  const name = m[1].trim();
  const mo = +m[2], da = +m[3];
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return { ok: false, name, date: null, yearInferred: false };
  const baseY = +baseDate.slice(0, 4);
  const base = Date.UTC(baseY, +baseDate.slice(5, 7) - 1, +baseDate.slice(8, 10));
  let y = baseY, yearInferred = false;
  if (Date.UTC(y, mo - 1, da) > base) { y = baseY - 1; yearInferred = true; }
  const date = `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
  return { ok: true, name, date, yearInferred };
}

function normalizeVenue(name) {
  if (!name) return { venueCode: null, outside: false, unknown: true };
  if (VENUE_MAP[name]) return { venueCode: VENUE_MAP[name], outside: false, unknown: false };
  if (OUTSIDE_NANKAN.has(name)) return { venueCode: null, outside: true, unknown: false };
  return { venueCode: null, outside: false, unknown: true };
}

function normalizeHorseName(s) {
  return String(s || '').normalize('NFKC').replace(/[・\s]/g, '').trim();
}

function normalizeDistanceMeters(d) {
  if (d == null) return null;
  if (typeof d === 'number') return Number.isFinite(d) ? d : null;
  const m = String(d).match(/(\d{3,4})/);
  return m ? +m[1] : null;
}

function normalizeTime(t) {
  if (t == null) return { ok: false, raw: t, sec: null, norm: null };
  const s = String(t).trim();
  let m;
  if ((m = s.match(/^(\d+):(\d{1,2})\.(\d)$/))) {           // 1:24.9
    return { ok: true, sec: (+m[1]) * 60 + (+m[2]) + (+m[3]) / 10, norm: `${+m[1]}:${m[2].padStart(2, '0')}.${m[3]}` };
  }
  if ((m = s.match(/^(\d+)\.(\d{2})\.(\d)$/))) {            // 1.24.9
    return { ok: true, sec: (+m[1]) * 60 + (+m[2]) + (+m[3]) / 10, norm: `${+m[1]}:${m[2]}.${m[3]}` };
  }
  if ((m = s.match(/^(\d{1,2})\.(\d)$/))) {                 // 59.4
    return { ok: true, sec: (+m[1]) + (+m[2]) / 10, norm: `0:${String(+m[1]).padStart(2, '0')}.${m[2]}` };
  }
  return { ok: false, raw: s, sec: null, norm: null };
}

function buildResultLookup(resultsFile) {
  // normalizedName -> [{ race, row, rawName }]
  const map = new Map();
  for (const race of resultsFile.races || []) {
    for (const row of race.results || []) {
      const key = normalizeHorseName(row.name);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ race, row, rawName: row.name });
    }
  }
  return map;
}

function derivePassingOrder(cornerData, horseNumber) {
  if (!Array.isArray(cornerData) || cornerData.length === 0 || horseNumber == null) return null;
  const positions = [];
  for (const corner of cornerData) {
    const order = corner.order || [];
    const idx = order.indexOf(horseNumber);
    if (idx >= 0) positions.push(idx + 1);
  }
  return positions.length ? positions.join('-') : null;
}

// ---------------------------------------------------------------------------
// matchPastRaceToResult — 突合判定＋status（フラグ生成の単一責任点）
// ---------------------------------------------------------------------------
function matchPastRaceToResult(past, parentName, resultsIndex, dateInfo, venueInfo) {
  if (!dateInfo.ok) return { status: 'NO_DATE', race: null, row: null, normalizedRescue: false };
  if (venueInfo.outside) return { status: 'OUTSIDE', race: null, row: null, normalizedRescue: false };
  if (venueInfo.unknown || !venueInfo.venueCode) return { status: 'UNKNOWN_VENUE', race: null, row: null, normalizedRescue: false };

  const resultsFile = resultsIndex.load(dateInfo.date, venueInfo.venueCode);
  if (!resultsFile) return { status: 'NO_FILE', race: null, row: null, normalizedRescue: false };

  const lookup = buildResultLookup(resultsFile);
  const key = normalizeHorseName(parentName);
  const cands = lookup.get(key) || [];

  if (cands.length === 0) return { status: 'HORSE_ABSENT', race: null, row: null, normalizedRescue: false };
  if (cands.length >= 2) return { status: 'AMBIGUOUS', race: null, row: null, normalizedRescue: false };

  const cand = cands[0];
  // 距離矛盾チェック（降格専用）
  const pastDM = normalizeDistanceMeters(past.distanceMeters ?? past.distance);
  const candDM = normalizeDistanceMeters(cand.race.distance);
  if (pastDM != null && candDM != null && pastDM !== candDM) {
    return { status: 'AMBIGUOUS', race: null, row: null, normalizedRescue: false, distanceConflict: true };
  }
  const normalizedRescue = cand.rawName !== parentName; // 完全一致でなく正規化で救済
  return { status: 'MATCHED', race: cand.race, row: cand.row, normalizedRescue };
}

// ---------------------------------------------------------------------------
// buildRecentRace — 1過去走の出力オブジェクト + dataQualityFlags（順序固定）
// ---------------------------------------------------------------------------
function buildRecentRace(past, parentName, dateInfo, venueInfo, match) {
  const flags = [];
  const matched = match.status === 'MATCHED';
  const race = match.race, row = match.row;

  // [1] source（先頭・排他）
  flags.push(matched ? 'source-results-enriched' : 'source-racebook-only');

  // [2][3] 突合失敗系
  if (!matched) {
    flags.push('no-result-match');
    if (match.status === 'NO_FILE' || match.status === 'UNKNOWN_VENUE') flags.push('no-result-file');
    if (match.status === 'OUTSIDE') flags.push('outside-nankan');
    if (match.status === 'HORSE_ABSENT') { flags.push('result-present-horse-absent'); flags.push('racebook-pastrace-suspect'); }
    if (match.status === 'AMBIGUOUS') {
      flags.push('match-ambiguous');
      if (match.distanceConflict) flags.push('racebook-pastrace-suspect');
    }
  }

  // [4] 表記ゆれ救済
  if (matched && match.normalizedRescue) flags.push('horse-name-mismatch');

  // [5] 日付
  if (dateInfo.yearInferred) flags.push('year-inferred');
  if (!dateInfo.ok) flags.push('no-date');

  // 値の組み立て（results優先、無ければ racebook、無ければ null）
  const tn = normalizeTime(past.time);
  const headCount = matched && typeof race.horses === 'number' ? race.horses : null;
  const trackCondition = matched ? (race.trackCondition ?? null) : null;
  const surface = matched ? (race.surface ?? null) : null;
  const popularity = matched && row.popularity != null ? row.popularity : null;
  const margin = matched && row.margin != null ? row.margin : null;
  const passingOrder = matched ? derivePassingOrder(race.cornerData, row.number) : null;

  // [6] 欠損系（補完後の実効値）
  if (trackCondition == null) flags.push('no-track-condition');
  if (passingOrder == null) flags.push('no-corner-order');
  if (popularity == null) flags.push('no-popularity');
  if (margin == null) flags.push('no-margin');
  if (headCount == null) flags.push('no-field-size'); // フラグ名のみ。出力フィールドは headCount
  if (surface == null) flags.push('no-surface');

  return {
    date: dateInfo.ok ? dateInfo.date : null,
    yearInferred: dateInfo.yearInferred,
    venue: dateInfo.name,
    venueCode: venueInfo.venueCode,
    raceNumber: matched ? (race.raceNumber ?? null) : null,
    raceName: matched ? (race.raceName ?? null) : (past.raceClass ?? null),
    distance: past.distance ?? null,
    distanceMeters: normalizeDistanceMeters(past.distanceMeters ?? past.distance),
    surface,
    trackCondition,
    headCount,
    horseNumber: matched ? (row.number ?? null) : null,
    finish: past.finish ?? null,
    popularity,
    bodyWeight: past.bodyWeight ?? null,
    jockey: past.jockey ?? null,
    carriedWeight: past.weight ?? null,
    time: tn.ok ? tn.norm : (past.time ?? null),
    passingOrder,
    last3f: past.final3F ?? null,
    margin,
    opponentName: matched ? null : (past.winner ?? null),
    resultMatched: matched,
    source: matched ? 'results-enriched' : 'racebook-only',
    sourcePriority: matched ? 2 : 3,
    resultMatchKey: matched ? `${dateInfo.date}|${venueInfo.venueCode}|${normalizeHorseName(parentName)}` : null,
    dataQualityFlags: flags,
    // 内部集計用（出力JSONに含めるが summary でも使う）
    _status: match.status,
    _timeFail: !tn.ok && past.time != null,
    _unknownVenue: venueInfo.unknown ? dateInfo.name : null,
  };
}

// ---------------------------------------------------------------------------
// buildRecentHorseHistories
// ---------------------------------------------------------------------------
function buildRecentHorseHistories(racebook, resultsIndex, baseDate, venue) {
  const out = {
    schemaVersion: SCHEMA_VERSION,
    category: 'nankan',
    date: baseDate,
    venue,
    venueName: VENUE_NAME[venue] || racebook.track || null,
    source: {
      base: 'racebook',
      enrichment: ['results'],
      generatedAt: new Date().toISOString(),
      generator: 'enrich-recent-horse-histories@v0-dry-run',
    },
    races: [],
  };
  let pastTotal = 0;
  const allRecent = [];
  for (const race of racebook.races || []) {
    const horsesOut = [];
    for (const h of race.horses || []) {
      const recentRaces = [];
      for (const past of h.pastRaces || []) {
        pastTotal++;
        const dateInfo = parsePastRaceDate(past.venue, baseDate);
        const venueInfo = normalizeVenue(dateInfo.name);
        const match = matchPastRaceToResult(past, h.name, resultsIndex, dateInfo, venueInfo);
        const rr = buildRecentRace(past, h.name, dateInfo, venueInfo, match);
        recentRaces.push(rr);
        allRecent.push(rr);
      }
      horsesOut.push({ horseNumber: h.number ?? null, horseName: h.name, recentRaces });
    }
    out.races.push({ raceNumber: race.raceNumber, raceName: race.raceClass ?? null, horses: horsesOut });
  }
  return { json: out, pastTotal, allRecent };
}

// ---------------------------------------------------------------------------
// collectSummary
// ---------------------------------------------------------------------------
function collectSummary({ json, pastTotal, allRecent }, racebook, resultsIndex) {
  const races = (racebook.races || []).length;
  const horses = (racebook.races || []).reduce((n, r) => n + (r.horses || []).length, 0);
  const recentOut = allRecent.length;

  const s = {
    races, horses, pastTotal, recentOut,
    matched: 0, noResultFile: 0, outside: 0, nameMiss: 0, ambiguous: 0, noDate: 0,
    yearInferred: 0, unknownVenue: 0, timeFail: 0, headCountMissingMatched: 0, passingOrderMissingMatched: 0,
    resultsLoadCount: resultsIndex.loadCount,
    flags: {},
    unknownVenueNames: new Set(),
    timeFailSamples: [],
  };
  const inc = (f) => { s.flags[f] = (s.flags[f] || 0) + 1; };

  for (const rr of allRecent) {
    for (const f of rr.dataQualityFlags) inc(f);
    switch (rr._status) {
      case 'MATCHED': s.matched++; break;
      case 'NO_FILE': case 'UNKNOWN_VENUE': s.noResultFile++; break;
      case 'OUTSIDE': s.outside++; break;
      case 'HORSE_ABSENT': s.nameMiss++; break;
      case 'AMBIGUOUS': s.ambiguous++; break;
      case 'NO_DATE': s.noDate++; break;
    }
    if (rr.yearInferred) s.yearInferred++;
    if (rr._unknownVenue) { s.unknownVenue++; s.unknownVenueNames.add(rr._unknownVenue); }
    if (rr._timeFail) { s.timeFail++; if (s.timeFailSamples.length < 10) s.timeFailSamples.push(rr.time); }
    if (rr._status === 'MATCHED') {
      if (rr.headCount == null) s.headCountMissingMatched++;
      if (rr.passingOrder == null) s.passingOrderMissingMatched++;
    }
  }
  s.noResultMatch = s.noResultFile + s.outside + s.nameMiss + s.ambiguous;
  s.matchRate = pastTotal ? s.matched / pastTotal : 0;
  s.noResultMatchRate = pastTotal ? s.noResultMatch / pastTotal : 0;
  s.noResultFileRate = pastTotal ? s.noResultFile / pastTotal : 0;
  return s;
}

// ---------------------------------------------------------------------------
// validateOutput
// ---------------------------------------------------------------------------
function validateOutput(json, summary, pastTotal) {
  const errors = [], warnings = [];

  if (summary.recentOut !== pastTotal) errors.push(`出力recentRaces件数(${summary.recentOut}) != 入力pastRaces総件数(${pastTotal})`);
  if (summary.recentOut < pastTotal) errors.push(`出力件数が入力より減少（${summary.recentOut} < ${pastTotal}）`);
  if (!Array.isArray(json.races) || json.races.some(r => !Array.isArray(r.horses))) errors.push('races/horses 構造が欠落');
  for (const k of ['schemaVersion', 'date', 'venue', 'venueName']) {
    if (json[k] == null || json[k] === '') errors.push(`必須トップ項目欠落: ${k}`);
  }
  // MATCHED で headCount 欠損
  if (summary.headCountMissingMatched > 0) errors.push(`MATCHED で headCount 欠損: ${summary.headCountMissingMatched}件`);
  // ambiguous なのに results-enriched
  for (const r of json.races) for (const h of r.horses) for (const rr of h.recentRaces) {
    if (rr.dataQualityFlags.includes('match-ambiguous') && rr.source === 'results-enriched') {
      errors.push(`ambiguous が results-enriched 採用されている: ${h.horseName}`); break;
    }
  }

  if (summary.unknownVenue > 0) warnings.push(`unknown-venue ${summary.unknownVenue}件: ${[...summary.unknownVenueNames].join(', ')}`);
  if (summary.timeFail > 0) warnings.push(`time正規化失敗 ${summary.timeFail}件: ${summary.timeFailSamples.join(', ')}`);
  if (summary.matchRate < MATCH_RATE_WARN) warnings.push(`match率が低い: ${(summary.matchRate * 100).toFixed(1)}% < ${MATCH_RATE_WARN * 100}%`);
  if (summary.noResultFileRate >= NO_RESULT_FILE_RATE_WARN) warnings.push(`no-result-file率が高い: ${(summary.noResultFileRate * 100).toFixed(1)}% >= ${NO_RESULT_FILE_RATE_WARN * 100}%`);
  const poRate = summary.matched ? summary.passingOrderMissingMatched / summary.matched : 0;
  if (poRate >= PASSING_ORDER_MISSING_RATE_WARN) warnings.push(`passingOrder欠損率(matched基準)が高い: ${(poRate * 100).toFixed(1)}% >= ${PASSING_ORDER_MISSING_RATE_WARN * 100}%`);

  return { pass: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// 出力先パスの解決と許可判定（Phase 3: admin repo 内 tmp/ 配下のみ許可）
// ---------------------------------------------------------------------------
function resolveDefaultOutputPath(date, venue) {
  const [y, m] = date.split('-');
  return path.join(TMP_ROOT, 'nankan', 'recentHorseHistories', y, m, `${date}-${venue}.json`);
}

function isWithin(parent, child) {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function isGitTracked(absPath) {
  try {
    execSync(`git ls-files --error-unmatch -- ${JSON.stringify(absPath)}`, { cwd: ADMIN_ROOT, stdio: 'ignore' });
    return true; // exit 0 = tracked
  } catch {
    return false;
  }
}

// 書き込み許可判定（fail 理由の配列を返す。空なら許可）
function assertAllowedOutputPath(outPath) {
  const errors = [];
  const abs = path.resolve(outPath);
  if (isWithin(SHARED_ROOT, abs)) errors.push(`出力先が keiba-data-shared 本番パス配下です（禁止）: ${abs}`);
  if (!isWithin(TMP_ROOT, abs)) errors.push(`出力先が admin repo 内 tmp/ 配下ではありません（Phase 3 で許可されるのは tmp/ のみ）: ${abs}`);
  if (isGitTracked(abs)) errors.push(`出力先が git tracked path です（禁止）: ${abs}`);
  if (fs.existsSync(abs)) errors.push(`出力先ファイルが既に存在します（上書き禁止）: ${abs}`);
  return { abs, errors };
}

// ---------------------------------------------------------------------------
// printSummary
// ---------------------------------------------------------------------------
function printSummary({ rbPath, summary: s, validation, args, write }) {
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  const flagKeys = [
    'source-results-enriched', 'source-racebook-only',
    'no-result-match', 'no-result-file', 'outside-nankan',
    'result-present-horse-absent', 'racebook-pastrace-suspect', 'horse-name-mismatch', 'match-ambiguous',
    'year-inferred',
    'no-track-condition', 'no-corner-order', 'no-popularity', 'no-margin', 'no-field-size', 'no-surface',
  ];
  const mode = write && write.wrote ? 'write-local' : 'dry-run';
  let writeInfo;
  if (write && write.wrote) {
    writeInfo = `write-local 成功: ${write.path}`;
  } else if (write) {
    writeInfo = write.reason || 'dry-run（書き込みなし）';
    if (write.errors) for (const e of write.errors) writeInfo += `\n         ✗ ${e}`;
  } else {
    writeInfo = 'dry-run（書き込みなし）';
  }
  console.log(`=== recentHorseHistories ${mode}: ${args.date}-${args.venue} ===`);
  console.log(`[入力]   racebook: ${rbPath}`);
  console.log(`         results : 動的ロード ${s.resultsLoadCount} ファイル`);
  console.log(`[規模]   races=${s.races}  horses=${s.horses}  pastRaces=${s.pastTotal}`);
  console.log(`[出力]   recentRaces=${s.recentOut}  (= pastRaces, 欠落 ${s.pastTotal - s.recentOut})`);
  console.log(`[突合]   matched=${s.matched} (${pct(s.matchRate)})  no-result-match=${s.noResultMatch} (${pct(s.noResultMatchRate)})`);
  console.log(`         ├ no-result-file=${s.noResultFile}  outside-nankan=${s.outside}  name-miss(result-present-horse-absent)=${s.nameMiss}  ambiguous=${s.ambiguous}`);
  console.log(`[日付]   year-inferred=${s.yearInferred}   no-date=${s.noDate}`);
  console.log(`[正規化] unknown-venue=${s.unknownVenue}   time-fail=${s.timeFail}`);
  console.log(`[補完]   headCount欠損(matched)=${s.headCountMissingMatched}   passingOrder欠損(matched)=${s.passingOrderMissingMatched}`);
  console.log(`[flags]`);
  for (const k of flagKeys) console.log(`         ${k.padEnd(28)}: ${s.flags[k] || 0}`);
  console.log(`[検査]   validateOutput: ${validation.pass ? 'PASS' : 'FAIL'}`);
  for (const e of validation.errors) console.log(`         ✗ ERROR: ${e}`);
  for (const w of validation.warnings) console.log(`         ⚠ WARN : ${w}`);
  console.log(`[書込]   ${writeInfo}`);
}

// ---------------------------------------------------------------------------
// maybeWriteLocal — Phase 3: admin repo 内 tmp/ 配下のみ書き込み
//   書き込み条件: writeLocal && !dryRun && validateOutput PASS && 出力先許可 && --push でない
//   いずれか満たさなければ書き込まず、理由を返す。
// ---------------------------------------------------------------------------
function maybeWriteLocal(json, args, validation) {
  // dry-run 優先（--dry-run 明示時は書き込まない）
  if (!args.writeLocal) return { wrote: false, reason: 'dry-run（--write-local 未指定・書き込みなし）' };
  if (args.dryRunExplicit) return { wrote: false, reason: 'dry-run 優先（--dry-run と --write-local 同時指定のため書き込まない）' };
  if (args.push) return { wrote: false, reason: '--push 指定のため書き込まない（exit 1 済）' };

  const outPath = args.out ? args.out : resolveDefaultOutputPath(args.date, args.venue);
  const { abs, errors: pathErrors } = assertAllowedOutputPath(outPath);

  // content validation FAIL なら書き込まない
  if (!validation.pass) return { wrote: false, reason: `validateOutput FAIL のため書き込まない`, errors: validation.errors };
  if (pathErrors.length) return { wrote: false, reason: '出力先 validation FAIL のため書き込まない', errors: pathErrors };

  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(json, null, 2) + '\n', 'utf8');
  return { wrote: true, path: abs };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(USAGE); process.exit(0); }

  if (args.push) { console.error('--push は Phase 3 では未実装です（exit 1）。'); process.exit(1); }

  if (!args.date || !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) { console.error('--date=YYYY-MM-DD が必要です。\n' + USAGE); process.exit(1); }
  if (!args.venue || !NANKAN_CODES.has(args.venue)) { console.error('--venue は OOI/KAW/FUN/URA のいずれかが必要です。\n' + USAGE); process.exit(1); }

  const { path: rbPath, json: racebook } = loadRacebook(args.date, args.venue);
  const resultsIndex = loadResultsIndex();
  const built = buildRecentHorseHistories(racebook, resultsIndex, args.date, args.venue);
  const summary = collectSummary(built, racebook, resultsIndex);
  const validation = validateOutput(built.json, summary, built.pastTotal);

  const write = maybeWriteLocal(built.json, args, validation);
  printSummary({ rbPath, summary, validation, args, write });

  // 書き込みを要求したのに validation 等で書けなかった場合は失敗終了
  const writeRequested = args.writeLocal && !args.dryRunExplicit;
  if (writeRequested && !write.wrote) process.exit(2);
  process.exit(validation.pass ? 0 : 2);
}

main();
