/**
 * pastRaces 補完（段階 B + C）— `{cat}/results/` 突合 + PUA 距離デコード。
 *
 * 段階 B: results 突合
 *   - distance / distanceMeters / raceName / surface / popularity /
 *     margin / bodyWeightDiff / final3F を埋める
 *   - 推測ゼロ。results が無ければ null のまま (JRA/南関とも 2026 年分のみ整備)
 *
 * 段階 C: PUA 距離デコード（results 突合の後段）
 *   - past-races-pua-decoder.mjs を呼び、distanceGaiji を手掛かりに残りの
 *     distance:null を埋める
 *   - per-PDF bootstrap が primary、seed map は限定 fallback
 *   - 既存値は破壊しない
 *
 * 共通方針:
 * - 既存値非破壊
 * - 1 日分の results を Map にキャッシュ
 * - 並び順は normalizer と同じく触らない
 */

import { decodeDataPastRaces } from './past-races-pua-decoder.mjs';

const REPO_OWNER = 'apol0510';
const REPO_NAME = 'keiba-data-shared';
const RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main`;

// results 整備済みの最小年。これ未満の past race は fetch 対象から除外して
// Netlify Functions の timeout を回避する。将来 2025 年以前の results が
// 整備された場合はこの値を下げる。
const RESULTS_MIN_YEAR = 2026;

// preload で並列 fetch する上限。GitHub raw への過剰負荷を避けるため、
// 同時 8 リクエストまでに制限する。
const FETCH_CONCURRENCY = 8;

// JRA: keibabook の場名略字 → keiba-data-shared の 3 文字コード
// 「中京」は keibabook では「名」表記される（中山=中 / 京都=京 と重複回避のため）。
const JRA_VENUE_CHAR_TO_CODE = Object.freeze({
  '東': 'TOK',
  '中': 'NAK',
  '京': 'KYO',
  '阪': 'HAN',
  '名': 'CHU',
  '小': 'KOK',
  '新': 'NII',
  '福': 'FKS',
  '札': 'SAP',
  '函': 'HKD',
});

const JRA_VENUE_FULLNAME_TO_CODE = Object.freeze({
  '東京': 'TOK',
  '中山': 'NAK',
  '京都': 'KYO',
  '阪神': 'HAN',
  '中京': 'CHU',
  '小倉': 'KOK',
  '新潟': 'NII',
  '福島': 'FKS',
  '札幌': 'SAP',
  '函館': 'HKD',
});

const NANKAN_VENUE_NAME_TO_CODE = Object.freeze({
  '大井': 'OOI',
  '川崎': 'KAW',
  '船橋': 'FUN',
  '浦和': 'URA',
});

const _resultsCache = new Map();

function normalizeHorseName(s) {
  return String(s || '').replace(/\s/g, '').normalize('NFKC');
}

function buildAuthHeaders() {
  const TOK = process.env.GITHUB_TOKEN_KEIBA_DATA_SHARED || process.env.GITHUB_TOKEN;
  return TOK
    ? { 'Authorization': `token ${TOK}`, 'User-Agent': 'keiba-data-shared-admin-enricher' }
    : { 'User-Agent': 'keiba-data-shared-admin-enricher' };
}

/**
 * results JSON を fetch（キャッシュあり）。
 * - JRA: `{category}/results/{Y}/{M}/{date}-{venueCode}.json`
 * - 南関 (新形式): 同上
 * - 南関 (旧形式): `{category}/results/{Y}/{M}/{date}.json`（複数会場混在）
 */
async function fetchResultsDay(category, date, venueCode) {
  const cacheKey = `${category}|${date}|${venueCode || ''}`;
  if (_resultsCache.has(cacheKey)) return _resultsCache.get(cacheKey);

  const [year, month] = date.split('-');
  const headers = buildAuthHeaders();
  const urls = [];
  if (venueCode) {
    urls.push(`${RAW_BASE}/${category}/results/${year}/${month}/${date}-${venueCode}.json`);
  }
  if (category === 'nankan') {
    urls.push(`${RAW_BASE}/${category}/results/${year}/${month}/${date}.json`);
  }

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = JSON.parse(await res.text());
        _resultsCache.set(cacheKey, data);
        return data;
      }
    } catch (e) {
      // ネットワークエラーは継続（フォールバック URL を試す）
    }
  }

  _resultsCache.set(cacheKey, null);
  return null;
}

/**
 * pastRace.venue 文字列を `{category, venueCode, venueName, month, day}` に分解。
 * 失敗時は null。
 */
function parsePastVenue(venueStr, expectedCategory) {
  if (!venueStr) return null;
  const s = String(venueStr).trim();

  if (expectedCategory === 'jra') {
    // JRA XML 形式: "4中9.27" / "5阪12.14" — kaisuu + 1 文字 + M.D
    let m = s.match(/^\d{1,2}([東中京阪名小新福札函])(\d{1,2})\.(\d{1,2})\s*$/);
    if (m) {
      return {
        venueCode: JRA_VENUE_CHAR_TO_CODE[m[1]] || null,
        venueName: null,
        month: Number(m[2]),
        day: Number(m[3]),
      };
    }
    // JRA テキスト形式（稀）: "東京 6.1" / "中山 3.28"
    m = s.match(/^(東京|中山|京都|阪神|中京|新潟|福島|小倉|札幌|函館)\s+(\d{1,2})\.(\d{1,2})\s*$/);
    if (m) {
      return {
        venueCode: JRA_VENUE_FULLNAME_TO_CODE[m[1]] || null,
        venueName: m[1],
        month: Number(m[2]),
        day: Number(m[3]),
      };
    }
    return null;
  }

  if (expectedCategory === 'nankan') {
    const m = s.match(/^(大井|川崎|船橋|浦和)\s+(\d{1,2})\.(\d{1,2})\s*$/);
    if (m) {
      return {
        venueCode: NANKAN_VENUE_NAME_TO_CODE[m[1]] || null,
        venueName: m[1],
        month: Number(m[2]),
        day: Number(m[3]),
      };
    }
    return null;
  }

  return null;
}

/**
 * pastRace の月日 + 当該レース日付から、過去走の年を確定する。
 * (past月日が当該日付より未来なら前年と判定)
 */
function resolvePastDate(month, day, refDate) {
  const [ry, rm, rd] = String(refDate).split('-').map(Number);
  let yr = ry;
  if (month > rm || (month === rm && day > rd)) yr -= 1;
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${yr}-${mm}-${dd}`;
}

