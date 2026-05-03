#!/usr/bin/env node
/**
 * auto-fetch-jra-official.mjs
 *
 * JRA 公式 (jra.go.jp) 結果ページから当日の36レース分の結果＋払戻を
 * 自動取得して keiba-data-shared/jra/results/ に保存・dispatch するスクリプト。
 *
 * 公式が一次データソースなので ToS リスク最小。netkeiba 等の3rd partyは使わない。
 *
 * 使い方:
 *   1. JRA公式で 各場の 1R 結果ページを開き URL をコピーして urls.txt に貼る (3行)
 *   2. node scripts/jra/auto-fetch-jra-official.mjs --urls=urls.txt --date=2026-05-03
 *   3. オプション --dispatch を付けると keiba-data-shared に push + 両 repo に dispatch
 *
 * URL/CNAME 構造:
 *   https://www.jra.go.jp/JRADB/accessS.html?CNAME=pw01sde{DDJJ}{YYYY}{KK}{NN}{RR}{YYYYMMDD}/{CHK}
 *   - DD: date type (2桁・推定: 01=今日 / 10=昨日)
 *   - JJ: 場コード (05=東京 08=京都 04=新潟 06=中山 09=阪神 等)
 *   - KK/NN: 開催回・日次
 *   - RR: レース番号 (01-12)
 *   - CHK: 16進2桁チェックサム。R1 から R(N) で **-75 (-0x4B)** ずつ減る (mod 256)
 *
 * accessS.html 1ページに 結果テーブル + ハロン + コーナー + 払戻金 が全部含まれるため
 * 1レース1fetchで完結。
 */

import * as cheerio from 'cheerio';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { dispatchToTargets } from '../../netlify/lib/dispatch.mjs';

// ───── 設定 ─────
const FETCH_DELAY_MS = 2500; // 礼儀正しい間隔 (公式サイトに負担をかけない)
const FETCH_TIMEOUT_MS = 15000;
const RACES_PER_VENUE = 12;

// JRA 場コード → 名称 / 3文字コード
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
  const args = { urls: null, date: null, dispatch: false, dryRun: false, out: null };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--urls=')) args.urls = a.slice('--urls='.length);
    else if (a.startsWith('--date=')) args.date = a.slice('--date='.length);
    else if (a.startsWith('--out=')) args.out = a.slice('--out='.length);
    else if (a === '--dispatch') args.dispatch = true;
    else if (a === '--dry-run') args.dryRun = true;
  }
  return args;
}

// ───── CNAME パース・生成 ─────
const CNAME_RE = /^pw01sde(\d{2})(\d{2})(\d{4})(\d{2})(\d{2})(\d{2})(\d{8})\/([0-9A-F]{2})$/i;

function extractCname(url) {
  const m = String(url).match(/[?&]CNAME=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function parseCname(cname) {
  const m = cname.match(CNAME_RE);
  if (!m) return null;
  const [, dateType, jyo, year, kai, nichi, race, raceDate, chk] = m;
  return {
    dateType, jyo, year, kai, nichi,
    race: parseInt(race, 10),
    raceDate, // YYYYMMDD
    chk: parseInt(chk, 16),
  };
}

/**
 * R1 ページの HTML から 12R 分の URL を抽出。
 * 同一場 (jyo + kai + nichi) かつ同一日付 (raceDate) の race 01..12 のみ取得。
 *
 * CHK の算出式は単純な -75 ではない (R9→R10 で破綻) ため、
 * ページ自身がリンクとして列挙している URL を信用する。
 */
function extractVenueRaceUrlsFromR1Page(html, r1) {
  const $ = cheerio.load(html);
  const urls = new Map(); // raceNum -> url
  const linkRe = /^\/JRADB\/accessS\.html\?CNAME=(pw01sde[A-Z0-9]+\/[0-9A-F]{2})$/i;
  $('a[href*="accessS.html?CNAME="]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const m = href.match(linkRe);
    if (!m) return;
    const cname = m[1];
    const parsed = parseCname(cname);
    if (!parsed) return;
    // 同一場・同一日の URL のみ採用
    if (parsed.jyo !== r1.jyo) return;
    if (parsed.kai !== r1.kai) return;
    if (parsed.nichi !== r1.nichi) return;
    if (parsed.raceDate !== r1.raceDate) return;
    if (parsed.race < 1 || parsed.race > 12) return;
    urls.set(parsed.race, `https://www.jra.go.jp${href}`);
  });
  return urls;
}

function buildUrl(cname) {
  return `https://www.jra.go.jp/JRADB/accessS.html?CNAME=${cname}`;
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
      },
    });
    if (!res.ok) return { ok: false, status: res.status };
    const buf = Buffer.from(await res.arrayBuffer());
    // <meta charset="..."> から判定 (JRA は Shift_JIS)
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

