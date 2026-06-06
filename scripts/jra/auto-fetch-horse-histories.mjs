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
 *   GITHUB_TOKEN_KEIBA_DATA_SHARED=ghp_xxx \
 *     node scripts/jra/auto-fetch-horse-histories.mjs --urls=urls.txt \
 *       --push --confirm-push=keiba-data-shared
 *   GITHUB_TOKEN_KEIBA_DATA_SHARED=ghp_xxx \
 *   KEIBA_INTELLIGENCE_TOKEN=ghp_xxx \
 *   ANALYTICS_KEIBA_TOKEN=ghp_xxx \
 *     node scripts/jra/auto-fetch-horse-histories.mjs --urls=urls.txt \
 *       --push --confirm-push=keiba-data-shared \
 *       --dispatch --confirm-dispatch=horse-histories-updated
 *
 * オプション:
 *   --urls=PATH                              R1 URL を行ごとに記述したファイル (必須)
 *   --venue-code=CODE                        特定の場のみ処理。省略時は全場
 *   --delay=2500                             fetch 間隔 (ms)。デフォルト 2500
 *   --out=PATH                               出力ディレクトリ。デフォルト tmp/jra-horse-histories
 *   --push                                   keiba-data-shared への書き込みフラグ
 *   --confirm-push=keiba-data-shared         二段階確認。--push と同時指定が必須
 *   --dispatch                               repository_dispatch 送信フラグ
 *   --confirm-dispatch=horse-histories-updated  二段階確認。--dispatch と同時指定が必須
 *
 * --push 保存先:     jra/horseHistories/YYYY/MM/YYYY-MM-DD-{VENUE_CODE}.json
 * --dispatch event:  horse-histories-updated
 * --dispatch 送信先: apol0510/keiba-intelligence + apol0510/analytics-keiba
 *
 * 安全装置:
 *   1. --push / --dispatch 単独では絶対に実行しない (各々 confirm 必須)
 *   2. token は専用 env のみ受け付ける (GITHUB_TOKEN フォールバックなし)
 *        - --push     : GITHUB_TOKEN_KEIBA_DATA_SHARED
 *        - --dispatch : KEIBA_INTELLIGENCE_TOKEN + ANALYTICS_KEIBA_TOKEN (両方必須)
 *   3. confirm / token チェックは fetch 開始前に実施
 *   4. --dispatch を指定するなら --push も必須 (未保存ファイルへの dispatch は
 *      受信側で 404 になるため、論理的不整合を物理的に禁止)
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
const CONFIRM_PUSH_REQUIRED = 'keiba-data-shared';
const CONFIRM_DISPATCH_REQUIRED = 'horse-histories-updated';
const DISPATCH_EVENT_TYPE = 'horse-histories-updated';
const DISPATCH_TARGET_REPOS = [
  'apol0510/keiba-intelligence',
  'apol0510/analytics-keiba',
];

function parseArgs(argv) {
  const args = {
    urls: null,
    venueCode: null,
    delay: DEFAULT_DELAY_MS,
    out: DEFAULT_OUT_DIR,
    push: false,
    confirmPush: null,
    dispatch: false,
    confirmDispatch: null,
    pushOnlyFrom: null, // 救済: JRA公式fetchせず既存tmp dirから create PUT のみ
  };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--urls=')) args.urls = a.slice('--urls='.length);
    else if (a.startsWith('--venue-code=')) args.venueCode = a.slice('--venue-code='.length).toUpperCase();
    else if (a.startsWith('--delay=')) args.delay = parseInt(a.slice('--delay='.length), 10) || DEFAULT_DELAY_MS;
    else if (a.startsWith('--out=')) args.out = a.slice('--out='.length);
    else if (a === '--push') args.push = true;
    else if (a.startsWith('--confirm-push=')) args.confirmPush = a.slice('--confirm-push='.length);
    else if (a === '--dispatch') args.dispatch = true;
    else if (a.startsWith('--confirm-dispatch=')) args.confirmDispatch = a.slice('--confirm-dispatch='.length);
    else if (a.startsWith('--push-only-from=')) args.pushOnlyFrom = a.slice('--push-only-from='.length);
  }
  return args;
}