function findHorseInResults(resultsData, horseName, venueName) {
  if (!resultsData || !Array.isArray(resultsData.races)) return null;
  const norm = normalizeHorseName(horseName);
  for (const race of resultsData.races) {
    // 旧形式 (date.json) で複数会場混在の場合は venue で絞る
    if (venueName && race.venue && race.venue !== venueName) continue;
    const arr = race.results || race.horses || [];
    for (const h of arr) {
      if (normalizeHorseName(h.name) === norm) {
        return { race, horse: h };
      }
    }
  }
  return null;
}

function inferSurfaceShort(...sources) {
  for (const src of sources) {
    if (src == null) continue;
    const s = String(src);
    if (/ダート/.test(s) || /^ダ/.test(s) || /\Wダ/.test(s)) return 'ダ';
    if (/芝/.test(s)) return '芝';
    if (/障/.test(s)) return '障';
  }
  return null;
}

/**
 * 1 件の pastRace を results 突合で補完。
 * 既に必要フィールドが揃っていればスキップ（API 呼び出しも skip）。
 */
async function enrichOnePastRace(pr, refDate, horseName, category) {
  if (!pr || !horseName) return { changed: false, pr };

  const needs =
    pr.distanceMeters == null ||
    pr.distance == null ||
    pr.popularity == null ||
    pr.raceName == null ||
    pr.surface == null ||
    pr.margin == null ||
    pr.bodyWeightDiff == null;
  if (!needs) return { changed: false, pr };

  const parsed = parsePastVenue(pr.venue, category);
  if (!parsed || !parsed.venueCode) return { changed: false, pr };

  const pastDate = resolvePastDate(parsed.month, parsed.day, refDate);
  // 推測ゼロ: RESULTS_MIN_YEAR 未満は results 未整備なのでスキップ
  const [py] = pastDate.split('-').map(Number);
  if (py < RESULTS_MIN_YEAR) return { changed: false, pr };

  const results = await fetchResultsDay(category, pastDate, parsed.venueCode);
  if (!results) return { changed: false, pr };

  const hit = findHorseInResults(results, horseName, parsed.venueName);
  if (!hit) return { changed: false, pr };

  const { race, horse } = hit;
  const distMeters = race.distance != null ? Number(race.distance) : null;
  // 南関 results は race.surface ("ダート"/"芝"), JRA results は race.trackInfo ("ダート・左"/"芝・右")
  const surface = inferSurfaceShort(race.surface, race.trackInfo, pr.distance);
  const distStr = (surface && distMeters) ? `${surface}${distMeters}` : null;

  const next = {
    ...pr,
    date: pr.date || pastDate,
    venueCode: pr.venueCode || parsed.venueCode,
    raceName: pr.raceName || race.raceName || null,
    surface: pr.surface || surface || null,
    distance: pr.distance || distStr || null,
    distanceMeters: pr.distanceMeters || (Number.isFinite(distMeters) ? distMeters : null),
    popularity: pr.popularity != null
      ? pr.popularity
      : (horse.popularity != null ? Number(horse.popularity) : null),
    margin: pr.margin || (horse.margin != null ? horse.margin : null),
    bodyWeightDiff: pr.bodyWeightDiff != null
      ? pr.bodyWeightDiff
      : (horse.horseWeightDiff != null ? Number(horse.horseWeightDiff) : null),
    final3F: pr.final3F || horse.lastFurlong || null,
  };

  return { changed: true, pr: next };
}