// ───── HTML パーサ ─────
function parseRacePage(html, parsedCname) {
  const $ = cheerio.load(html);

  // ── レース基本情報 ──
  const dateText = $('.date_line .cell.date').first().text().trim(); // "2026年5月2日（土曜） 2回東京3日"
  const dateMatch = dateText.match(/(\d{4})年(\d{1,2})月(\d{1,2})日.+?\d+回(\S+?)(\d+)日/);
  const date = dateMatch
    ? `${dateMatch[1]}-${String(dateMatch[2]).padStart(2,'0')}-${String(dateMatch[3]).padStart(2,'0')}`
    : null;
  const venueName = dateMatch?.[4] || JYO_MAP[parsedCname.jyo]?.name || null;
  const venueCode = JYO_MAP[parsedCname.jyo]?.code || null;

  // ── レース番号・名・条件 ──
  const raceNumber = parsedCname.race;
  const raceName = $('.race_title .race_name').first().text().trim();
  const raceCategory = $('.race_title .cell.category').first().text().trim(); // "3歳"
  const raceClass = $('.race_title .cell.class').first().text().trim();       // "未勝利"
  const raceCourse = $('.race_title .cell.course').first().text().trim();     // "1,400メートル(ダート・左)"
  const distMatch = raceCourse.match(/([\d,]+)メートル.*?[（(](.+?)[）)]/);
  const distance = distMatch ? parseInt(distMatch[1].replace(/,/g, ''), 10) : null;
  const trackInfo = distMatch?.[2] || ''; // "ダート・左" 等

  // 天候・馬場
  const weather = $('.date_line .baba .weather .txt').first().text().trim() || null;
  // 馬場状態は芝/ダートで分かれる
  const babaTurf = $('.date_line .baba .turf .txt').first().text().trim() || null;
  const babaDirt = $('.date_line .baba .durt .txt').first().text().trim() || null;
  const trackCondition = babaTurf || babaDirt || null;

  // 発走時刻
  const startTime = $('.date_line .cell.time strong').first().text().trim() || null;

  // ── 結果テーブル ──
  const results = [];
  $('table.basic.narrow-xy tbody tr').each((_i, tr) => {
    const $tr = $(tr);
    // ヘッダ行スキップ用に tr の中身が tdで構成されているか確認
    if ($tr.find('td.place').length === 0) return;

    const placeText = $tr.find('td.place').first().text().trim();
    const place = parseInt(placeText, 10);
    // 取消・除外・降着 などは place が空または数値外
    const wakuAlt = $tr.find('td.waku img').attr('alt') || ''; // "枠7橙" 等
    const wakuNum = parseInt(wakuAlt.match(/(\d+)/)?.[1] || '0', 10);
    const number = parseInt($tr.find('td.num').first().text().trim(), 10);
    const horseName = $tr.find('td.horse a').first().text().trim()
      || $tr.find('td.horse').first().text().trim();
    const sexAge = $tr.find('td.age').first().text().trim();
    const weight = $tr.find('td.weight').first().text().trim();
    const jockey = $tr.find('td.jockey a').first().text().trim()
      || $tr.find('td.jockey').first().text().trim();
    const time = $tr.find('td.time').first().text().trim();
    const margin = $tr.find('td.margin').first().text().trim();
    // コーナー通過順位 (3コーナー、4コーナーの値)
    const corners = [];
    $tr.find('td.corner ul li').each((_, li) => {
      const v = $(li).text().trim();
      if (v) corners.push(v);
    });
    const lastFurlong = $tr.find('td.f_time').first().text().trim();
    // 馬体重 "524(+6)"
    const hWeightRaw = $tr.find('td.h_weight').first().text().trim();
    const hwMatch = hWeightRaw.match(/(\d+)\s*\(([+\-]?\d+)\)/);
    const horseWeight = hwMatch ? parseInt(hwMatch[1], 10) : null;
    const horseWeightDiff = hwMatch ? parseInt(hwMatch[2], 10) : null;
    const trainer = $tr.find('td.trainer a').first().text().trim()
      || $tr.find('td.trainer').first().text().trim();
    const popularity = parseInt($tr.find('td.pop').first().text().trim(), 10);

    results.push({
      position: Number.isFinite(place) ? place : null,
      bracket: Number.isFinite(wakuNum) ? wakuNum : null,
      number: Number.isFinite(number) ? number : null,
      name: horseName || null,
      sexAge: sexAge || null,
      weight: weight || null,
      jockey: jockey || null,
      time: time || null,
      margin: margin || null,
      cornerPass: corners,
      lastFurlong: lastFurlong || null,
      horseWeight,
      horseWeightDiff,
      trainer: trainer || null,
      popularity: Number.isFinite(popularity) ? popularity : null,
    });
  });

  // 着順ソート
  results.sort((a, b) => (a.position ?? 99) - (b.position ?? 99));

  // ── ハロン・コーナー通過順位 ──
  // <table summary="ラップタイム"> 配下の構造を抽出
  let halonTime = null;
  let upper = null;
  $('table[summary="ラップタイム"], .result_time_data').first().find('tr').each((_, tr) => {
    const label = $(tr).find('th').text().trim();
    const value = $(tr).find('td').text().trim();
    if (/ハロン/.test(label)) halonTime = value;
    else if (/上り/.test(label)) upper = value;
  });

  let cornerPassDetail = null;
  $('table[summary="コーナー通過順位"], .result_corner_place').first().find('tr').each((_, tr) => {
    const label = $(tr).find('th').text().trim();
    const value = $(tr).find('td').text().trim();
    if (!cornerPassDetail) cornerPassDetail = {};
    if (/3コーナー/.test(label)) cornerPassDetail.corner3 = value;
    else if (/4コーナー/.test(label)) cornerPassDetail.corner4 = value;
  });

  // ── 払戻金 ──
  const payouts = parsePayouts($);

  return {
    date,
    venue: venueName,
    venueCode,
    raceNumber,
    raceName,
    raceCategory,
    raceClass,
    distance,
    trackInfo,
    startTime,
    weather,
    trackCondition,
    results,
    halonTime,
    upper,
    cornerPassDetail,
    payouts,
  };
}

