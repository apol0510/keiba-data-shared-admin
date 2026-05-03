#!/usr/bin/env node
/**
 * scrape-live-results.mjs
 *
 * 【Phase 1.5】netkeiba.com からJRAレース結果を速報スクレイピング (race_list 動的取得)
 *
 * 用途:
 *   レース当日中に着順速報を取得し、analytics-keiba / keiba-intelligence で
 *   即時表示するための速報データを生成。確定データ (rank/payout 完備) は
 *   翌日以降に JV-Link 経由で別途取得し上書きする二段構成の前段。
 *
 * フロー:
 *   1. race_list_sub.html?kaisai_date=YYYYMMDD から当日の全 race_id を取得
 *   2. race_id を venue (jyo コード) ごとに grouping
 *   3. 各 race_id の result.html を取得して 1〜3着の馬番を抽出
 *   4. tmp/jra-live/YYYY-MM-DD.json に出力
 *
 * race_id 形式 (netkeiba):
 *   YYYYJJKKHHRR = 西暦(4) + 場コード(2) + 開催回(2) + 日次(2) + レース番号(2)
 *
 * Usage:
 *   node scripts/jra/scrape-live-results.mjs --date=2026-05-02
 *
 * Output:
 *   tmp/jra-live/YYYY-MM-DD.json
 */

import * as cheerio from 'cheerio';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { dispatchToTargets } from '../../netlify/lib/dispatch.mjs';

// ───────────────────────────────────────────────────────────
// JYO コード (JRA場コード) → 短コード対応表
// race_id の jyo 部分 (3-4文字目) から venue を逆引きするのに使用
// ───────────────────────────────────────────────────────────
const JYO_TO_VENUE = {
  '01': { code: 'SAP', name: '札幌' },
  '02': { code: 'HAK', name: '函館' },
  '03': { code: 'FUK', name: '福島' },
  '04': { code: 'NII', name: '新潟' },
  '05': { code: 'TOK', name: '東京' },
  '06': { code: 'NAK', name: '中山' },
  '07': { code: 'CHU', name: '中京' },
  '08': { code: 'KYO', name: '京都' },
  '09': { code: 'HAN', name: '阪神' },
  '10': { code: 'KOK', name: '小倉' },
};

const FETCH_DELAY_MS = 600; // 礼儀正しい間隔 (1秒未満で連続だと弾かれることがある)
const FETCH_TIMEOUT_MS = 10000;

// ───── CLI ─────
function parseArgs(argv) {
  const args = { date: null, dispatch: false, dryRun: false };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--date=')) args.date = a.slice('--date='.length);
    else if (a === '--dispatch') args.dispatch = true;
    else if (a === '--dry-run') args.dryRun = true;
  }
  return args;
}

// ───── keiba-data-shared への保存 ─────
const GITHUB_OWNER = process.env.GITHUB_REPO_OWNER || 'apol0510';
const GITHUB_REPO = 'keiba-data-shared';
const GITHUB_BRANCH = 'main';

/**
 * keiba-data-shared に live-results JSON を PUT で保存。
 * 既存ファイルがあれば上書き（live は常に最新が正義）。
 */
async function pushLiveResultsToShared(date, jsonText) {
  const token = process.env.GITHUB_TOKEN_KEIBA_DATA_SHARED || process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN_KEIBA_DATA_SHARED または GITHUB_TOKEN 環境変数が未設定');
  }
  const year = date.slice(0, 4);
  const month = date.slice(5, 7);
  const filePath = `jra/live-results/${year}/${month}/${date}.json`;

  // 既存 SHA 取得（あれば上書き、なければ新規）
  const getUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}`;
  let sha = null;
  const getRes = await fetch(getUrl, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'keiba-live-cli',
    },
  });
  if (getRes.ok) {
    const j = await getRes.json();
    sha = j.sha;
  }

  const message = `📡 ${date} JRA速報結果 ${sha ? '更新' : '追加'}

