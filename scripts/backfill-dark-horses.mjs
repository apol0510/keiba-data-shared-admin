#!/usr/bin/env node

/**
 * backfill-dark-horses.mjs
 *
 * keiba-data-shared 配下の既存 computer JSON に darkHorses が無い場合、
 * 共通モジュール（_shared/dark-horse.mjs）を使って後付けで生成・上書き保存する。
 *
 * - admin の /admin/computer-manager 改修より前に保存された JSON を最新仕様に揃える目的
 * - 同一カテゴリ・日付・会場の racebook が取得できれば pastRaces も補完
 * - すでに darkHorses 入りの JSON はスキップ（--force で上書き可）
 *
 * 使い方:
 *   node scripts/backfill-dark-horses.mjs                     # 全JSON対象（未生成のみ）
 *   node scripts/backfill-dark-horses.mjs --category jra      # JRAのみ
 *   node scripts/backfill-dark-horses.mjs --force             # 既存 darkHorses も再生成
 *   node scripts/backfill-dark-horses.mjs --dry-run           # 書き込まずに件数だけ表示
 *
 * 実行は keiba-data-shared をローカルに clone した状態で行う。
 * 書き込み先: /Users/apolon/Projects/keiba-data-shared/{jra,nankan}/predictions/computer/...
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'fs/promises';
import { applyDarkHorsesToComputerData, fetchRacebookData } from '../netlify/functions/_shared/dark-horse.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ローカルの keiba-data-shared パス（環境に応じて変えても良いように env 上書き許容）
const SHARED_DIR = process.env.KEIBA_DATA_SHARED_DIR
  || '/Users/user/Projects/keiba-data-shared';

const args = process.argv.slice(2);
const opts = { category: null, force: false, dryRun: false, date: null, dateFrom: null };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--category' && args[i + 1]) { opts.category = args[i + 1]; i++; }
  else if (args[i] === '--force') opts.force = true;
  else if (args[i] === '--dry-run') opts.dryRun = true;
  else if (args[i] === '--date' && args[i + 1]) { opts.date = args[i + 1]; i++; }
  else if (args[i] === '--date-from' && args[i + 1]) { opts.dateFrom = args[i + 1]; i++; }
}

async function findFiles() {
  const categories = opts.category ? [opts.category] : ['jra', 'nankan'];
  const files = [];
  for (const cat of categories) {
    const pattern = join(SHARED_DIR, cat, 'predictions/computer/**/*.json');
    for await (const fp of glob(pattern)) {
      // ファイル名から日付抽出: YYYY-MM-DD-XXX.json
      const m = fp.match(/(\d{4}-\d{2}-\d{2})-[A-Z]+\.json$/);
      const fileDate = m ? m[1] : null;
      if (opts.date && fileDate !== opts.date) continue;
      if (opts.dateFrom && fileDate && fileDate < opts.dateFrom) continue;
      files.push({ category: cat, path: fp, date: fileDate });
    }
  }
  return files;
}

async function processOne({ category, path }) {
  let data;
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { path, status: 'parse-error', error: e.message };
  }

  if (!Array.isArray(data.races) || data.races.length === 0) {
    return { path, status: 'no-races' };
  }

  const hasDarkHorses = data.races.some(r => Array.isArray(r.darkHorses) && r.darkHorses.length > 0);
  if (hasDarkHorses && !opts.force) {
    return { path, status: 'skip-already' };
  }

  const racebook = await fetchRacebookData(data.date, category, data.venueCode);
  const result = applyDarkHorsesToComputerData(data, racebook);
  const total = result.races.reduce((s, r) => s + (r.darkHorses?.length || 0), 0);

  if (!opts.dryRun) {
    writeFileSync(path, JSON.stringify(result, null, 2) + '\n');
  }
  return { path, status: 'ok', total };
}

async function main() {
  console.log(`🔍 検索中: ${SHARED_DIR}/{${opts.category || 'jra,nankan'}}/predictions/computer/`);
  const files = await findFiles();
  console.log(`📁 対象ファイル: ${files.length}件`);

  const summary = { ok: 0, skip: 0, error: 0, totalDarkHorses: 0 };
  for (const f of files) {
    const r = await processOne(f);
    if (r.status === 'ok') {
      summary.ok++;
      summary.totalDarkHorses += r.total;
      console.log(`✅ ${f.category}/${r.path.split('/').slice(-3).join('/')} (${r.total}件)`);
    } else if (r.status === 'skip-already') {
      summary.skip++;
    } else {
      summary.error++;
      console.warn(`⚠️ ${r.path}: ${r.status}${r.error ? ' / ' + r.error : ''}`);
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ 更新: ${summary.ok}件 / 既存スキップ: ${summary.skip}件 / エラー: ${summary.error}件`);
  console.log(`✅ 抽出 darkHorses 合計: ${summary.totalDarkHorses}頭`);
  console.log(`${opts.dryRun ? '【dry-run】書き込みは行いませんでした' : '✅ 書き込み完了'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