/**
 * 払戻金セクション (.refund_area) を抽出。
 * li class: win / place / wakuren / wide / umaren / umatan / trio / tierce
 */
function parsePayouts($) {
  const out = {
    tansho: [], fukusho: [], wakuren: [], wide: [],
    umaren: [], umatan: [], sanrenpuku: [], sanrentan: [],
  };
  const map = {
    win: 'tansho',
    place: 'fukusho',
    wakuren: 'wakuren',
    wide: 'wide',
    umaren: 'umaren',
    umatan: 'umatan',
    trio: 'sanrenpuku',
    tierce: 'sanrentan',
  };
  $('.refund_area li').each((_, li) => {
    const cls = ($(li).attr('class') || '').trim().split(/\s+/)[0];
    const key = map[cls];
    if (!key) return;
    $(li).find('.line').each((_, line) => {
      const combination = $(line).find('.num').first().text().trim();
      const yenText = $(line).find('.yen').first().text().replace(/\s+|,|円/g, '');
      const payout = parseInt(yenText, 10);
      const popText = $(line).find('.pop').first().text().replace(/[^\d]/g, '');
      const popularity = parseInt(popText, 10);
      if (combination && Number.isFinite(payout)) {
        out[key].push({
          combination,
          payout,
          popularity: Number.isFinite(popularity) ? popularity : null,
        });
      }
    });
  });
  return out;
}