【live-results】
- 開催日: ${date}
- ファイル: ${filePath}
- ソース: netkeiba
- 注意: 速報データ。確定データは jra/results/ に別途保存される

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>`;

  const putUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;
  const body = {
    message,
    content: Buffer.from(jsonText, 'utf-8').toString('base64'),
    branch: GITHUB_BRANCH,
    ...(sha && { sha }),
  };
  const putRes = await fetch(putUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'keiba-live-cli',
    },
    body: JSON.stringify(body),
  });
  if (!putRes.ok) {
    const text = await putRes.text().catch(() => '');
    throw new Error(`GitHub PUT failed: ${putRes.status} ${text}`);
  }
  const result = await putRes.json();
  return { filePath, commitUrl: result.commit?.html_url, commitSha: result.commit?.sha };
}

function pad2(n) { return String(n).padStart(2, '0'); }

/**
 * race_id (12桁) を分解する。
 * YYYY + JJ + KK + HH + RR
 */
function parseRaceId(raceId) {
  if (!/^\d{12}$/.test(raceId)) return null;
  return {
    raceId,
    year:    raceId.slice(0, 4),
    jyo:     raceId.slice(4, 6),
    kai:     raceId.slice(6, 8),
    nichi:   raceId.slice(8, 10),
    raceNum: parseInt(raceId.slice(10, 12), 10),
  };
}

/**
 * netkeiba の race_list_sub.html から当日の race_id 一覧を取得。
 * 取得失敗 / 0件の場合は null を返す。
 */
async function fetchRaceListIds(yyyymmdd) {
  const url = `https://race.netkeiba.com/top/race_list_sub.html?kaisai_date=${yyyymmdd}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept-Language': 'ja-JP,ja;q=0.9',
      },
    });
    if (!res.ok) {
      console.error(`❌ race_list_sub fetch failed: HTTP ${res.status} url=${url}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    // EUC-JP想定だが asciiの race_id 抽出のみなので latin1 で読んでも安全
    const html = new TextDecoder('latin1').decode(buf);
    const matches = html.match(/race_id=(\d{12})/g) || [];
    const ids = [...new Set(matches.map((m) => m.replace('race_id=', '')))].sort();
    return ids;
  } finally {
    clearTimeout(timer);
  }
}

// ───── HTTP ─────
async function fetchRaceHtml(raceId) {
  const url = `https://race.netkeiba.com/race/result.html?race_id=${raceId}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept-Language': 'ja-JP,ja;q=0.9',
      },
    });
    if (!res.ok) return { ok: false, status: res.status };
    // netkeiba は EUC-JP。Content-Type を信用せず HTML の <meta charset> から判定する。
    const buf = Buffer.from(await res.arrayBuffer());
    const head = new TextDecoder('latin1').decode(buf.slice(0, 2048));
    const cs = head.match(/<meta[^>]*charset=["']?([^"'\s>/]+)/i);
    const charset = (cs ? cs[1] : (res.headers.get('content-type') || 'utf-8')).toLowerCase();
    let html;
    if (/euc[-_]?jp/.test(charset)) {
      html = new TextDecoder('euc-jp').decode(buf);
    } else if (/shift[-_]?jis|sjis/.test(charset)) {
      html = new TextDecoder('shift_jis').decode(buf);
    } else {
      html = new TextDecoder('utf-8').decode(buf);
    }
    return { ok: true, html };
  } finally {
    clearTimeout(timer);
  }
}

