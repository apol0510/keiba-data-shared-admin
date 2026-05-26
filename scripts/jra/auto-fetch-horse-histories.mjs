#!/usr/bin/env node
/**
 * auto-fetch-horse-histories.mjs (段階A: tmp出力のみ・dispatchなし)
 *
 * JRA公式 accessU.html (馬詳細ページ) から、その日に出走する全馬の
 * 「出走レース」テーブル＝全競走履歴を取得し horseHistories JSON として保存する。
 *
 * 入力: urls.txt (各場R1のURL、auto-fetch-jra-official.mjs と同じ書式)
 * 出力: tmp/jra-horse-histories/{YYYY-MM-DD}-{VENUE_CODE}.json
 *
 * 既存 auto-fetch-jra-official.mjs は変更しない。本スクリプトは結果ページから
 * 馬リンク (td.horse a) を収集し、accessU.html を辿るだけの責務に絞る。
 *
 * 使い方:
 *   node scripts/jra/auto-fetch-horse-histories.mjs --urls=urls.txt
 *   node scripts/jra/auto-fetch-horse-histories.mjs --urls=urls.txt --venue-code=TOK
 *
 * オプション:
 *   --urls=PATH         R1 URL を行ごとに記述したファイル (必須)
 *   --venue-code=CODE   特定の場 (TOK/KYO/NII/...) のみ処理。省略時は全場
 *   --delay=2500        fetch 間隔 (ms)。デフォルト 2500
 *   --out=PATH          出力ディレクトリ。デフォルト tmp/jra-horse-histories
 *
 * tmp出力のみ。push / dispatch は本スクリプトでは行わない (意図的)。
 * keiba-data-shared への保存や repository_dispatch は別スクリプトに分離する。
 */

import * as cheerio from 'cheerio';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

// ───── 設定 ─────
const DEFAULT_DELAY_MS = 2500;
const FETCH_TIMEOUT_MS = 20000;
const RACES_PER_VENUE = 12;
const DEFAULT_OUT_DIR = 'tmp/jra-horse-histories';

// JRA 場コード → 名称 / 3文字コード (auto-fetch-jra-official.mjs と同一)
const JYO_MAP = {
  '01': { name: '札幌', code: 'SAP' },
  '02': { name: '函館', code: 'HAK' },
  '03': { name: '福島', code: 'FKS' },
  '04': { name: '新潟', code: 'NII' },
  '05': { name: '東京', code: 'TOK' },
  '06': { name: '中山', code: 'NAK' },
  '07': { name: '中京', code: 'CHU' },
  '08': { name: '京都', code: 'KYO' },
  '09': { name: '阪神', code: 'HAN' },
  '10': { name: '小倉', code: 'KOK' },
};

// ───── CLI ─────
function parseArgs(argv) {
  const args = { urls: null, venueCode: null, delay: DEFAULT_DELAY_MS, out: DEFAULT_OUT_DIR };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--urls=')) args.urls = a.slice('--urls='.length);
    else if (a.startsWith('--venue-code=')) args.venueCode = a.slice('--venue-code='.length).toUpperCase();
    else if (a.startsWith('--delay=')) args.delay = parseInt(a.slice('--delay='.length), 10) || DEFAULT_DELAY_MS;
    else if (a.startsWith('--out=')) args.out = a.slice('--out='.length);
  }
  return args;
}

// ───── CNAME パース ─────
const CNAME_SDE_RE = /^pw01sde(\d{2})(\d{2})(\d{4})(\d{2})(\d{2})(\d{2})(\d{8})\/([0-9A-F]{2})$/i;

