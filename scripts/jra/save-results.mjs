#!/usr/bin/env node
/**
 * shared形式 JSON (venue単位) を keiba-data-shared にコミット + dispatch。
 *
 * 入力ディレクトリ配下の `{YYYY-MM-DD}-{VENUE}.json` を走査して保存する。
 * 既存 save-results-jra.mjs と同等の GitHub API PUT を行い、
 * 既存ファイルがあれば races[] を raceNumber でマージする。
 *
 * Usage:
 *   GITHUB_TOKEN_KEIBA_DATA_SHARED=... \
 *   node scripts/jra/save-results.mjs --date=2026-04-15 [--in-dir=./tmp/jra-shared] [--dispatch] [--force-overwrite] [--dry-run]
 *
 * Dispatch:
 *   --dispatch を付けた場合のみ netlify/lib/dispatch.mjs 経由で
 *   keiba-intelligence / analytics-keiba へ jra-results-updated を送信。
 */

import fs from 'node:fs';
import path from 'node:path';
import { dispatchToTargets } from '../../netlify/lib/dispatch.mjs';
import { validateShared } from '../../src/lib/jra/validator.mjs';

const OWNER = process.env.GITHUB_REPO_OWNER || 'apol0510';
const REPO = 'keiba-data-shared';
const BRANCH = 'main';

function parseArgs(argv) {
  const args = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
    else if (a.startsWith('--')) args[a.slice(2)] = true;
  }
  return args;
}

async function getExistingFile(filePath, token) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filePath}?ref=${BRANCH}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'jra-cli',
    },
  });
  if (!res.ok) return { sha: null, data: null };
  const j = await res.json();
  const content = Buffer.from(j.content, 'base64').toString('utf-8');
  return { sha: j.sha, data: JSON.parse(content) };
}

function mergeRaces(existing, incoming, forceOverwrite) {
  if (!existing?.races) return incoming;
  const merged = { ...existing, ...incoming };
  if (forceOverwrite) {
    const newMap = new Map(incoming.races.map((r) => [r.raceNumber, r]));
    const races = existing.races.map((r) => (newMap.has(r.raceNumber) ? newMap.get(r.raceNumber) : r));
    for (const r of incoming.races) {
      if (!existing.races.some((er) => er.raceNumber === r.raceNumber)) races.push(r);
    }
    merged.races = races.sort((a, b) => a.raceNumber - b.raceNumber);
  } else {
    const existingNums = new Set(existing.races.map((r) => r.raceNumber));
    const added = incoming.races.filter((r) => !existingNums.has(r.raceNumber));
    merged.races = [...existing.races, ...added].sort((a, b) => a.raceNumber - b.raceNumber);
  }
  return merged;
}

async function putFile(filePath, data, sha, token, meta) {
  const raceNumbers = data.races.map((r) => `${r.raceNumber}R`).join('・');
  const message = `✨ ${meta.date} ${meta.venue} ${raceNumbers} 結果${sha ? '更新' : '追加'}

【JRA 結果データ / JV-Link 経由】
- 開催日: ${meta.date}
- 競馬場: ${meta.venue}（${meta.venueCode}）
- ファイル: ${filePath}

Co-Authored-By: Claude <noreply@anthropic.com>`;

  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filePath}`;
  const body = {
    message,
    content: Buffer.from(JSON.stringify(data, null, 2), 'utf-8').toString('base64'),
    branch: BRANCH,
    ...(sha && { sha }),
  };
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'jra-cli',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub PUT failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = args.date;
  const inDir = args['in-dir'] || './tmp/jra-shared';
  const doDispatch = !!args.dispatch;
  const force = !!args['force-overwrite'];
  const dryRun = !!args['dry-run'];

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('❌ --date=YYYY-MM-DD required');
    process.exit(1);
  }

  const token = process.env.GITHUB_TOKEN_KEIBA_DATA_SHARED || process.env.GITHUB_TOKEN;
  if (!dryRun && !token) {
    console.error('❌ GITHUB_TOKEN_KEIBA_DATA_SHARED env var not set');
    process.exit(1);
  }

  if (!fs.existsSync(inDir)) {
    console.error(`❌ in-dir not found: ${inDir}`);
    process.exit(1);
  }
  const files = fs
    .readdirSync(inDir)
    .filter((f) => f.startsWith(`${date}-`) && f.endsWith('.json'))
    .map((f) => path.join(inDir, f));

  if (files.length === 0) {
    console.error(`❌ no files found in ${inDir} for date=${date}`);
    process.exit(1);
  }

  console.log(`📅 対象日: ${date}`);
  console.log(`🏟  対象venue数: ${files.length}`);
  console.log(`🔄 force-overwrite: ${force}, dry-run: ${dryRun}, dispatch: ${doDispatch}`);

  const [year, month] = date.split('-');
  let savedCount = 0;
  let raceCount = 0;
  const diffs = [];

  for (const localPath of files) {
    const data = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
    const v = validateShared(data);
    if (!v.ok) {
      console.error(`❌ validation failed: ${localPath}`);
      v.errors.forEach((e) => console.error(`   - ${e}`));
      process.exit(1);
    }
    const remotePath = `jra/results/${year}/${month}/${date}-${data.venueCode}.json`;

    if (dryRun) {
      console.log(`🟡 DRY-RUN: would PUT ${remotePath} (${data.races.length}R)`);
      continue;
    }

    const { sha, data: existing } = await getExistingFile(remotePath, token);
    const merged = mergeRaces(existing, data, force);

    if (existing) {
      const beforeR = existing.races?.length ?? 0;
      const afterR = merged.races.length;
      diffs.push(`[${data.venueCode}] races ${beforeR}→${afterR}`);
    } else {
      diffs.push(`[${data.venueCode}] NEW (${data.races.length}R)`);
    }

    const res = await putFile(remotePath, merged, sha, token, {
      date, venue: data.venue, venueCode: data.venueCode,
    });
    savedCount++;
    raceCount += merged.races.length;
    console.log(`✅ saved: ${remotePath} (${merged.races.length}R) commit=${res.commit?.sha?.slice(0, 7)}`);
  }

  console.log(`\n📊 保存件数: ${savedCount} venue / ${raceCount} race`);
  diffs.forEach((d) => console.log(`   · ${d}`));

  if (doDispatch && !dryRun && savedCount > 0) {
    console.log(`\n📡 dispatch: jra-results-updated`);
    const { triggered } = dispatchToTargets('jra-results-updated', { date, source: 'jv-link-cli' });
    console.log(`   → 送信試行: ${triggered.join(', ') || '(なし: tokenなし?)'}`);
    // dispatch は fire-and-forget なので少し待つ
    await new Promise((r) => setTimeout(r, 1500));
  } else if (doDispatch) {
    console.log(`\n⏭  dispatch: skipped (dry-run or 0 saved)`);
  } else {
    console.log(`\n⏭  dispatch: --dispatch 未指定のためスキップ`);
  }
}

main().catch((e) => {
  console.error('❌', e?.stack || e);
  process.exit(1);
});