// ───── HTML parse ─────
// netkeiba の現行 result.html 構造 (2026 確認):
//   <table id="All_Result_Table" class="RaceTable01 RaceCommon_Table ResultRefund ...">
//     <tbody>
//       <tr class="HorseList">
//         <td class="Result_Num"><div class="Rank">1</div></td>   ← 着順
//         <td class="Num Waku1"><div>1</div></td>                 ← 枠番
//         <td class="Num Txt_C"><div>1</div></td>                 ← 馬番
//
// 払戻テーブル (Payout_Detail_Table) には 馬単行 <tr class="Umatan">:
//   <td class="Result"><ul><li><span>5</span></li><li><span>11</span></li>...</ul></td>
//   <td class="Payout"><span>460円</span></td>
function parseResults(html) {
  const $ = cheerio.load(html);
  const $table = $('#All_Result_Table').first();
  if ($table.length === 0) return { results: null, umatan: null, reason: 'table-not-found' };

  const $rows = $table.find('tbody tr.HorseList');
  if ($rows.length === 0) return { results: null, umatan: null, reason: 'rows-empty' };

  const results = [];
  $rows.each((_idx, el) => {
    if (results.length >= 3) return false;
    const $row = $(el);
    const rankText = $row.find('td.Result_Num .Rank').first().text().trim();
    const rankNum = parseInt(rankText, 10);
    if (!Number.isFinite(rankNum) || rankNum < 1 || rankNum > 3) return;
    const umabanText = $row.find('td.Num.Txt_C').first().text().trim();
    const umaban = parseInt(umabanText, 10);
    if (!Number.isFinite(umaban)) return;
    results.push({ position: rankNum, number: umaban });
  });

  if (results.length === 0) return { results: null, umatan: null, reason: 'no-valid-rows' };
  results.sort((a, b) => a.position - b.position);

  // 馬単払戻
  let umatan = null;
  const $uma = $('tr.Umatan').first();
  if ($uma.length > 0) {
    const nums = $uma.find('td.Result li span').map((_i, e) => parseInt($(e).text().trim(), 10)).get().filter(Number.isFinite);
    const payText = $uma.find('td.Payout span').first().text().trim();
    const payNum = parseInt(payText.replace(/[^0-9]/g, ''), 10);
    if (nums.length >= 2 && Number.isFinite(payNum) && payNum > 0) {
      umatan = {
        combination: `${nums[0]}-${nums[1]}`,
        payout: payNum,
      };
    }
  }

  return { results, umatan, reason: null };
}

