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
const SHARED_ROOT = path.resolve(REPO_ROOT, '..', 'keiba-data-shared'); // shared local clone（featureScores生成器が読む）

const FEATURES = ['speedIndex', 'staminaRating', 'formTrend', 'trackCompatibility', 'distanceFitness', 'jockeyFactor'];

// ───── 引数 ─────
function parseArgs(argv) {
  const args = { urls: null, date: null, venues: null, out: path.join('tmp', 'jra-feature-pipeline'), pushHorseHistories: false, pushFeatureScores: false, confirmPush: null, importSites: false, confirmImport: null };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--urls=')) args.urls = a.slice('--urls='.length);
    else if (a.startsWith('--date=')) args.date = a.slice('--date='.length);
    else if (a.startsWith('--venues=')) args.venues = a.slice('--venues='.length);
    else if (a.startsWith('--out=')) args.out = a.slice('--out='.length);
    else if (a === '--push-horse-histories') args.pushHorseHistories = true;
    else if (a === '--push-feature-scores') args.pushFeatureScores = true;
    else if (a.startsWith('--confirm-push=')) args.confirmPush = a.slice('--confirm-push='.length);
    else if (a === '--import-sites') args.importSites = true;
    else if (a.startsWith('--confirm-import=')) args.confirmImport = a.slice('--confirm-import='.length);
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function usage() {
  console.log('Usage: node scripts/jra/run-jra-feature-pipeline.mjs --urls=urls.txt --date=YYYY-MM-DD --venues=TOK,HAN [--out=tmp/jra-feature-pipeline]');
  console.log('  Phase 1: dry-run のみ（shared PUT / dispatch / AK・KI import は行わない）');
  console.log('  Phase 2: --push-horse-histories --confirm-push=keiba-data-shared で horseHistories のみ shared 保存（create-only）');
  console.log('  Phase 3: --push-feature-scores --confirm-push=keiba-data-shared で featureScores も shared 保存（create-only・既存ありは停止）');
  console.log('  Phase 4: --import-sites --confirm-import=ak-ki で AK/KI へ workflow_dispatch import（push2種＋confirm-push 必須）');
}

// ───── AK/KI workflow_dispatch（gh）。token値は出さない。repository_dispatch は使わない ─────
const IMPORT_TARGETS = ['apol0510/analytics-keiba', 'apol0510/keiba-intelligence'];
const HH_IMPORT_WF = 'import-horse-histories-on-dispatch.yml';
const FS_IMPORT_WF = 'import-feature-scores-on-dispatch.yml';

function gh(args) {
  return spawnSync('gh', args, { cwd: REPO_ROOT, encoding: 'utf-8' });
}

/** workflow_dispatch 発火 → 直後の最新run id 取得（同workflow限定）→ completed まで短時間poll */
function dispatchAndWait(repo, workflow, fields, label) {
  console.log(`\n▶ import: ${label}  (${repo} / ${workflow})`);
  const fieldArgs = fields.flatMap((f) => ['-f', f]);
  const run = gh(['workflow', 'run', workflow, '--repo', repo, ...fieldArgs]);
  if (run.status !== 0) { console.error(`  ❌ workflow run 失敗: ${(run.stderr || '').trim()}`); return { ok: false }; }
  // 直後の最新run（同workflow）を取得。※同時実行の厳密照合は将来Phaseで createdAt/displayTitle 強化（設計メモ）
  let runId = null;
  for (let i = 0; i < 6; i++) {
    const list = gh(['run', 'list', '--repo', repo, '--workflow', workflow, '--limit', '1', '--json', 'databaseId,status,conclusion']);
    if (list.status === 0) { try { const a = JSON.parse(list.stdout || '[]'); if (a[0]?.databaseId) { runId = a[0].databaseId; break; } } catch {} }
    spawnSync('sleep', ['2']);
  }
  if (!runId) { console.error('  ❌ run id 取得不可'); return { ok: false }; }
  console.log(`  run id=${runId} … 完了待ち（最大6分・10秒間隔）`);
  // poll: 最大36回×10秒 = 6分
  for (let i = 0; i < 36; i++) {
    const v = gh(['run', 'view', String(runId), '--repo', repo, '--json', 'status,conclusion']);
    if (v.status === 0) {
      try {
        const j = JSON.parse(v.stdout || '{}');
        if (j.status === 'completed') {
          const ok = j.conclusion === 'success';
          console.log(`  ${ok ? '✅' : '❌'} run ${runId}: ${j.conclusion}`);
          return { ok, runId, conclusion: j.conclusion };
        }
      } catch {}
    }
    spawnSync('sleep', ['10']);
  }
  console.error(`  ⏳ run ${runId}: pending/in_progress のままタイムアウト（監視は打ち切り・別途確認）`);
  return { ok: false, runId, conclusion: 'pending' };
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

  // Phase 2: horseHistories push ゲート（--push-horse-histories には confirm 必須）
  if (args.pushHorseHistories && args.confirmPush !== 'keiba-data-shared') {
    console.error('❌ --push-horse-histories には --confirm-push=keiba-data-shared が必要です');
    process.exit(2);
  }
  // Phase 3: featureScores push ゲート（--push-feature-scores には confirm 必須）
  if (args.pushFeatureScores && args.confirmPush !== 'keiba-data-shared') {
    console.error('❌ --push-feature-scores には --confirm-push=keiba-data-shared が必要です');
    process.exit(2);
  }
  // Phase 4: AK/KI import ゲート（confirm 必須 ＋ このpipelineで push 成功したものだけを import）
  if (args.importSites) {
    if (args.confirmImport !== 'ak-ki') {
      console.error('❌ --import-sites には --confirm-import=ak-ki が必要です');
      process.exit(2);
    }
    if (!args.pushHorseHistories || !args.pushFeatureScores || args.confirmPush !== 'keiba-data-shared') {
      console.error('❌ --import-sites には --push-horse-histories と --push-feature-scores（＋--confirm-push=keiba-data-shared）が必要です（push成功したものだけを import する設計）');
      process.exit(2);
    }
  }

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

  // 3.5 horseHistories push（--push-horse-histories 指定時のみ・PR#66 の push-only create-only 経由）
  let hhPushed = false;
  if (args.pushHorseHistories) {
    console.log('\n----- horseHistories shared push（push-only create-only・JRA再fetchなし）-----');
    const okPush = runCommand(HH_CLI, [`--push-only-from=${hhOutDir}`, '--push', '--confirm-push=keiba-data-shared'], 'horseHistories push-only');
    if (!okPush) { console.error('\n❌ horseHistories push 失敗 → 停止（featureScores へ進まない）'); process.exit(1); }
    hhPushed = true;

    // featureScores 生成器は shared local clone の horseHistories を読むため、push後に必ず pull
    console.log('\n----- shared local clone を pull（featureScores が読む horseHistories を最新化）-----');
    const pull = spawnSync('git', ['-C', SHARED_ROOT, 'pull', 'origin', 'main'], { stdio: 'inherit' });
    if (pull.status !== 0) { console.error('\n❌ shared local pull 失敗 → 停止'); process.exit(1); }

    // shared に当該 horseHistories が存在するか確認
    const [yy, mm] = args.date.split('-');
    for (const v of venues) {
      const sp = path.join(SHARED_ROOT, 'jra', 'horseHistories', yy, mm, `${args.date}-${v}.json`);
      console.log(`  shared horseHistories ${v}: ${fs.existsSync(sp) ? '存在 ✓' : '無し ❌'}`);
      if (!fs.existsSync(sp)) { console.error(`\n❌ shared に ${args.date}-${v} horseHistories が無い → 停止`); process.exit(1); }
    }
  }

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

  // 5.5 featureScores push（--push-feature-scores 指定時のみ・create-only は orchestrator が事前GETで担保）
  let fsPushed = false;
  if (args.pushFeatureScores) {
    const fsRunFailNow = fsRun.filter((x) => !x.ok);
    const fsFatalNow = fsRes.filter((r) => !r.ok);
    if (fsRunFailNow.length || fsFatalNow.length) {
      console.error('\n❌ featureScores 生成失敗 or 検査NG があるため push しない → 停止');
      process.exit(1);
    }
    console.log('\n----- featureScores shared push（create-only 事前確認）-----');
    const [yy, mm] = args.date.split('-');
    // create-only: build-feature-scores-once.mjs は専用フラグを持たないため、push前に既存確認
    for (const v of venues) {
      const sp = path.join(SHARED_ROOT, 'jra', 'featureScores', yy, mm, `${args.date}-${v}.json`);
      if (fs.existsSync(sp)) {
        console.error(`❌ shared に featureScores 既存あり（create-only・上書きしません）: ${args.date}-${v} → 停止`);
        process.exit(1);
      }
    }
    for (const v of venues) {
      const ok = runCommand(FS_CLI, ['--category', 'jra', '--date', args.date, '--venue', v, '--source', 'local', '--push', '--confirm-push=keiba-data-shared'], `featureScores push ${v}`);
      if (!ok) { console.error(`\n❌ featureScores push 失敗（${v}）→ 停止`); process.exit(1); }
    }
    fsPushed = true;
    // shared local clone を pull して反映確認
    console.log('\n----- shared local clone を pull（featureScores 反映確認）-----');
    const pull = spawnSync('git', ['-C', SHARED_ROOT, 'pull', 'origin', 'main'], { stdio: 'inherit' });
    if (pull.status !== 0) { console.error('\n❌ shared local pull 失敗 → 停止'); process.exit(1); }
    for (const v of venues) {
      const sp = path.join(SHARED_ROOT, 'jra', 'featureScores', yy, mm, `${args.date}-${v}.json`);
      let recs = '-';
      if (fs.existsSync(sp)) {
        try { const j = JSON.parse(fs.readFileSync(sp, 'utf-8')); recs = Object.keys(j.races || {}).reduce((s, rn) => s + Object.keys(j.races[rn].horses || {}).length, 0); } catch { recs = 'parse失敗'; }
      }
      console.log(`  shared featureScores ${v}: ${fs.existsSync(sp) ? `存在 ✓ records=${recs}` : '無し ❌'}`);
      if (!fs.existsSync(sp)) { console.error(`\n❌ shared に ${args.date}-${v} featureScores が無い → 停止`); process.exit(1); }
    }
  }

  // 5.7 AK/KI import（--import-sites 指定時のみ・workflow_dispatch・repository_dispatch は使わない）
  //     ゲートで push2種＋confirm が保証済み。hh/featureScores とも push 成功している前提。
  let importOk = false;
  if (args.importSites) {
    if (!hhPushed || !fsPushed) {
      console.error('\n❌ import の前提（hh push / featureScores push）が未完 → import しない・停止');
      process.exit(1);
    }
    console.log('\n----- AK/KI import（workflow_dispatch・両repo / hh+featureScores の4本）-----');
    const venuesCsv = venues.join(',');
    const jobs = [];
    for (const repo of IMPORT_TARGETS) jobs.push({ repo, wf: HH_IMPORT_WF, fields: [`date=${args.date}`, `venues=${venuesCsv}`], label: `hh ${repo.split('/')[1]}` });
    for (const repo of IMPORT_TARGETS) jobs.push({ repo, wf: FS_IMPORT_WF, fields: ['category=jra', `date=${args.date}`, `venues=${venuesCsv}`], label: `fs ${repo.split('/')[1]}` });
    const results = [];
    for (const j of jobs) results.push({ ...j, ...dispatchAndWait(j.repo, j.wf, j.fields, j.label) });
    const failed = results.filter((r) => !r.ok);
    console.log('\n  import 結果:');
    for (const r of results) console.log(`    ${r.ok ? '✅' : '❌'} ${r.label}: ${r.conclusion ?? 'NG'}${r.runId ? ` (run ${r.runId})` : ''}`);
    if (failed.length) { console.error(`\n❌ import 失敗/未完: ${failed.length}/${results.length} → 停止（片側成功も隠さず上記に明示）`); process.exit(1); }
    importOk = true;
  }

  // 6. レポート
  console.log('\n========================================');
  console.log('サマリ');
  console.log('========================================');
  const fsFatal = fsRes.filter((r) => !r.ok);
  console.log(`horseHistories: ${hhFatal.length === 0 ? 'OK' : 'NG'}（${venues.length}会場）${hhPushed ? ' / shared push=済(create-only)+local pull済' : ' / shared push=なし(dry-runのみ)'}`);
  console.log(`featureScores : ${fsRunFail.length === 0 && fsFatal.length === 0 ? 'OK' : 'NG/未生成'}（生成失敗=${fsRunFail.length} / 検査NG=${fsFatal.length}）${fsPushed ? ' / shared push=済(create-only)+local pull済' : ' / shared push=なし(dry-runのみ)'}`);
  if (fsRunFail.length) {
    console.log('  ⚠️ featureScores 生成失敗の主因候補: shared local に当該 horseHistories が未存在（Phase1制約）。');
    console.log('     → 先に horseHistories を shared push & local pull する必要あり（Phase 2 で統合）。');
  }
  if (importOk) {
    console.log('\nℹ️  Phase 4: horseHistories + featureScores を shared 保存（create-only）→ AK/KI へ workflow_dispatch import（4本 success）まで完了。本番表示はNetlifyリビルドで反映。');
  } else if (fsPushed) {
    console.log('\nℹ️  Phase 3: horseHistories + featureScores を shared 保存（create-only）+ local pull 済。dispatch / AK・KI import は行いません（Phase 4 で統合予定）。');
  } else if (hhPushed) {
    console.log('\nℹ️  Phase 2: horseHistories のみ shared 保存（create-only）+ local pull 済。featureScores は dry-run のみ（shared PUT なし）。dispatch / AK・KI import は行いません。');
  } else {
    console.log('\nℹ️  Phase 1: dry-run のみ。shared PUT / dispatch / AK・KI import / push 用 token 使用は一切ありません（保存なし）。');
  }

  if (fsRunFail.length || fsFatal.length) process.exit(1);
}

main();