function extractCname(url) {
  const m = String(url).match(/[?&]CNAME=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function parseSdeCname(cname) {
  const m = cname.match(CNAME_SDE_RE);
  if (!m) return null;
  const [, dateType, jyo, year, kai, nichi, race, raceDate, chk] = m;
  return {
    dateType, jyo, year, kai, nichi,
    race: parseInt(race, 10),
    raceDate,
    chk: parseInt(chk, 16),
  };
}

/**
 * 馬詳細URLの CNAME (pw01dud...) から horseId を取り出す。
 * 例: pw01dud002022103267 → 002022103267
 *     pw01dud002022103267/8A → 002022103267 (CHK除外)
 */
function extractHorseIdFromHref(href) {
  const m = String(href).match(/CNAME=pw01dud([a-z0-9]+)/i);
  if (!m) return null;
  // CHK部分 (/[0-9A-F]{2}) を除外
  return m[1].replace(/\/[0-9A-F]{2}$/i, '');
}

// ───── HTTP fetch (Shift_JIS 対応) ─────
async function fetchHtml(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept-Language': 'ja-JP,ja;q=0.9',
        'Referer': 'https://www.jra.go.jp/',
      },
    });
    if (!res.ok) return { ok: false, status: res.status };
    const buf = Buffer.from(await res.arrayBuffer());
    const head = new TextDecoder('latin1').decode(buf.slice(0, 1024));
    const cs = (head.match(/<meta[^>]*charset=["']?([^"'\s>/]+)/i)?.[1] || 'shift_jis').toLowerCase();
    let html;
    if (/shift[-_]?jis|sjis/.test(cs)) html = new TextDecoder('shift_jis').decode(buf);
    else if (/euc[-_]?jp/.test(cs)) html = new TextDecoder('euc-jp').decode(buf);
    else html = new TextDecoder('utf-8').decode(buf);
    return { ok: true, html };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * R1 ページの HTML から 12R 分の URL を抽出 (auto-fetch-jra-official.mjs と同等)。
 */
function extractVenueRaceUrlsFromR1Page(html, r1) {
  const $ = cheerio.load(html);
  const urls = new Map();
  const linkRe = /^\/JRADB\/accessS\.html\?CNAME=(pw01sde[A-Z0-9]+\/[0-9A-F]{2})$/i;
  $('a[href*="accessS.html?CNAME="]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const m = href.match(linkRe);
    if (!m) return;
    const parsed = parseSdeCname(m[1]);
    if (!parsed) return;
    if (parsed.jyo !== r1.jyo) return;
    if (parsed.kai !== r1.kai) return;
    if (parsed.nichi !== r1.nichi) return;
    if (parsed.raceDate !== r1.raceDate) return;
    if (parsed.race < 1 || parsed.race > 12) return;
    urls.set(parsed.race, `https://www.jra.go.jp${href}`);
  });
  return urls;
}

/**
 * 結果ページ HTML から馬リンクを抽出する。
 * 戻り値: [{ horseId, horseName, href }]
 */
function extractHorsesFromRacePage(html) {
  const $ = cheerio.load(html);
  const horses = [];
  $('td.horse a').each((_, a) => {
    const href = $(a).attr('href') || '';
    const name = $(a).text().trim();
    if (!href.includes('accessU.html')) return;
    const horseId = extractHorseIdFromHref(href);
    if (!horseId) return;
    const fullUrl = href.startsWith('http') ? href : `https://www.jra.go.jp${href}`;
    horses.push({ horseId, horseName: name, href: fullUrl });
  });
  return horses;
}

/**
 * 馬詳細ページ HTML をパースして history を抽出。
 * 出力: { horseId, horseName, sourceUrl, totalRuns, history: [...] }
 */
function parseHorseDetail(html, sourceUrl, horseIdHint, horseNameHint) {
  const $ = cheerio.load(html);

  const horseId = horseIdHint || extractHorseIdFromHref(sourceUrl);

  // 馬詳細ページ自身から馬名を試行 (title 等)
  let horseName = horseNameHint || null;
  if (!horseName) {
    const titleText = $('title').text().trim();
    // "競走馬情報 ＜馬名＞ JRA" のような形式が想定されるが、安定しないため hint 優先
    const m = titleText.match(/競走馬情報\s*[\|｜]?\s*([^\s|｜]+)/);
    if (m) horseName = m[1];
  }

  // 「出走レース」 caption を持つテーブルを特定
  let raceTable = null;
  $('table').each((_, t) => {
    const caption = $(t).find('caption').text().trim();
    if (/出走レース/.test(caption)) {
      raceTable = t;
      return false;
    }
  });

  const history = [];
  if (raceTable) {
    $(raceTable).find('tbody tr').each((_, tr) => {
      const cells = $(tr).find('td');
      if (cells.length < 12) return;

      // 列順: 年月日, 場, レース名, 距離, 馬場, 頭数, 人気, 着順, 騎手名, 負担重量, 馬体重, タイム, Rt, 1着馬(2着馬)
      const dateText = $(cells[0]).text().trim();
      const dateMatch = dateText.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
      const date = dateMatch
        ? `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[3]).padStart(2, '0')}`
        : null;
      const venue = $(cells[1]).text().trim();
      const raceName = $(cells[2]).text().trim();
      const distance = $(cells[3]).text().trim();
      const distMatch = distance.match(/^(芝|ダ|障)(\d+)/);
      const surface = distMatch ? distMatch[1] : null;
      const distanceMeters = distMatch ? parseInt(distMatch[2], 10) : null;
      const trackCondition = $(cells[4]).text().trim();
      const entryCount = parseInt($(cells[5]).text().trim(), 10);
      const popularity = parseInt($(cells[6]).text().trim(), 10);
      const finish = $(cells[7]).text().trim();
      const jockey = $(cells[8]).text().trim();
      const carryWeight = $(cells[9]).text().trim();
      const bodyWeight = $(cells[10]).text().trim();
      const time = $(cells[11]).text().trim();
      const winnerName = cells.length >= 14 ? $(cells[13]).text().trim() : null;

      history.push({
        date,
        venue: venue || null,
        raceName: raceName || null,
        surface,
        distanceMeters,
        displayDistance: distance || null,
        trackCondition: trackCondition || null,
        entryCount: Number.isFinite(entryCount) ? entryCount : null,
        popularity: Number.isFinite(popularity) ? popularity : null,
        finish: finish || null,
        jockey: jockey || null,
        carryWeight: carryWeight || null,
        bodyWeight: bodyWeight || null,
        time: time || null,
        winnerName: winnerName || null,
        source: 'jra-official',
      });
    });
  }

  // 日付降順 (新→旧)
  history.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return {
    horseId,
    horseName,
    sourceUrl,
    totalRuns: history.length,
    recent5: history.slice(0, 5),
    history,
  };
}

// ───── 1場処理 ─────
async function processVenue(r1, delayMs) {
  const venueName = JYO_MAP[r1.jyo]?.name || `不明(${r1.jyo})`;
  const venueCode = JYO_MAP[r1.jyo]?.code || r1.jyo;
  const date = `${r1.raceDate.slice(0, 4)}-${r1.raceDate.slice(4, 6)}-${r1.raceDate.slice(6, 8)}`;

  console.log(`━━ ${venueName} (${venueCode}) ${date} ━━`);

  // R1 fetch
  const r1Url = `https://www.jra.go.jp/JRADB/accessS.html?CNAME=pw01sde${r1.dateType}${r1.jyo}${r1.year}${r1.kai}${r1.nichi}01${r1.raceDate}/${r1.chk.toString(16).toUpperCase().padStart(2, '0')}`;
  const r1Fetch = await fetchHtml(r1Url);
  if (!r1Fetch.ok) {
    console.error(`  ❌ R1 fetch failed HTTP ${r1Fetch.status}`);
    return null;
  }
  const r1Html = r1Fetch.html;
  const venueRaceUrls = extractVenueRaceUrlsFromR1Page(r1Html, r1);
  console.log(`  📋 R1ページから ${venueRaceUrls.size} レース分の URL 抽出`);

  // 各レース結果ページから馬リンク収集 (重複排除)
  const horseMap = new Map(); // horseId -> { horseId, horseName, href }
  let racesFetched = 0;
  let racesSucceeded = 0;
  for (let raceNum = 1; raceNum <= RACES_PER_VENUE; raceNum++) {
    const url = venueRaceUrls.get(raceNum);
    if (!url) {
      console.warn(`  ⏭  ${raceNum}R URL なし`);
      continue;
    }
    try {
      let html;
      if (raceNum === 1) {
        html = r1Html;
      } else {
        await sleep(delayMs);
        const fr = await fetchHtml(url);
        racesFetched++;
        if (!fr.ok) {
          console.warn(`  ⚠️  ${raceNum}R HTTP ${fr.status}`);
          continue;
        }
        html = fr.html;
      }
      const horses = extractHorsesFromRacePage(html);
      let added = 0;
      for (const h of horses) {
        if (!horseMap.has(h.horseId)) {
          horseMap.set(h.horseId, h);
          added++;
        }
      }
      racesSucceeded++;
      console.log(`  ✓ ${raceNum}R: ${horses.length} 頭 (新規 ${added})`);
    } catch (e) {
      console.error(`  ❌ ${raceNum}R parse error: ${e.message}`);
    }
  }
  console.log(`  🐎 ユニーク馬数: ${horseMap.size} (12R fetch ${racesSucceeded + 1}/12 成功)`);

  // 各馬詳細を fetch
  const horseResults = [];
  const failures = [];
  const allHorses = [...horseMap.values()];
  for (let i = 0; i < allHorses.length; i++) {
    const { horseId, horseName, href } = allHorses[i];
    await sleep(delayMs);
    let result;
    try {
      const fr = await fetchHtml(href);
      if (!fr.ok) {
        failures.push({ horseId, horseName, reason: `HTTP ${fr.status}` });
        console.warn(`  ⚠️  [${i + 1}/${allHorses.length}] ${horseName} (${horseId}) HTTP ${fr.status}`);
        continue;
      }
      result = parseHorseDetail(fr.html, href, horseId, horseName);
    } catch (e) {
      failures.push({ horseId, horseName, reason: e.message });
      console.error(`  ❌ [${i + 1}/${allHorses.length}] ${horseName} (${horseId}) ${e.message}`);
      continue;
    }
    horseResults.push(result);
    if ((i + 1) % 20 === 0 || i + 1 === allHorses.length) {
      console.log(`  📥 馬詳細 ${i + 1}/${allHorses.length} (累計 ${horseResults.length} 成功 / ${failures.length} 失敗)`);
    }
  }

  return {
    venueName,
    venueCode,
    date,
    r1Url,
    horseCount: horseMap.size,
    horseResults,
    failures,
    racesFetched: racesSucceeded + 1, // R1 を含む
  };
}

// ───── レポート ─────
function reportVenue(venueData) {
  const { venueName, venueCode, date, horseResults, failures, horseCount } = venueData;
  const withHistory = horseResults.filter((h) => h.totalRuns >= 1);
  const withFive = horseResults.filter((h) => h.totalRuns >= 5);
  const withDisplayDistance = horseResults.flatMap((h) => h.history).filter((r) => r.displayDistance && r.displayDistance.length > 0).length;
  const venueSingle = horseResults.flatMap((h) => h.history).filter((r) => r.venue && !/[\/／]/.test(r.venue)).length;
  const timeOk = horseResults.flatMap((h) => h.history).filter((r) => r.time && /^\d{1,2}[:.]\d{1,2}\.\d$/.test(r.time)).length;
  const totalHistoryRecords = horseResults.reduce((s, h) => s + h.totalRuns, 0);
  const maxRuns = horseResults.reduce((m, h) => Math.max(m, h.totalRuns), 0);
  const avgRuns = horseResults.length ? (totalHistoryRecords / horseResults.length).toFixed(2) : 0;

  console.log('');
  console.log(`━━━ レポート: ${venueName}(${venueCode}) ${date} ━━━`);
  console.log(`  ユニーク馬数:           ${horseCount}`);
  console.log(`  馬詳細fetch成功:        ${horseResults.length}`);
  console.log(`  history>=1件:           ${withHistory.length}`);
  console.log(`  history>=5件:           ${withFive.length}`);
  console.log(`  history件数 max/avg:    ${maxRuns} / ${avgRuns}`);
  console.log(`  全履歴レコード数:        ${totalHistoryRecords}`);
  console.log(`  displayDistance 有効:   ${withDisplayDistance} / ${totalHistoryRecords}`);
  console.log(`  venue 単一形式:          ${venueSingle} / ${totalHistoryRecords}`);
  console.log(`  time 正規形式:           ${timeOk} / ${totalHistoryRecords}`);
  console.log(`  失敗:                    ${failures.length}`);
  failures.slice(0, 5).forEach((f) => {
    console.log(`    - ${f.horseName} (${f.horseId}): ${f.reason}`);
  });

  // 代表サンプル3頭 (history件数が多い順)
  console.log('');
  console.log('  代表サンプル3頭 (履歴件数上位):');
  const top3 = [...horseResults].sort((a, b) => b.totalRuns - a.totalRuns).slice(0, 3);
  top3.forEach((h) => {
    console.log(`    🐎 ${h.horseName} (${h.horseId}) totalRuns=${h.totalRuns}`);
    h.recent5.slice(0, 5).forEach((r, idx) => {
      console.log(`       [${idx + 1}] ${r.date} ${r.venue} ${r.raceName} ${r.displayDistance} ${r.finish}着 ${r.time} ${r.jockey}`);
    });
  });
}

// ───── main ─────
async function main() {
  const args = parseArgs(process.argv);
  if (!args.urls) {
    console.error('Usage: node scripts/jra/auto-fetch-horse-histories.mjs --urls=urls.txt [--venue-code=TOK] [--delay=2500] [--out=PATH]');
    process.exit(2);
  }
  if (!fs.existsSync(args.urls)) {
    console.error(`❌ urls file not found: ${args.urls}`);
    process.exit(2);
  }

  const lines = fs.readFileSync(args.urls, 'utf-8')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'));
  if (lines.length === 0) {
    console.error('❌ urls.txt に有効URLなし');
    process.exit(2);
  }

  const venueR1s = [];
  for (const line of lines) {
    const cname = extractCname(line);
    if (!cname) {
      console.warn(`  ⚠️  CNAME 抽出失敗: ${line}`);
      continue;
    }
    const parsed = parseSdeCname(cname);
    if (!parsed) {
      console.warn(`  ⚠️  CNAME パターン不一致: ${cname}`);
      continue;
    }
    if (parsed.race !== 1) {
      console.warn(`  ⚠️  R${parsed.race} URL を渡されました。R1のみ受付。jyo=${parsed.jyo}`);
      continue;
    }
    const vc = JYO_MAP[parsed.jyo]?.code;
    if (args.venueCode && vc !== args.venueCode) {
      console.log(`  ⏭  ${vc} スキップ (--venue-code=${args.venueCode} 指定)`);
      continue;
    }
    venueR1s.push(parsed);
  }
  if (venueR1s.length === 0) {
    console.error('❌ 有効な R1 URL が無し');
    process.exit(2);
  }

  console.log(`📥 対象場: ${venueR1s.map(r => `${JYO_MAP[r.jyo]?.name}(${JYO_MAP[r.jyo]?.code})`).join(', ')}`);
  console.log(`⏱  fetch間隔: ${args.delay}ms`);
  console.log('');

  const startedAt = Date.now();
  const outDir = args.out;
  fs.mkdirSync(outDir, { recursive: true });

  const summaries = [];
  for (const r1 of venueR1s) {
    const venueData = await processVenue(r1, args.delay);
    if (!venueData) continue;

    // JSON 出力
    const horsesObj = {};
    for (const h of venueData.horseResults) {
      if (h.horseId) horsesObj[h.horseId] = h;
    }
    const outJson = {
      source: 'jra-official',
      generatedAt: new Date().toISOString(),
      date: venueData.date,
      venue: venueData.venueName,
      venueCode: venueData.venueCode,
      sourceR1Url: venueData.r1Url,
      stats: {
        uniqueHorses: venueData.horseCount,
        fetched: venueData.horseResults.length,
        failed: venueData.failures.length,
      },
      horses: horsesObj,
      failures: venueData.failures,
    };
    const fname = `${venueData.date}-${venueData.venueCode}.json`;
    const fpath = path.join(outDir, fname);
    fs.writeFileSync(fpath, JSON.stringify(outJson, null, 2), 'utf-8');
    console.log('');
    console.log(`💾 saved: ${fpath}`);

    reportVenue(venueData);
    summaries.push({ venueData, fpath });
  }

  const elapsedMs = Date.now() - startedAt;
  const totalHorses = summaries.reduce((s, x) => s + x.venueData.horseResults.length, 0);
  const totalFails = summaries.reduce((s, x) => s + x.venueData.failures.length, 0);
  const totalRaces = summaries.reduce((s, x) => s + x.venueData.racesFetched, 0);
  const totalRequests = totalRaces + summaries.reduce((s, x) => s + x.venueData.horseResults.length + x.venueData.failures.length, 0);

  console.log('');
  console.log('━━━━━━ 全体サマリ ━━━━━━');
  console.log(`  処理場数:       ${summaries.length}`);
  console.log(`  馬詳細fetch成功: ${totalHorses}`);
  console.log(`  失敗:            ${totalFails}`);
  console.log(`  推定リクエスト数: ${totalRequests} (結果ページ + 馬詳細)`);
  console.log(`  所要時間:        ${(elapsedMs / 1000).toFixed(1)}s`);
  console.log('');
  console.log('ℹ️  tmp出力のみ。push / dispatch は本スクリプトでは行わない。');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