// ───── main ─────
async function main() {
  const args = parseArgs(process.argv);
  if (!args.date || !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    console.error('Usage: node scripts/jra/scrape-live-results.mjs --date=YYYY-MM-DD');
    process.exit(2);
  }
  const yyyymmdd = args.date.replace(/-/g, '');

  console.log(`📅 取得対象: ${args.date}`);

  // ── Step 1: race_list_sub から race_id 一覧を動的取得 ──
  console.log(`🔎 race_list_sub.html?kaisai_date=${yyyymmdd} から race_id を取得中...`);
  const raceIds = await fetchRaceListIds(yyyymmdd);
  if (raceIds === null) {
    console.error(`❌ race_list 取得失敗 → abort`);
    process.exit(3);
  }
  if (raceIds.length === 0) {
    console.error(`❌ race_id 0件 (${args.date} は開催なし or netkeiba 未公開) → abort`);
    process.exit(3);
  }
  console.log(`✅ race_id 取得: ${raceIds.length}件`);

  // ── Step 2: venue ごとに grouping ──
  const byVenue = new Map(); // jyo -> raceIds[]
  for (const id of raceIds) {
    const p = parseRaceId(id);
    if (!p) continue;
    if (!byVenue.has(p.jyo)) byVenue.set(p.jyo, []);
    byVenue.get(p.jyo).push(p);
  }
  for (const [jyo, races] of byVenue) {
    races.sort((a, b) => a.raceNum - b.raceNum);
    const v = JYO_TO_VENUE[jyo];
    console.log(`  - ${v ? v.name : '不明'}(jyo=${jyo}): ${races.length}R kai=${races[0].kai} nichi=${races[0].nichi}`);
  }
  console.log('');

  // ── Step 3: 各 race_id の result.html を取得・パース ──
  const venuesOut = [];
  let okCount = 0, ngCount = 0, skipCount = 0;

  for (const [jyo, races] of byVenue) {
    const venue = JYO_TO_VENUE[jyo] || { code: `JYO${jyo}`, name: `不明(${jyo})` };
    console.log(`━━ ${venue.name} (jyo=${jyo}) ━━`);
    const racesOut = [];
    for (const p of races) {
      try {
        const fr = await fetchRaceHtml(p.raceId);
        if (!fr.ok) {
          console.warn(`  ⚠️  ${venue.name} ${p.raceNum}R race_id=${p.raceId} HTTP ${fr.status} → skip`);
          ngCount++;
        } else {
          const { results, umatan, reason } = parseResults(fr.html);
          if (!results) {
            console.warn(`  ⏭  ${venue.name} ${p.raceNum}R race_id=${p.raceId} 未確定 (${reason}) → skip`);
            skipCount++;
          } else {
            const raceOut = { raceNumber: p.raceNum, results };
            if (umatan) raceOut.umatan = umatan;
            racesOut.push(raceOut);
            const tops = results.map((x) => `${x.position}着=${x.number}`).join(' ');
            const umaStr = umatan ? ` 馬単${umatan.combination} ¥${umatan.payout.toLocaleString()}` : '';
            console.log(`  ✓ ${venue.name} ${p.raceNum}R: ${tops}${umaStr}`);
            okCount++;
          }
        }
      } catch (e) {
        console.error(`  ❌ ${venue.name} ${p.raceNum}R race_id=${p.raceId} fetch error: ${e.message}`);
        ngCount++;
      }
      await sleep(FETCH_DELAY_MS);
    }
    if (racesOut.length > 0) {
      venuesOut.push({
        venueCode: venue.code,
        venueName: venue.name,
        races: racesOut,
      });
    }
    console.log('');
  }

  // ── Step 4: 出力 ──
  const output = {
    date: args.date,
    live: true,
    fetchedAt: new Date().toISOString(),
    source: 'netkeiba',
    venues: venuesOut,
  };

  const outDir = path.join('tmp', 'jra-live');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${args.date}.json`);
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');

  console.log('━━━ 結果サマリ ━━━');
  console.log(`  取得成功: ${okCount}R / ${raceIds.length}R`);
  console.log(`  HTTPエラー: ${ngCount}R`);
  console.log(`  未確定/skip: ${skipCount}R`);
  console.log(`  venues with data: ${venuesOut.length}/${byVenue.size}`);
  console.log(`💾 tmp出力: ${outPath}`);

  // ── Step 5: --dispatch 指定時のみ keiba-data-shared に push + dispatch ──
  if (!args.dispatch) {
    console.log('');
    console.log('ℹ️  --dispatch 未指定のため tmp出力のみで終了 (保存・通知なし)');
    return;
  }
  if (okCount === 0) {
    console.log('');
    console.log('⚠️  取得成功 0R のため push/dispatch をスキップ');
    return;
  }

  console.log('');
  if (args.dryRun) {
    console.log(`🟡 DRY-RUN: would push ${outPath} → keiba-data-shared/jra/live-results/...`);
    console.log(`🟡 DRY-RUN: would dispatch jra-live-results-updated to keiba-intelligence + analytics-keiba`);
    return;
  }

  console.log(`📤 keiba-data-shared に push 中...`);
  let putResult;
  try {
    putResult = await pushLiveResultsToShared(args.date, JSON.stringify(output, null, 2));
    console.log(`✅ saved: ${putResult.filePath}`);
    if (putResult.commitUrl) console.log(`   commit: ${putResult.commitUrl}`);
  } catch (e) {
    console.error(`❌ keiba-data-shared push 失敗: ${e.message}`);
    process.exit(4);
  }

  console.log(`📡 dispatch jra-live-results-updated 送信中...`);
  try {
    const result = await dispatchToTargets('jra-live-results-updated', {
      date: args.date,
      type: 'jra-live-results',
      source: 'netkeiba-scrape',
      racesAvailable: okCount,
      racesTotal: raceIds.length,
    });
    const triggered = Array.isArray(result?.triggered) ? result.triggered : [];
    if (triggered.length === 0) {
      console.warn(`⚠️  dispatch 送信先 0件 (token未設定?)`);
    } else {
      console.log(`✅ dispatch success: ${triggered.join(', ')}`);
    }
    const failed = (result?.results || []).filter((r) => !r.ok && !r.skipped);
    if (failed.length > 0) {
      console.warn(`⚠️  一部 dispatch 失敗: ${failed.map((r) => `${r.repo}=${r.error}`).join(', ')}`);
    }
  } catch (e) {
    console.error(`❌ dispatch エラー: ${e.message}`);
    // dispatch 失敗でもファイル保存は成功しているので exit 0 のまま
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