// ───── venue 単位での admin POST フォーマット ─────
function buildVenueResultsJSON(venueRaces, parsedR1) {
  // venueRaces: race ごとの parseRacePage 結果リスト (raceNumber 昇順)
  const first = venueRaces[0];
  const date = first?.date;
  const venue = first?.venue || JYO_MAP[parsedR1.jyo]?.name;
  const venueCode = first?.venueCode || JYO_MAP[parsedR1.jyo]?.code;
  return {
    date,
    venue,
    venueCode,
    races: venueRaces.map((r) => ({
      raceNumber: r.raceNumber,
      raceName: r.raceName,
      raceCategory: r.raceCategory,
      raceClass: r.raceClass,
      distance: r.distance,
      trackInfo: r.trackInfo,
      startTime: r.startTime,
      weather: r.weather,
      trackCondition: r.trackCondition,
      results: r.results,
      halonTime: r.halonTime,
      upper: r.upper,
      cornerPassDetail: r.cornerPassDetail,
      payouts: r.payouts,
      umatan: r.payouts?.umatan?.[0] || { combination: null, payout: null },
      isHit: false, // 的中判定は archive 側で別途
    })),
  };
}

// ───── main ─────
async function main() {
  const args = parseArgs(process.argv);
  if (!args.urls) {
    console.error('Usage: node scripts/jra/auto-fetch-jra-official.mjs --urls=urls.txt [--date=YYYY-MM-DD] [--dispatch] [--dry-run] [--out=PATH]');
    console.error('  urls.txt は 1場1行 (R1 の URL) で 開催場数 (通常3) 行記述');
    process.exit(2);
  }
  if (!fs.existsSync(args.urls)) {
    console.error(`❌ urls file not found: ${args.urls}`);
    process.exit(2);
  }

  // urls.txt 読み込み
  const lines = fs.readFileSync(args.urls, 'utf-8')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'));
  if (lines.length === 0) {
    console.error('❌ urls.txt に有効な URL なし');
    process.exit(2);
  }

  console.log(`📥 入力 URL: ${lines.length} 件`);

  // 各 URL を CNAME にパース → 場ごとに R1 情報として記録
  const venueR1s = [];
  for (const line of lines) {
    const cname = extractCname(line);
    if (!cname) {
      console.warn(`  ⚠️  CNAME 抽出失敗: ${line}`);
      continue;
    }
    const parsed = parseCname(cname);
    if (!parsed) {
      console.warn(`  ⚠️  CNAME パターン不一致: ${cname}`);
      continue;
    }
    if (parsed.race !== 1) {
      console.warn(`  ⚠️  R${parsed.race} URL を渡されました。R1 のみ受け付け。jyo=${parsed.jyo}`);
      continue;
    }
    venueR1s.push(parsed);
  }
  if (venueR1s.length === 0) {
    console.error('❌ 有効な R1 URL が無し');
    process.exit(2);
  }

  // CLI date と URL の raceDate の整合性チェック
  if (args.date) {
    const expectedDate = args.date.replace(/-/g, '');
    const mismatched = venueR1s.filter((r) => r.raceDate !== expectedDate);
    if (mismatched.length > 0) {
      console.error(`❌ --date=${args.date} と URL の raceDate が不一致: ${mismatched.map(r => `jyo=${r.jyo} raceDate=${r.raceDate}`).join(', ')}`);
      process.exit(2);
    }
  }
  const targetDate = `${venueR1s[0].raceDate.slice(0,4)}-${venueR1s[0].raceDate.slice(4,6)}-${venueR1s[0].raceDate.slice(6,8)}`;
  console.log(`📅 対象日: ${targetDate}`);
  console.log(`🏟  対象場: ${venueR1s.map(r => `${JYO_MAP[r.jyo]?.name}(${r.jyo}, kai=${r.kai} nichi=${r.nichi})`).join(', ')}`);
  console.log('');

  // 各場×12R をループ
  // ┌─ 戦略 ───────────────────────────────────────────────────────┐
  // │ 1. まず R1 ページを fetch (ユーザー提供URL)                   │
  // │ 2. R1 ページの sidebar から 12R 分の正確な URL を抽出         │
  // │ 3. 抽出した URL を順次 fetch (R1 含む)                        │
  // │ → CHK の機械算出は使わない (R9→R10 で破綻するため)            │
  // └────────────────────────────────────────────────────────────────┘
  const venueResultsAll = [];
  for (const r1 of venueR1s) {
    const venueName = JYO_MAP[r1.jyo]?.name || `不明(${r1.jyo})`;
    console.log(`━━ ${venueName} (jyo=${r1.jyo}) ━━`);

    // R1 ページを fetch して 12R 分の URL を抽出
    const r1Url = buildUrl(`pw01sde${r1.dateType}${r1.jyo}${r1.year}${r1.kai}${r1.nichi}01${r1.raceDate}/${r1.chk.toString(16).toUpperCase().padStart(2,'0')}`);
    let r1Html;
    try {
      const fr = await fetchHtml(r1Url);
      if (!fr.ok) {
        console.error(`  ❌ ${venueName} R1 fetch 失敗 HTTP ${fr.status}`);
        continue;
      }
      r1Html = fr.html;
    } catch (e) {
      console.error(`  ❌ ${venueName} R1 fetch error: ${e.message}`);
      continue;
    }
    const venueUrls = extractVenueRaceUrlsFromR1Page(r1Html, r1);
    console.log(`  📋 R1ページから ${venueUrls.size} レース分の URL 抽出`);
    if (venueUrls.size < RACES_PER_VENUE) {
      console.warn(`  ⚠️  ${venueName}: 期待 ${RACES_PER_VENUE}R だが ${venueUrls.size}R しか取れず (一部レース未確定?)`);
    }

    const races = [];
    // R1 は既に fetch 済みなのでまず処理、その後 R2-R12 を fetch
    for (let raceNum = 1; raceNum <= RACES_PER_VENUE; raceNum++) {
      const url = venueUrls.get(raceNum);
      if (!url) {
        console.warn(`  ⏭  ${venueName} ${raceNum}R URL 未抽出 (R1ページにリンクなし)`);
        continue;
      }
      try {
        let html;
        if (raceNum === 1) {
          html = r1Html; // 再 fetch せず使い回し
        } else {
          await sleep(FETCH_DELAY_MS);
          const fr = await fetchHtml(url);
          if (!fr.ok) {
            console.warn(`  ⚠️  ${venueName} ${raceNum}R HTTP ${fr.status}`);
            continue;
          }
          html = fr.html;
        }
        const cname = extractCname(url);
        const parsedCname = parseCname(cname) || { ...r1, race: raceNum };
        const race = parseRacePage(html, parsedCname);
        if (!race.results || race.results.length === 0) {
          console.warn(`  ⏭  ${venueName} ${raceNum}R 結果テーブル抽出失敗 (未確定?)`);
          continue;
        }
        races.push(race);
        const top = race.results.slice(0, 3).map(r => `${r.position}着=${r.number}`).join(' ');
        const uma = race.payouts?.umatan?.[0];
        const umaStr = uma ? ` 馬単${uma.combination} ¥${uma.payout.toLocaleString()}` : '';
        console.log(`  ✓ ${venueName} ${raceNum}R: ${top}${umaStr}`);
      } catch (e) {
        console.error(`  ❌ ${venueName} ${raceNum}R parse error: ${e.message}`);
      }
    }
    if (races.length > 0) {
      venueResultsAll.push({ r1, races });
    }
    console.log('');
  }

  // ── 出力ディレクトリ ──
  const outDir = args.out || path.join('tmp', 'jra-official', targetDate);
  fs.mkdirSync(outDir, { recursive: true });

  // venue ごとに結果 JSON を生成・保存
  const venueJsonPaths = [];
  for (const { r1, races } of venueResultsAll) {
    const venueData = buildVenueResultsJSON(races, r1);
    const venueCode = JYO_MAP[r1.jyo]?.code || r1.jyo;
    const fname = `${targetDate}-${venueCode}.json`;
    const fpath = path.join(outDir, fname);
    fs.writeFileSync(fpath, JSON.stringify(venueData, null, 2), 'utf-8');
    venueJsonPaths.push({ path: fpath, venueData });
    console.log(`💾 ${venueCode}: ${fpath} (${races.length}R)`);
  }

  // ── 統計 ──
  const totalRaces = venueResultsAll.reduce((s, v) => s + v.races.length, 0);
  console.log('');
  console.log('━━━ 結果サマリ ━━━');
  console.log(`  対象日:        ${targetDate}`);
  console.log(`  取得 venue 数: ${venueResultsAll.length} / ${venueR1s.length}`);
  console.log(`  取得レース数:  ${totalRaces}`);
  console.log(`  出力ディレクトリ: ${outDir}`);

  // ── --dispatch 指定時のみ admin POST + dispatch ──
  if (!args.dispatch) {
    console.log('');
    console.log('ℹ️  --dispatch 未指定: tmp出力のみで終了 (push/dispatch なし)');
    console.log('   admin にアップロードする場合は --dispatch を付けて再実行');
    return;
  }
  if (args.dryRun) {
    console.log('');
    console.log('🟡 --dry-run: 以下の操作はスキップされます');
    venueJsonPaths.forEach(v => {
      const { date, venueCode } = v.venueData;
      const [year, month] = date.split('-');
      console.log(`   would PUT keiba-data-shared/jra/results/${year}/${month}/${date}-${venueCode}.json`);
    });
    console.log(`   would dispatch jra-results-updated to keiba-intelligence + analytics-keiba`);
    return;
  }

  console.log('');
  console.log('📤 keiba-data-shared に直接 push 中 (GitHub API)...');

  const token = process.env.GITHUB_TOKEN_KEIBA_DATA_SHARED || process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('❌ GITHUB_TOKEN_KEIBA_DATA_SHARED 環境変数が未設定');
    console.error('   例: GITHUB_TOKEN_KEIBA_DATA_SHARED=ghp_xxx node scripts/jra/auto-fetch-jra-official.mjs --urls=urls.txt --dispatch');
    process.exit(3);
  }

  let pushedCount = 0;
  for (const { venueData } of venueJsonPaths) {
    try {
      await pushToKeibaDataShared(venueData, token);
      console.log(`✅ ${venueData.venue}(${venueData.venueCode}): keiba-data-shared に saved`);
      pushedCount++;
    } catch (e) {
      console.error(`❌ ${venueData.venue}: ${e.message}`);
    }
    await sleep(1500); // GitHub API rate limit 対策
  }

  if (pushedCount === 0) {
    console.error('❌ どの venue も push 成功せず → dispatch スキップ');
    process.exit(4);
  }

  // ── dispatch jra-results-updated を keiba-intelligence + analytics-keiba に送信 ──
  console.log('');
  console.log('📡 dispatch jra-results-updated 送信中...');
  try {
    const result = await dispatchToTargets('jra-results-updated', {
      date: targetDate,
      source: 'jra-official-scrape',
      venues: venueJsonPaths.map(v => v.venueData.venueCode),
    });
    const triggered = Array.isArray(result?.triggered) ? result.triggered : [];
    if (triggered.length === 0) {
      console.warn(`⚠️  dispatch 送信先 0 件 (token未設定?)`);
    } else {
      console.log(`✅ dispatch success: ${triggered.join(', ')}`);
    }
    const failed = (result?.results || []).filter((r) => !r.ok && !r.skipped);
    if (failed.length > 0) {
      console.warn(`⚠️  一部 dispatch 失敗: ${failed.map((r) => `${r.repo}=${r.error}`).join(', ')}`);
    }
  } catch (e) {
    console.error(`❌ dispatch error: ${e.message}`);
  }

  console.log('');
  console.log('✅ 完了');
}