// ───── CNAME パース ─────
// pw01sde (accessS.html 系) と pw01dde (accessD.html 系) の両方を受理する。
// kind フィールドで 'sde' / 'dde' を区別し、後段の URL 再構築・リンク抽出で分岐する。
const CNAME_RE = /^pw01(sde|dde)(\d{2})(\d{2})(\d{4})(\d{2})(\d{2})(\d{2})(\d{8})\/([0-9A-F]{2})$/i;

function extractCname(url) {
  const m = String(url).match(/[?&]CNAME=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function parseCname(cname) {
  const m = cname.match(CNAME_RE);
  if (!m) return null;
  const [, kindRaw, dateType, jyo, year, kai, nichi, race, raceDate, chk] = m;
  return {
    kind: kindRaw.toLowerCase(), // 'sde' | 'dde'
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
  // accessS / accessD どちらのリンクも拾い、parseCname 後に r1.kind と一致するものだけ採用する。
  // accessD ページ内には他週ナビ等で別 kind のリンクが混在するため、kind 一致フィルタで巻き込みを防ぐ。
  const linkRe = /^\/JRADB\/access[SD]\.html\?CNAME=(pw01(?:sde|dde)[A-Z0-9]+\/[0-9A-F]{2})$/i;
  $('a[href*="accessS.html?CNAME="],a[href*="accessD.html?CNAME="]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const m = href.match(linkRe);
    if (!m) return;
    const parsed = parseCname(m[1]);
    if (!parsed) return;
    if (parsed.kind !== r1.kind) return;
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
  // kind ('sde'|'dde') に応じて accessS / accessD を切り替える
  const accessHtml = r1.kind === 'dde' ? 'accessD.html' : 'accessS.html';
  const cnamePrefix = `pw01${r1.kind}`;
  const r1Url = `https://www.jra.go.jp/JRADB/${accessHtml}?CNAME=${cnamePrefix}${r1.dateType}${r1.jyo}${r1.year}${r1.kai}${r1.nichi}01${r1.raceDate}/${r1.chk.toString(16).toUpperCase().padStart(2, '0')}`;
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

// ───── token preflight（PUT前に shared token の有効性を確認。token値は出さない）─────
async function preflightKeibaDataSharedToken(token) {
  const headers = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'jra-horse-histories' };
  const userRes = await fetch('https://api.github.com/user', { headers });
  console.log(`[preflight] /user => ${userRes.status}`);
  if (userRes.status !== 200) throw new Error(`token preflight 失敗: /user => HTTP ${userRes.status}（401/403はtoken無効/権限不足。token値は表示しません）`);
  const cRes = await fetch('https://api.github.com/repos/apol0510/keiba-data-shared/contents/jra', { headers });
  console.log(`[preflight] contents/jra => ${cRes.status}`);
  if (cRes.status !== 200) throw new Error(`token preflight 失敗: contents/jra => HTTP ${cRes.status}`);
}

// ───── push-only: 既存tmp dir から outJson 群を読み込み・検証（fetchしない）─────
function loadPushOnlyHorseHistoriesFromDir(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`--push-only-from のディレクトリが存在しません: ${dir}`);
  }
  const FNAME_RE = /^(\d{4}-\d{2}-\d{2})-([A-Z]+)\.json$/;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && FNAME_RE.test(f)).sort();
  if (files.length === 0) throw new Error(`対象 JSON（YYYY-MM-DD-VENUE.json）が無い: ${dir}`);
  const summaries = [];
  for (const fname of files) {
    const m = fname.match(FNAME_RE);
    const fnameDate = m[1], fnameVenue = m[2];
    const fpath = path.join(dir, fname);
    let outJson;
    try { outJson = JSON.parse(fs.readFileSync(fpath, 'utf-8')); }
    catch (e) { throw new Error(`JSON parse 失敗: ${fpath} (${e.message})`); }
    if (!outJson.date || !outJson.venueCode) throw new Error(`date/venueCode 欠落: ${fpath}`);
    if (outJson.date !== fnameDate || outJson.venueCode !== fnameVenue) {
      throw new Error(`ファイル名と内容の不一致: ${fname} vs date=${outJson.date} venueCode=${outJson.venueCode}`);
    }
    if (!outJson.horses || typeof outJson.horses !== 'object' || Array.isArray(outJson.horses)) {
      throw new Error(`horses オブジェクト不正: ${fpath}`);
    }
    if (Object.keys(outJson.horses).length === 0) throw new Error(`horses 空: ${fpath}`);
    summaries.push({ fpath, outJson });
  }
  return summaries;
}

// ───── push-only モード本体（JRA公式fetchを一切しない・create-only）─────
async function runPushOnly(args) {
  // ゲート: --push / --confirm-push 必須
  if (!args.push || args.confirmPush !== CONFIRM_PUSH_REQUIRED) {
    console.error('❌ --push-only-from には「--push --confirm-push=keiba-data-shared」が必須');
    process.exit(3);
  }
  const token = process.env.GITHUB_TOKEN_KEIBA_DATA_SHARED;
  if (!token) {
    console.error('❌ GITHUB_TOKEN_KEIBA_DATA_SHARED が未設定（GITHUB_TOKEN フォールバックは不可）');
    process.exit(3);
  }
  // dispatch は push-only では拡張しない（受信側 404/誤発火防止のため非対応）
  if (args.dispatch) {
    console.error('❌ --push-only-from と --dispatch の同時指定は非対応（push-only は救済PUT専用）');
    process.exit(3);
  }

  console.log(`📦 push-only モード: ${args.pushOnlyFrom}（JRA公式fetchは行いません・create-only）`);
  const summaries = loadPushOnlyHorseHistoriesFromDir(args.pushOnlyFrom);
  console.log(`📄 読込: ${summaries.map((s) => `${s.outJson.date}-${s.outJson.venueCode}(${Object.keys(s.outJson.horses).length}頭)`).join(', ')}`);

  // PUT 前 token preflight（今回の401を事前検知）
  await preflightKeibaDataSharedToken(token);

  console.log('');
  console.log('📤 keiba-data-shared に create-only PUT 中...');
  let pushed = 0;
  for (const { outJson } of summaries) {
    try {
      const r = await pushHorseHistoriesToKeibaDataShared(outJson, token, { createOnly: true });
      console.log(`✅ ${outJson.venue}(${outJson.venueCode}): ${r.action} (horses=${r.horseCount})`);
      pushed++;
    } catch (e) {
      console.error(`❌ ${outJson.venue}(${outJson.venueCode}): ${e.message}`);
    }
    await sleep(1500);
  }
  console.log('');
  console.log(`━━━ push-only 完了: ${pushed}/${summaries.length} venue ━━━`);
  console.log('ℹ️  dispatch は送信しません（push-only は救済PUT専用）。必要なら別途 import workflow を実行。');
  if (pushed !== summaries.length) process.exit(2);
}

// ───── main ─────
async function main() {
  const args = parseArgs(process.argv);

  // push-only 救済モード: JRA公式fetちせず既存tmpから create PUT のみ（--urls 不要）
  if (args.pushOnlyFrom) {
    await runPushOnly(args);
    return;
  }

  if (!args.urls) {
    console.error('Usage: node scripts/jra/auto-fetch-horse-histories.mjs --urls=urls.txt [--venue-code=TOK] [--delay=2500] [--out=PATH]');
    console.error('  push:     --push --confirm-push=keiba-data-shared (要 GITHUB_TOKEN_KEIBA_DATA_SHARED)');
    console.error('  dispatch: --dispatch --confirm-dispatch=horse-histories-updated');
    console.error('            (要 KEIBA_INTELLIGENCE_TOKEN + ANALYTICS_KEIBA_TOKEN, かつ --push 必須)');
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
    const parsed = parseCname(cname);
    if (!parsed) {
      console.warn(`  ⚠️  CNAME パターン不一致 (sde/dde どちらにも一致しない): ${cname}`);
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

  // --push / --dispatch 指定なら fetch 開始前に二段階確認と token をチェック
  // (9分 fetch が完了してから落ちる UX を防ぐ + 誤実行を物理的に防ぐ)
  if (args.push) {
    if (args.confirmPush !== CONFIRM_PUSH_REQUIRED) {
      console.error('❌ --push 指定だが --confirm-push=keiba-data-shared が未指定 (or 値不一致)');
      console.error(`   実pushには「--push --confirm-push=keiba-data-shared」が必要 (二段階確認)`);
      console.error(`   指定された値: ${JSON.stringify(args.confirmPush)}`);
      process.exit(3);
    }
    // GITHUB_TOKEN フォールバックは禁止 (専用 token のみ)
    const token = process.env.GITHUB_TOKEN_KEIBA_DATA_SHARED;
    if (!token) {
      console.error('❌ --push 指定だが GITHUB_TOKEN_KEIBA_DATA_SHARED が未設定');
      console.error('   GITHUB_TOKEN へのフォールバックは安全上の理由で削除しました');
      console.error('   実pushには「GITHUB_TOKEN_KEIBA_DATA_SHARED=ghp_xxx」が必須');
      process.exit(3);
    }
  }

  if (args.dispatch) {
    // --dispatch には --push が必須 (未保存ファイルへの dispatch は受信側 404)
    if (!args.push) {
      console.error('❌ --dispatch 指定だが --push が未指定');
      console.error('   --dispatch は --push と同時指定が必須 (未保存ファイルへの dispatch は受信側 404 になる)');
      process.exit(3);
    }
    if (args.confirmDispatch !== CONFIRM_DISPATCH_REQUIRED) {
      console.error('❌ --dispatch 指定だが --confirm-dispatch=horse-histories-updated が未指定 (or 値不一致)');
      console.error(`   実dispatchには「--dispatch --confirm-dispatch=horse-histories-updated」が必要 (二段階確認)`);
      console.error(`   指定された値: ${JSON.stringify(args.confirmDispatch)}`);
      process.exit(3);
    }
    // GITHUB_TOKEN フォールバックは禁止 (専用 token のみ・両方必須)
    const intelligenceToken = process.env.KEIBA_INTELLIGENCE_TOKEN;
    const analyticsToken = process.env.ANALYTICS_KEIBA_TOKEN;
    if (!intelligenceToken || !analyticsToken) {
      console.error('❌ --dispatch 指定だが dispatch 用 token が不足');
      console.error(`   KEIBA_INTELLIGENCE_TOKEN: ${intelligenceToken ? 'OK' : 'MISSING'}`);
      console.error(`   ANALYTICS_KEIBA_TOKEN:    ${analyticsToken ? 'OK' : 'MISSING'}`);
      console.error('   両方必須。GITHUB_TOKEN へのフォールバックは安全上の理由で削除しました');
      process.exit(3);
    }
  }

  console.log(`📥 対象場: ${venueR1s.map(r => `${JYO_MAP[r.jyo]?.name}(${JYO_MAP[r.jyo]?.code})`).join(', ')}`);
  console.log(`⏱  fetch間隔: ${args.delay}ms`);
  console.log(`📤 push:         ${args.push ? `YES (keiba-data-shared, confirm=${args.confirmPush})` : 'NO (tmp出力のみ)'}`);
  console.log(`📡 dispatch:     ${args.dispatch ? `YES (event=${DISPATCH_EVENT_TYPE}, targets=${DISPATCH_TARGET_REPOS.join(', ')})` : 'NO'}`);
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
    summaries.push({ venueData, fpath, outJson });
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
  // ── --push 指定時のみ keiba-data-shared に PUT ──
  // (confirm-push + token チェックは fetch 開始前に実施済み)
  if (!args.push) {
    console.log('');
    console.log('ℹ️  tmp出力のみ。');
    console.log('   実push には「--push --confirm-push=keiba-data-shared」が必要。');
    console.log('   実dispatch には「--push --confirm-push=keiba-data-shared --dispatch --confirm-dispatch=horse-histories-updated」が必要。');
    return;
  }

  const token = process.env.GITHUB_TOKEN_KEIBA_DATA_SHARED;
  console.log('');
  // PUT 前 token preflight（SETだが無効な token を fetch後・PUT前に検知。有効なら挙動不変）
  await preflightKeibaDataSharedToken(token);
  console.log('📤 keiba-data-shared に PUT 中...');
  let pushedCount = 0;
  for (const { outJson } of summaries) {
    try {
      const r = await pushHorseHistoriesToKeibaDataShared(outJson, token);
      console.log(`✅ ${outJson.venue}(${outJson.venueCode}): saved (${r.action}, horses=${Object.keys(outJson.horses).length})`);
      pushedCount++;
    } catch (e) {
      console.error(`❌ ${outJson.venue}(${outJson.venueCode}): ${e.message}`);
    }
    await sleep(1500); // GitHub API rate limit 配慮
  }

  console.log('');
  console.log(`━━━ push 完了: ${pushedCount}/${summaries.length} venue ━━━`);

  // ── --dispatch 指定時のみ repository_dispatch 送信 ──
  // (confirm-dispatch + token + --push 同時指定 チェックは fetch 開始前に実施済み)
  if (!args.dispatch) {
    console.log('ℹ️  dispatch (repository_dispatch) は送信しない。');
    console.log('   送信するには「--dispatch --confirm-dispatch=horse-histories-updated」を追加');
    return;
  }

  if (pushedCount === 0) {
    console.error('❌ push が 0 件のため dispatch をスキップ (受信側 404 防止)');
    process.exit(4);
  }

  // payload 構築
  const date = summaries[0]?.outJson?.date;
  const venues = summaries.map((s) => s.outJson.venueCode);
  const paths = summaries.map((s) => {
    const [year, month] = s.outJson.date.split('-');
    return `jra/horseHistories/${year}/${month}/${s.outJson.date}-${s.outJson.venueCode}.json`;
  });
  const payload = {
    category: 'jra',
    kind: 'horseHistories',
    date,
    dates: [date],
    venues,
    paths,
    source: 'jra-official',
  };

  console.log('');
  console.log('━━━ dispatch 送信予定 ━━━');
  console.log(`  event_type: ${DISPATCH_EVENT_TYPE}`);
  console.log(`  targets:`);
  DISPATCH_TARGET_REPOS.forEach((r) => console.log(`    - ${r}`));
  console.log(`  payload:`);
  console.log(JSON.stringify(payload, null, 2).split('\n').map((l) => `    ${l}`).join('\n'));
  console.log('');
  console.log('📡 dispatch 送信中...');

  const tokens = {
    'apol0510/keiba-intelligence': process.env.KEIBA_INTELLIGENCE_TOKEN,
    'apol0510/analytics-keiba': process.env.ANALYTICS_KEIBA_TOKEN,
  };
  let dispatched = 0;
  for (const repo of DISPATCH_TARGET_REPOS) {
    try {
      await sendRepositoryDispatch(repo, DISPATCH_EVENT_TYPE, payload, tokens[repo]);
      console.log(`✅ dispatched: ${repo}`);
      dispatched++;
    } catch (e) {
      console.error(`❌ dispatch failed: ${repo}: ${e.message}`);
    }
    await sleep(500);
  }

  console.log('');
  console.log(`━━━ dispatch 完了: ${dispatched}/${DISPATCH_TARGET_REPOS.length} repo ━━━`);
}

/**
 * GitHub API で repository_dispatch を送信する。
 *
 * 注意: 既存 netlify/lib/dispatch.mjs は使わない。
 *   - 既存モジュールには GITHUB_TOKEN_KEIBA_DATA_SHARED フォールバックが入っており、
 *     本スクリプトの「専用 token のみ」方針に反するため。
 *   - 既存モジュールを変更すると既存 dispatch (prediction-updated 等) に影響するため、
 *     本スクリプト内に最小実装を内製する。
 */
async function sendRepositoryDispatch(repo, eventType, payload, token) {
  if (!token) {
    throw new Error(`token missing for ${repo}`);
  }
  const url = `https://api.github.com/repos/${repo}/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'jra-horse-histories',
    },
    body: JSON.stringify({
      event_type: eventType,
      client_payload: payload,
    }),
  });
  // 成功は 204 No Content
  if (res.status === 204) return { ok: true };
  if (res.ok) return { ok: true };
  const text = await res.text().catch(() => '');
  throw new Error(`HTTP ${res.status} ${text}`);
}

/**
 * keiba-data-shared に horseHistories JSON を GitHub Contents API で PUT。
 * 保存先: jra/horseHistories/YYYY/MM/YYYY-MM-DD-{VENUE_CODE}.json
 *
 * merge ルール:
 *   - 既存ファイルがある場合は horses{} を horseId 単位でマージ
 *     (incoming に同 horseId があれば incoming で上書き、なければ既存を維持)
 *   - source / generatedAt / date / venue / venueCode / sourceR1Url / stats /
 *     failures は incoming で上書き
 *   - failures は今回 venue 分のみを保持 (履歴蓄積ではないので意図通り)
 */
async function pushHorseHistoriesToKeibaDataShared(outJson, token, opts = {}) {
  const createOnly = opts.createOnly === true;
  const OWNER = process.env.GITHUB_REPO_OWNER || 'apol0510';
  const REPO = 'keiba-data-shared';
  const BRANCH = 'main';
  const { date, venue, venueCode } = outJson;
  if (!date || !venueCode) {
    throw new Error(`date or venueCode missing: date=${date} venueCode=${venueCode}`);
  }
  const [year, month] = date.split('-');
  const filePath = `jra/horseHistories/${year}/${month}/${date}-${venueCode}.json`;

  // 既存ファイル取得 (SHA + content)
  const getUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filePath}?ref=${BRANCH}`;
  let sha = null;
  let existing = null;
  const getRes = await fetch(getUrl, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'jra-horse-histories',
    },
  });
  if (getRes.ok) {
    const j = await getRes.json();
    sha = j.sha;
    try {
      existing = JSON.parse(Buffer.from(j.content, 'base64').toString('utf-8'));
    } catch {
      existing = null;
    }
  } else if (getRes.status !== 404) {
    const text = await getRes.text().catch(() => '');
    throw new Error(`GET failed: HTTP ${getRes.status} ${text}`);
  }

  // create-only: 既存ありなら停止（push-only救済での誤上書き/merge防止）
  if (createOnly && sha) {
    throw new Error(`remote already exists (create-only, 上書きしません): ${filePath}`);
  }

  // horses{} を horseId 単位でマージ
  const mergedHorses = { ...(existing?.horses || {}) };
  for (const [hid, h] of Object.entries(outJson.horses || {})) {
    mergedHorses[hid] = h;
  }
  const merged = {
    ...outJson,
    horses: mergedHorses,
  };

  const action = sha ? 'updated' : 'created';
  const horseCount = Object.keys(mergedHorses).length;
  const message = `🐎 ${date} ${venue} 馬別出走履歴${sha ? '更新' : '追加'} (${horseCount}頭)

【JRA horseHistories / JRA公式 auto-fetch】
- 開催日: ${date}
- 競馬場: ${venue}（${venueCode}）
- ファイル: ${filePath}
- 馬数: ${horseCount}

Co-Authored-By: Claude <noreply@anthropic.com>`;

  const putUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filePath}`;
  const putRes = await fetch(putUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'jra-horse-histories',
    },
    body: JSON.stringify({
      message,
      content: Buffer.from(JSON.stringify(merged, null, 2), 'utf-8').toString('base64'),
      branch: BRANCH,
      ...(sha && { sha }),
    }),
  });
  if (!putRes.ok) {
    const text = await putRes.text().catch(() => '');
    throw new Error(`PUT failed: HTTP ${putRes.status} ${text}`);
  }
  return { action, horseCount };
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
