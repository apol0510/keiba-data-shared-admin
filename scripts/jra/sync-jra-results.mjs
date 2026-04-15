#!/usr/bin/env node
/**
 * 一気通貫: 中間JSON → transform → save (+dispatch)
 *
 * Usage:
 *   GITHUB_TOKEN_KEIBA_DATA_SHARED=... \
 *   node scripts/jra/sync-jra-results.mjs --in=./tmp/sample.json [--dispatch] [--force-overwrite] [--dry-run]
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
    else if (a.startsWith('--')) args[a.slice(2)] = true;
  }
  return args;
}

/**
 * 指定ディレクトリ配下の .json だけを安全に削除する。
 * - 存在しなければ no-op
 * - 相対パスを絶対化して「親ディレクトリ外」への誤削除を防ぐ
 * - サブディレクトリは触らない（想定外ファイルの巻き添え削除防止）
 */
function cleanDir(dir) {
  const abs = path.resolve(dir);
  const cwd = path.resolve(process.cwd());
  if (!abs.startsWith(cwd + path.sep) && abs !== cwd) {
    throw new Error(`refuse to clean dir outside cwd: ${abs}`);
  }
  if (!fs.existsSync(abs)) {
    console.log(`🧹 ${dir}: 存在しないためクリーンアップスキップ`);
    return;
  }
  let removed = 0;
  for (const name of fs.readdirSync(abs)) {
    if (!name.endsWith('.json')) continue;
    const p = path.join(abs, name);
    const st = fs.statSync(p);
    if (st.isFile()) {
      fs.unlinkSync(p);
      removed++;
    }
  }
  console.log(`🧹 ${dir} をクリーンアップ (削除: ${removed} ファイル)`);
}

function run(cmd, args) {
  console.log(`\n$ ${cmd} ${args.join(' ')}\n`);
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const inPath = args.in;
  if (!inPath) {
    console.error('❌ --in=<intermediate.json> required');
    process.exit(1);
  }
  const day = JSON.parse(fs.readFileSync(inPath, 'utf-8'));
  const date = day.date;
  if (!date) {
    console.error('❌ intermediate.date missing');
    process.exit(1);
  }
  const outDir = args['out-dir'] || './tmp/jra-shared';
  const doClean = args['no-clean'] !== true;

  // 0) clean out-dir (デフォルト有効。--no-clean で無効化)
  if (doClean) cleanDir(outDir);

  // 1) transform
  run('node', ['scripts/jra/transform-results.mjs', `--in=${inPath}`, `--out-dir=${outDir}`]);

  // 2) save (+ optional dispatch)
  const saveArgs = [
    'scripts/jra/save-results.mjs',
    `--date=${date}`,
    `--in-dir=${outDir}`,
  ];
  if (args.dispatch) saveArgs.push('--dispatch');
  if (args['force-overwrite']) saveArgs.push('--force-overwrite');
  if (args['dry-run']) saveArgs.push('--dry-run');
  run('node', saveArgs);

  console.log('\n🎉 sync:jra-results 完了');
}

main();
