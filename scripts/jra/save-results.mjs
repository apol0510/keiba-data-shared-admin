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
 *   # ファイルは触らず dispatch だけ再送信したい場合（保存成功後に dispatch 失敗した時の復旧用）
 *   node scripts/jra/save-results.mjs --date=2026-04-26 --dispatch-only
 *
 * Dispatch:
 *   --dispatch を付けた場合のみ netlify/lib/dispatch.mjs 経由で
 *   keiba-intelligence / analytics-keiba へ jra-results-updated を送信。
 *   --dispatch-only の場合はファイル走査・保存を完全にスキップして dispatch のみ実行。
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

/**
 * 値が「実質的に空」かを判定する（field-level merge で incoming を採用するか決めるのに使う）
 *   - null / undefined / "" → 空
 *   - 空配列 [] → 空
 *   - 空オブジェクト {} → 空
 *   - その他は非空
 */
function isEmptyValue(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}

/**
 * race オブジェクト同士を field-level に enrichment マージ。
 *   - incoming に非空の値があれば incoming を採用（古いfallback値を新しい正規値で上書きできる）
 *   - incoming が空なら existing を維持（incoming が一部フィールドを欠いていても既存データは失われない）
 * これにより raceConditionName のような「あとから追加された fields」が
 * 既存レースに非破壊的に追加される。
 */
function enrichRaceFields(existing, incoming) {
  const merged = { ...existing };
  for (const [k, v] of Object.entries(incoming)) {
    if (!isEmptyValue(v)) merged[k] = v;
  }
  return merged;
}

function mergeRaces(existing, incoming, forceOverwrite) {
  if (!existing?.races) return incoming;
  const merged = { ...existing, ...incoming };
  if (forceOverwrite) {
    // 完全上書き: incoming の race オブジェクトをそのまま採用、existingのみのraceは保持
    const newMap = new Map(incoming.races.map((r) => [r.raceNumber, r]));
    const races = existing.races.map((r) => (newMap.has(r.raceNumber) ? newMap.get(r.raceNumber) : r));
    for (const r of incoming.races) {
      if (!existing.races.some((er) => er.raceNumber === r.raceNumber)) races.push(r);
    }
    merged.races = races.sort((a, b) => a.raceNumber - b.raceNumber);
  } else {
    // デフォルト: 同一raceNumberはfield-level enrichment（incomingの非空値が wins、空なら既存維持）
    // raceConditionName 等のあとから追加されたフィールドが非破壊的に取り込まれる。
    const incomingMap = new Map(incoming.races.map((r) => [r.raceNumber, r]));
    const races = existing.races.map((r) => {
      const inc = incomingMap.get(r.raceNumber);
      return inc ? enrichRaceFields(r, inc) : r;
    });
    // 既存にないraceNumberは追加
    for (const r of incoming.races) {
      if (!existing.races.some((er) => er.raceNumber === r.raceNumber)) races.push(r);
    }
    merged.races = races.sort((a, b) => a.raceNumber - b.raceNumber);
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
  const dispatchOnly = !!args['dispatch-only'];

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('❌ --date=YYYY-MM-DD required');
    process.exit(1);
  }

  // --dispatch-only: ファイル走査・保存を完全スキップして dispatch のみ実行
  // 保存成功後に dispatch 側だけ失敗した場合の復旧経路（保存済みデータには触れない）
  if (dispatchOnly) {
    console.log(`📅 対象日: ${date} (dispatch-only mode)`);
    if (dryRun) {
      console.log(`🟡 DRY-RUN: would dispatch jra-results-updated for date=${date}`);
      return;
    }
    console.log(`📡 dispatch: jra-results-updated`);
    const result = (await dispatchToTargets('jra-results-updated', {
      date,
      source: 'jv-link-cli',
      mode: 'redispatch',
    })) ?? {};
    const triggered = Array.isArray(result.triggered) ? result.triggered : [];
    const dispatchResults = Array.isArray(result.results) ? result.results : [];
    console.log(`   → 送信試行: ${triggered.join(', ') || '(なし: tokenなし?)'}`);
    for (const r of dispatchResults) {
      const tag = r.ok ? '✅' : r.skipped ? '⏭' : '❌';
      console.log(`   ${tag} ${r.repo}${r.status ? ` (HTTP ${r.status})` : ''}${r.error ? ` ${r.error}` : ''}`);
    }
    return;
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
    const venueCodes = files
      .map((p) => path.basename(p).match(/-([A-Z]{3})\.json$/)?.[1])
      .filter(Boolean);
    const result = (await dispatchToTargets('jra-results-updated', {
      date,
      source: 'jv-link-cli',
      venueCodes,
    })) ?? {};
    const triggered = Array.isArray(result.triggered) ? result.triggered : [];
    const dispatchResults = Array.isArray(result.results) ? result.results : [];
    console.log(`   → 送信試行: ${triggered.join(', ') || '(なし: tokenなし?)'}`);
    for (const r of dispatchResults) {
      const tag = r.ok ? '✅' : r.skipped ? '⏭' : '❌';
      console.log(`   ${tag} ${r.repo}${r.status ? ` (HTTP ${r.status})` : ''}${r.error ? ` ${r.error}` : ''}`);
    }
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