/**
 * keiba-data-shared に GitHub API で直接 push。
 * Netlify Functions が Basic Auth で守られているため CLI からは Functions 経由不可。
 *
 * 保存先: jra/results/YYYY/MM/YYYY-MM-DD-{VENUE}.json
 * 既存ファイルがあれば races[] を raceNumber でマージして上書き (forceOverwrite 同等動作)。
 */
async function pushToKeibaDataShared(venueData, token) {
  const OWNER = process.env.GITHUB_REPO_OWNER || 'apol0510';
  const REPO = 'keiba-data-shared';
  const BRANCH = 'main';
  const { date, venue, venueCode } = venueData;
  const [year, month] = date.split('-');
  const filePath = `jra/results/${year}/${month}/${date}-${venueCode}.json`;

  // 既存ファイル取得 (SHA + content for merge)
  const getUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filePath}?ref=${BRANCH}`;
  let sha = null;
  let existing = null;
  const getRes = await fetch(getUrl, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'jra-auto-fetch',
    },
  });
  if (getRes.ok) {
    const j = await getRes.json();
    sha = j.sha;
    try { existing = JSON.parse(Buffer.from(j.content, 'base64').toString('utf-8')); } catch {}
  }

  // races[] をマージ: 同じ raceNumber は incoming で上書き、新規は追加
  if (existing?.races) {
    const incomingMap = new Map(venueData.races.map((r) => [r.raceNumber, r]));
    const merged = existing.races.map((r) =>
      incomingMap.has(r.raceNumber) ? incomingMap.get(r.raceNumber) : r
    );
    for (const r of venueData.races) {
      if (!existing.races.some((er) => er.raceNumber === r.raceNumber)) merged.push(r);
    }
    venueData.races = merged.sort((a, b) => a.raceNumber - b.raceNumber);
  }

  const raceNumbers = venueData.races.map((r) => `${r.raceNumber}R`).join('・');
  const message = `✨ ${date} ${venue} ${raceNumbers} 結果${sha ? '更新' : '追加'}

【JRA 結果データ / JRA公式 auto-fetch】
- 開催日: ${date}
- 競馬場: ${venue}（${venueCode}）
- ファイル: ${filePath}

Co-Authored-By: Claude <noreply@anthropic.com>`;

  const putUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filePath}`;
  const putRes = await fetch(putUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'jra-auto-fetch',
    },
    body: JSON.stringify({
      message,
      content: Buffer.from(JSON.stringify(venueData, null, 2), 'utf-8').toString('base64'),
      branch: BRANCH,
      ...(sha && { sha }),
    }),
  });
  if (!putRes.ok) {
    const text = await putRes.text().catch(() => '');
    throw new Error(`GitHub PUT failed: HTTP ${putRes.status} ${text}`);
  }
  return putRes.json();
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