/**
 * 制限付き並列実行ヘルパー。
 * - items の各要素に対して非同期 task を実行
 * - 同時実行数は concurrency まで
 * - 個別タスクの例外は呼び出し側で握る前提（task 側で try/catch）
 */
async function runWithConcurrency(items, concurrency, task) {
  let cursor = 0;
  const workers = new Array(Math.min(concurrency, items.length)).fill(0).map(async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      await task(items[i]);
    }
  });
  await Promise.all(workers);
}

/**
 * data 内の全 pastRaces から results fetch 候補を収集し、年フィルタ・
 * ユニーク化・並列 fetch (キャッシュ書き込み) まで一括で行う。
 *
 * その後 enrichOnePastRace を呼べば、fetchResultsDay は cache hit して
 * network を発生させない。
 *
 * @returns {Promise<{ candidates, yearSkipped, alreadyCached, uniqueFetch,
 *                     fetchSuccess, fetchFailed }>}
 */
async function preloadResultsForData(data, refDate, category) {
  const stats = {
    candidates: 0,
    yearSkipped: 0,
    alreadyCached: 0,
    uniqueFetch: 0,
    fetchSuccess: 0,
    fetchFailed: 0,
  };
  if (!data || !Array.isArray(data.races)) return stats;

  // Phase 1: 全 pastRaces を走査して (category, pastDate, venueCode) を収集
  const toFetch = new Map(); // cacheKey -> { category, date, venueCode }
  for (const race of data.races) {
    if (!Array.isArray(race.horses)) continue;
    for (const horse of race.horses) {
      for (const pr of (horse.pastRaces || [])) {
        stats.candidates++;
        if (!pr || !pr.venue) continue;
        const parsed = parsePastVenue(pr.venue, category);
        if (!parsed || !parsed.venueCode) continue;
        const pastDate = resolvePastDate(parsed.month, parsed.day, refDate);
        const [py] = pastDate.split('-').map(Number);
        if (py < RESULTS_MIN_YEAR) { stats.yearSkipped++; continue; }
        const cacheKey = `${category}|${pastDate}|${parsed.venueCode}`;
        if (_resultsCache.has(cacheKey)) { stats.alreadyCached++; continue; }
        if (!toFetch.has(cacheKey)) {
          toFetch.set(cacheKey, { category, date: pastDate, venueCode: parsed.venueCode });
        }
      }
    }
  }
  stats.uniqueFetch = toFetch.size;

  // Phase 2: 並列 fetch (上限 FETCH_CONCURRENCY)
  const tasks = [...toFetch.values()];
  await runWithConcurrency(tasks, FETCH_CONCURRENCY, async (t) => {
    try {
      const data = await fetchResultsDay(t.category, t.date, t.venueCode);
      if (data) stats.fetchSuccess++;
      else stats.fetchFailed++;
    } catch (e) {
      // 例外は fetchResultsDay 内で握っているはずだが、保険として
      _resultsCache.set(`${t.category}|${t.date}|${t.venueCode}`, null);
      stats.fetchFailed++;
    }
  });

  return stats;
}

