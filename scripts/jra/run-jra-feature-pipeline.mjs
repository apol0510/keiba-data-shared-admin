#!/usr/bin/env node
/**
 * JRA featureScores 半自動パイプライン（Phase 1: dry-run 統合のみ）。
 *
 * 目的:
 *   JRA予想更新後に手作業になっている horseHistories → featureScores の
 *   dry-run 検査までを 1 コマンドで実行し、品質を一括レポートする。
 *
 * ★★★ Phase 1 安全保証 ★★★
 *   - shared への書き込み一切なし / GitHub PUT 一切なし / dispatch 一切なし
 *     / AK・KI workflow_dispatch 一切なし / push 用 token 不要。
 *   - 既存 CLI を「子プロセス」で呼ぶだけ（内部関数 import しない・既存 CLI 改修しない）。
 *   - 子プロセスへ --push / --confirm-push / --dispatch を渡さない（dry-run のみ）。
 *
 * 使い方:
 *   node scripts/jra/run-jra-feature-pipeline.mjs \
 *     --urls=urls.txt --date=2026-06-07 --venues=TOK,HAN [--out=tmp/jra-feature-pipeline]
 *
 * フロー:
 *   1. urls.txt 確認
 *   2. horseHistories dry-run fetch（auto-fetch-horse-histories.mjs --urls --out=<dir>、--push なし）
 *   3. horseHistories tmp JSON 検査（頭数 / failures / 当日混入）
 *   4. featureScores dry-run 生成（build-feature-scores-once.mjs --source local、--push なし）
 *   5. featureScores tmp JSON 検査（6項目 / NaN / 50固定 / 全頭同値 / 当日残）
 *   6. レポート出力
 *
 * Phase 1 の制約:
 *   - featureScores 生成器（build-feature-scores-once.mjs）は shared local clone の
 *     horseHistories（../keiba-data-shared/jra/horseHistories/...）を読む。
 *     本パイプラインで直前に fetch した tmp horseHistories を直接入力する手段は無い。
 *   - したがって Phase 1 の featureScores dry-run は「shared に既に当該 horseHistories が
 *     存在する日付」でのみ最後まで通る。未存在日では featureScores 段で停止し、その旨を報告する。
 *   - 直前 tmp の直接入力は Phase 2 以降で既存 CLI 側の入力拡張が必要（本 Phase では行わない）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HH_CLI = path.join('scripts', 'jra', 'auto-fetch-horse-histories.mjs');
const FS_CLI = path.join('scripts', 'build-feature-scores-once.mjs');
const FS_TMP_DIR = path.join('tmp', 'feature-scores'); // build-feature-scores-once.mjs の固定出力先

const FEATURES = ['speedIndex', 'staminaRating', 'formTrend', 'trackCompatibility', 'distanceFitness', 'jockeyFactor'];

// ───── 引数 ─────
function parseArgs(argv) {
  const args = { urls: null, date: null, venues: null, out: path.join('tmp', 'jra-feature-pipeline') };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--urls=')) args.urls = a.slice('--urls='.length);
    else if (a.startsWith('--date=')) args.date = a.slice('--date='.length);
    else if (a.startsWith('--venues=')) args.venues = a.slice('--venues='.length);
    else if (a.startsWith('--out=')) args.out = a.slice('--out='.length);
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function usage() {
  console.log('Usage: node scripts/jra/run-jra-feature-pipeline.mjs --urls=urls.txt --date=YYYY-MM-DD --venues=TOK,HAN [--out=tmp/jra-feature-pipeline]');
  console.log('  Phase 1: dry-run のみ（shared PUT / dispatch / AK・KI import は行わない）');
}

// ───── 子プロセス実行（token を渡さない・コマンドは表示するが秘密は含まない）─────
function runCommand(cli, cliArgs, label) {
  console.log(`\n▶ ${label}`);
  console.log(`  $ node ${cli} ${cliArgs.join(' ')}`);
  const res = spawnSync('node', [cli, ...cliArgs], { cwd: REPO_ROOT, stdio: 'inherit' });
  if (res.error) {
    console.error(`  ❌ 実行エラー: ${res.error.message}`);
    return false;
  }
  if (res.status !== 0) {
    console.error(`  ❌ 子プロセスが非0終了 (exit=${res.status})`);
    return false;
  }
  return true;
}

// ───── 入力検証 ─────
function validateArgs(args) {
  const errs = [];
  if (!args.urls) errs.push('--urls=<path> が必須');
  if (!args.date || !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) errs.push('--date=YYYY-MM-DD が必須');
  if (!args.venues) errs.push('--venues=TOK,HAN が必須');
  return errs;
}

function validateUrlsFile(urlsPath, date) {
  const abs = path.resolve(REPO_ROOT, urlsPath);
  if (!fs.existsSync(abs)) return { ok: false, reason: `urls ファイルが存在しません: ${urlsPath}` };
  const lines = fs.readFileSync(abs, 'utf-8').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
  if (lines.length === 0) return { ok: false, reason: 'urls ファイルに有効な行がありません' };
  // CNAME 末尾 8 桁日付（YYYYMMDD）が --date と一致するか軽くチェック（推測生成はしない・既存値の検査のみ）
  const dateCompact = date.replace(/-/g, '');
  const mismatched = lines.filter((l) => /CNAME=/.test(l) && !l.includes(dateCompact));
  return { ok: true, lines, mismatched };
}

// ───── horseHistories 検査 ─────
function inspectHorseHistories(dir, date, venues) {
  const results = [];
  for (const v of venues) {
    const fpath = path.join(REPO_ROOT, dir, `${date}-${v}.json`);
    const r = { venue: v, fpath, exists: false, ok: false, issues: [] };
    if (!fs.existsSync(fpath)) { r.issues.push('ファイル無し'); results.push(r); continue; }
    r.exists = true;
    let j;
    try { j = JSON.parse(fs.readFileSync(fpath, 'utf-8')); }
    catch (e) { r.issues.push(`JSON parse 失敗: ${e.message}`); results.push(r); continue; }
    if (j.date !== date) r.issues.push(`date 不一致: ${j.date}`);
    if (j.venueCode !== v) r.issues.push(`venueCode 不一致: ${j.venueCode}`);
    const horses = j.horses && typeof j.horses === 'object' ? Object.values(j.horses) : [];
    r.horses = horses.length;
    if (horses.length === 0) r.issues.push('horses 0');
    const failures = Array.isArray(j.failures) ? j.failures.length : 0;
    r.failures = failures;
    if (failures > 0) r.issues.push(`failures=${failures}`);
    let sameDay = 0;
    for (const h of horses) for (const hr of (h.history || [])) if (hr.date === date) sameDay++;
    r.sameDay = sameDay;
    if (sameDay > 0) r.issues.push(`⚠️ history に当日(${date})混入=${sameDay}（過去日backfillの可能性・featureScores側でexcludeDate確認必須）`);
    r.ok = r.issues.filter((s) => !s.startsWith('⚠️')).length === 0;
    results.push(r);
  }
  return results;
}

// ───── featureScores 検査 ─────
function inspectFeatureScores(date, venues) {
  const results = [];
  for (const v of venues) {
    const fpath = path.join(REPO_ROOT, FS_TMP_DIR, `${date}-${v}.json`);
    const r = { venue: v, fpath, exists: false, ok: false, issues: [] };
    if (!fs.existsSync(fpath)) { r.issues.push('ファイル無し（shared に horseHistories 未存在の可能性／Phase1制約）'); results.push(r); continue; }
    r.exists = true;
    let j;
    try { j = JSON.parse(fs.readFileSync(fpath, 'utf-8')); }
    catch (e) { r.issues.push(`JSON parse 失敗: ${e.message}`); results.push(r); continue; }
    if (j.engine !== 'jra-v1') r.issues.push(`engine 不正: ${j.engine}`);
    let records = 0, nan = 0, undef = 0, sameDay = 0, allHi = 0;
    const fStat = Object.fromEntries(FEATURES.map((f) => [f, { vals: [], fifty: 0 }]));
    for (const rn of Object.keys(j.races || {})) {
      for (const hn of Object.keys(j.races[rn].horses || {})) {
        records++;
        const h = j.races[rn].horses[hn];
        for (const pr of (h.normalizedPastRaces || [])) if (pr.date === date) sameDay++;
        let hi = 0;
        for (const f of FEATURES) {
          const cell = h.featureScores ? h.featureScores[f] : undefined;
          const val = cell ? cell.value : undefined;
          if (val === undefined) { undef++; continue; }
          if (val === null) continue;
          if (typeof val === 'number' && Number.isNaN(val)) { nan++; continue; }
          fStat[f].vals.push(val);
          if (val === 50) fStat[f].fifty++;
          if (val >= 90) hi++;
        }
        if (hi >= 5) allHi++;
      }
    }
    r.records = records;
    if (records === 0) r.issues.push('records 0');
    if (nan > 0) r.issues.push(`NaN=${nan}`);
    if (undef > 0) r.issues.push(`undefined=${undef}`);
    if (sameDay > 0) r.issues.push(`❌ 当日(${date})残=${sameDay}（excludeDate が効いていない可能性）`);
    const fifty = Object.values(fStat).reduce((s, x) => s + x.fifty, 0);
    if (fifty > 0) r.issues.push(`50固定=${fifty}件`);
    // 全頭同値（各特徴量で unique==1 かつ件数>1）
    const uniform = FEATURES.filter((f) => fStat[f].vals.length > 1 && new Set(fStat[f].vals).size === 1);
    if (uniform.length) r.issues.push(`全頭同値: ${uniform.join(',')}`);
    r.allHi = allHi; // 6項目中5項目以上>=90 の馬数（96張り付き参考・Phase1では警告扱いしない）
    r.ok = r.issues.length === 0;
    results.push(r);
  }
  return results;
}

// ───── main ─────
function main() {
  const args = parseArgs(process.argv);
  if (args.help) { usage(); process.exit(0); }

  const errs = validateArgs(args);
  if (errs.length) { errs.forEach((e) => console.error(`❌ ${e}`)); usage(); process.exit(2); }

  const venues = args.venues.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (venues.length === 0) { console.error('❌ --venues が空'); process.exit(2); }

  console.log('========================================');
  console.log(`JRA feature pipeline (Phase 1: dry-run only)  date=${args.date} venues=${venues.join(',')}`);
  console.log('========================================');

  // 1. urls.txt 確認
  const uv = validateUrlsFile(args.urls, args.date);
  if (!uv.ok) { console.error(`❌ ${uv.reason}`); process.exit(2); }
  console.log(`[urls] ${uv.lines.length} 行`);
  if (uv.mismatched.length) {
    console.error(`❌ urls.txt に --date(${args.date}) と異なる日付の行が ${uv.mismatched.length} 件（推測生成はしない・原本を確認してください）`);
    process.exit(2);
  }
  console.log(`[urls] 全行が ${args.date} と整合 ✓`);

  // 2. horseHistories dry-run fetch（--push を渡さない）
  const hhOutDir = path.join(args.out, args.date, 'horseHistories');
  const okHh = runCommand(HH_CLI, [`--urls=${args.urls}`, `--out=${hhOutDir}`], 'horseHistories dry-run fetch（--push なし）');
  if (!okHh) { console.error('\n❌ horseHistories dry-run 失敗 → 停止'); process.exit(1); }

  // 3. horseHistories tmp 検査
  console.log('\n----- horseHistories 検査 -----');
  const hhRes = inspectHorseHistories(hhOutDir, args.date, venues);
  for (const r of hhRes) {
    console.log(`  ${r.venue}: ${r.ok ? '✓' : '✗'} horses=${r.horses ?? '-'} failures=${r.failures ?? '-'} sameDay=${r.sameDay ?? '-'}` + (r.issues.length ? ` [${r.issues.join(' / ')}]` : ''));
  }
  const hhFatal = hhRes.filter((r) => !r.ok);
  if (hhFatal.length) { console.error('\n❌ horseHistories 検査 NG → featureScores へ進まない'); process.exit(1); }

  // 4. featureScores dry-run 生成（会場ごと・--push を渡さない）
  //    制約: 入力は shared local clone の horseHistories。未存在日は失敗し得る（その旨報告）。
  console.log('\n----- featureScores dry-run（shared local の horseHistories を読む）-----');
  const fsRun = [];
  for (const v of venues) {
    const ok = runCommand(FS_CLI, ['--category', 'jra', '--date', args.date, '--venue', v, '--source', 'local'], `featureScores dry-run ${v}（--push なし）`);
    fsRun.push({ venue: v, ok });
  }
  const fsRunFail = fsRun.filter((x) => !x.ok);

  // 5. featureScores tmp 検査
  console.log('\n----- featureScores 検査 -----');
  const fsRes = inspectFeatureScores(args.date, venues);
  for (const r of fsRes) {
    console.log(`  ${r.venue}: ${r.ok ? '✓' : '✗'} records=${r.records ?? '-'} 5項目以上>=90の馬=${r.allHi ?? '-'}` + (r.issues.length ? ` [${r.issues.join(' / ')}]` : ''));
  }

  // 6. レポート
  console.log('\n========================================');
  console.log('サマリ');
  console.log('========================================');
  const fsFatal = fsRes.filter((r) => !r.ok);
  console.log(`horseHistories: ${hhFatal.length === 0 ? 'OK' : 'NG'}（${venues.length}会場）`);
  console.log(`featureScores : ${fsRunFail.length === 0 && fsFatal.length === 0 ? 'OK' : 'NG/未生成'}（生成失敗=${fsRunFail.length} / 検査NG=${fsFatal.length}）`);
  if (fsRunFail.length) {
    console.log('  ⚠️ featureScores 生成失敗の主因候補: shared local に当該 horseHistories が未存在（Phase1制約）。');
    console.log('     → 先に horseHistories を shared push & local pull する必要あり（Phase 2 で統合）。');
  }
  console.log('\nℹ️  Phase 1: dry-run のみ。shared PUT / dispatch / AK・KI import / push 用 token 使用は一切ありません（保存なし）。');

  if (fsRunFail.length || fsFatal.length) process.exit(1);
}

main();