/**
 * 段階 B のみ実行 (results 突合)。verify スクリプト等で stage 別に呼びたいときに使う。
 *
 * @param {object} data - normalizer 適用済みの racebook/computer JSON
 * @param {object} opts
 * @param {'jra'|'nankan'} opts.category
 * @param {string} opts.raceDate - 当該レース日 YYYY-MM-DD（pastRace の年推定の基準）
 * @returns {Promise<object>} 同じ data（in-place）
 */
export async function enrichByResults(data, { category, raceDate }) {
  if (!data || !Array.isArray(data.races)) return data;
  if (category !== 'jra' && category !== 'nankan') return data;

  const ref = raceDate || data.date;
  const t0 = Date.now();

  // Phase A: 候補収集 + 並列 preload
  const preloadStats = await preloadResultsForData(data, ref, category);
  const elapsedPreload = Date.now() - t0;

  // Phase B: 補完適用 (cache hit するので fetch は発生しない)
  let attempted = 0, enriched = 0;
  for (const race of data.races) {
    if (!Array.isArray(race.horses)) continue;
    for (const horse of race.horses) {
      const prs = horse.pastRaces || [];
      const next = [];
      for (const pr of prs) {
        attempted++;
        const { changed, pr: nextPr } = await enrichOnePastRace(pr, ref, horse.name, category);
        if (changed) enriched++;
        next.push(nextPr);
      }
      horse.pastRaces = next;
    }
  }
  const elapsedTotal = Date.now() - t0;
  console.log(`[PastRacesEnricher] ${category} ${ref}: ${enriched}/${attempted} enriched | preload: candidates=${preloadStats.candidates} yearSkipped=${preloadStats.yearSkipped} alreadyCached=${preloadStats.alreadyCached} uniqueFetch=${preloadStats.uniqueFetch} success=${preloadStats.fetchSuccess} failed=${preloadStats.fetchFailed} | elapsedMs preload=${elapsedPreload} total=${elapsedTotal}`);
  return data;
}

/**
 * 公開 API: 段階 B (results 突合) → 段階 C (PUA decode) を順に実行。
 * 既存 caller (save-keiba-book.mjs / save-computer.mjs) はこの関数を呼ぶ。
 *
 * @param {object} data - normalizer 適用済みの racebook/computer JSON
 * @param {object} opts
 * @param {'jra'|'nankan'} opts.category
 * @param {string} opts.raceDate
 * @returns {Promise<object>} 同じ data（in-place）
 */
export async function enrichDataPastRaces(data, opts) {
  await enrichByResults(data, opts);
  // 段階 C: PUA decoder（同期。失敗しても enrichByResults の結果は維持）
  try {
    decodeDataPastRaces(data, opts);
  } catch (e) {
    console.warn('[PastRacesEnricher] PUA decoder 失敗（続行）:', e.message);
  }
  return data;
}
