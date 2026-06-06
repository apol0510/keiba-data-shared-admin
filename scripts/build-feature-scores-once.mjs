#!/usr/bin/env node
/**
 * Phase 2: Feature Importance 共通データ契約 v1 の dry-run 生成（1開催単位）。
 *
 * ★★★ 安全保証 ★★★
 *   - shared への書き込み一切なし / GitHub PUT 一切なし / dispatch 一切なし。
 *   - 書き込み先は tmp/feature-scores/ 配下のみ（実行時アサートで強制）。
 *   - racebook / computer / predictions / results / horseHistories は read のみ。
 *   - octokit / Contents API / dispatch.mjs / pair-guard.mjs を import しない。
 *
 * 生成物（Phase 1 契約 v1）:
 *   Layer A normalizedPastRaces（正規化過去走）+ Layer B featureScores（6項目・相対スコア）。
 *   中央JRA = engine "jra-v1"（horseHistories 主 + racebook で final3F/paceType 補完）。
 *   南関     = engine "nankan-v1"（racebook pastRaces のみ。horseHistories 不使用）。
 *
 * 相対スコア化（50.0/100.0 固定値を出さないための方式）:
 *   各特徴量の raw 値をレース内の有資格馬で z-score 化し、value = clamp(round(56 + 18*z), 12, 96)。
 *   - 中心は 56（50 を避ける）。両端 12/96 は外れ値のみ。絶対既定値 50/100 は出さない。
 *   - 有資格馬が分散0（全頭同値）→ 識別不能として value=null/insufficient + uniform 警告。
 *   - basisRaces < 2（jockeyFactor を除く）→ value=null / confidence="insufficient"。
 *
 * 使い方:
 *   node scripts/build-feature-scores-once.mjs --category jra    --date 2026-05-24 --venue TOK [--source local|remote]
 *   node scripts/build-feature-scores-once.mjs --category nankan --date 2026-05-29 --venue URA [--source local|remote]
 */

import fs from 'node:fs';
import path from 'node:path';

// ============================================================================
// CLI 引数（enrich-past-races-once.mjs と同一作法）
// ============================================================================
const args = process.argv.slice(2);
const opts = {
  category: null,
  date: null,
  venue: null,
  source: 'local',
  sharedRoot: path.resolve(process.cwd(), '../keiba-data-shared'),
  push: false,
  confirmPush: null,
};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--category') opts.category = args[++i];
  else if (a === '--date') opts.date = args[++i];
  else if (a === '--venue') opts.venue = args[++i];
  else if (a === '--source') opts.source = args[++i];
  else if (a === '--shared-root') opts.sharedRoot = path.resolve(args[++i]);
  else if (a === '--push') opts.push = true;
  else if (a.startsWith('--confirm-push=')) opts.confirmPush = a.slice('--confirm-push='.length);
  // 注: --dispatch フラグは意図的に実装しない（dispatch なし運用）
  else if (a === '--help' || a === '-h') {
    console.log('Usage: node scripts/build-feature-scores-once.mjs --category jra --date 2026-05-24 --venue TOK [--source local|remote] [--push --confirm-push=keiba-data-shared]');
    process.exit(0);
  }
}
if (!opts.category || !opts.date || !opts.venue) {
  console.error('Usage: node scripts/build-feature-scores-once.mjs --category jra --date 2026-05-24 --venue TOK [--source local|remote]');
  process.exit(2);
}
if (!['jra', 'nankan'].includes(opts.category)) {
  console.error(`unsupported category: ${opts.category}（jra | nankan のみ。local は対象外）`);
  process.exit(2);
}
const ENGINE = opts.category === 'jra' ? 'jra-v1' : 'nankan-v1';

// ============================================================================
// PUT 安全制約（shared 保存）
// ============================================================================
const CONFIRM_PUSH_REQUIRED = 'keiba-data-shared';
const PUT_OWNER = process.env.GITHUB_REPO_OWNER || 'apol0510';
const PUT_REPO = 'keiba-data-shared';
const PUT_BRANCH = 'main';
// PUT を許可する唯一のパス形（featureScores 配下のみ）。これ以外は構造的に PUT 不能。
const PUT_ALLOW = /^(jra|nankan)\/featureScores\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}-[A-Z]+\.json$/;

// --push 指定時の二段階確認 / token を「処理開始前」に検証（horseHistories 作法に準拠）
if (opts.push) {
  if (opts.confirmPush !== CONFIRM_PUSH_REQUIRED) {
    console.error(`❌ --push 指定だが --confirm-push=${CONFIRM_PUSH_REQUIRED} が未指定 or 値不一致`);
    console.error(`   実pushには「--push --confirm-push=${CONFIRM_PUSH_REQUIRED}」が必要（二段階確認）`);
    process.exit(2);
  }
  if (!process.env.GITHUB_TOKEN_KEIBA_DATA_SHARED) {
    console.error('❌ --push 指定だが GITHUB_TOKEN_KEIBA_DATA_SHARED が未設定');
    console.error('   GITHUB_TOKEN へのフォールバックは安全上の理由で許可しない（専用 token 必須）');
    process.exit(2);
  }
}

// ============================================================================
// 入力ロード（read only）
// ============================================================================
const [y, m] = opts.date.split('-');
const racebookRel = `${opts.category}/racebook/${y}/${m}/${opts.date}-${opts.venue}.json`;
const horseHistRel = `jra/horseHistories/${y}/${m}/${opts.date}-${opts.venue}.json`;

async function loadJSON(rel, optional = false) {
  try {
    if (opts.source === 'remote') {
      const url = `https://raw.githubusercontent.com/apol0510/keiba-data-shared/main/${rel}`;
      const res = await fetch(url);
      if (!res.ok) { if (optional) return null; throw new Error(`fetch ${url} status=${res.status}`); }
      return JSON.parse(await res.text());
    }
    const full = path.join(opts.sharedRoot, rel);
    if (!fs.existsSync(full)) { if (optional) return null; throw new Error(`not found: ${full}`); }
    return JSON.parse(fs.readFileSync(full, 'utf-8'));
  } catch (e) {
    if (optional) return null;
    throw e;
  }
}

// ============================================================================
// 正規化ヘルパー
// ============================================================================
function toRank(finish) {
  if (finish == null) return null;
  const n = parseInt(String(finish), 10);
  return Number.isFinite(n) && n > 0 ? n : null; // "中止/除外/取消" → null
}
function toNum(v) {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
}
function venueName(raw) {
  if (!raw) return '';
  // "浦和 3.20"（南関）→ 浦和 / "東京"（hh）→ 東京 / "3中3.28"（racebook JRA）は venueCode を優先使用
  if (/\s/.test(raw)) return raw.split(/\s+/)[0];
  return raw;
}
function distanceMetersOf(race) {
  // race.distanceMeters が null のことがある（JRA racebook）。string "ダート1400㍍" 等から抽出。
  if (race.distanceMeters != null && Number(race.distanceMeters) > 0) return Number(race.distanceMeters);
  const m = String(race.distance || '').match(/(\d{3,4})/);
  return m ? parseInt(m[1], 10) : null;
}
function surfaceFromDistance(distance) {
  if (!distance) return null;
  const s = String(distance);
  if (s.includes('芝')) return '芝';
  if (s.includes('ダ')) return 'ダ';
  if (s.includes('障')) return '障';
  return null;
}

// ============================================================================
// Layer A: normalizedPastRaces を生成
// ============================================================================

/** 南関: racebook pastRaces をそのまま共通スキーマへ（horseHistories 不使用） */
function normalizeNankan(horse) {
  const out = [];
  for (const pr of horse.pastRaces || []) {
    const rank = toRank(pr.finish);
    const dm = pr.distanceMeters != null ? Number(pr.distanceMeters) : null;
    out.push({
      date: pr.date || null,
      venue: venueName(pr.venue),
      rank,
      distanceMeters: dm,
      surface: pr.surface || surfaceFromDistance(pr.distance),
      last3f: toNum(pr.final3F),
      paceType: pr.paceType || null,
      isUsable: rank != null && dm != null,
    });
  }
  return out;
}

/** 中央JRA: horseHistories.history 主 + racebook pastRaces で final3F/paceType 補完
 *  excludeDate（=対象開催日）と同じ date の履歴は除外する（過去日 backfill の
 *  当日結果混入による look-ahead leak を防ぐ）。 */
function normalizeJra(horse, hhEntry, excludeDate) {
  // racebook pastRaces を date キーで引けるように（final3F/paceType の供給源）
  const rbByDate = new Map();
  for (const pr of horse.pastRaces || []) {
    if (pr.date) rbByDate.set(pr.date, pr);
  }
  const out = [];
  const base = hhEntry && Array.isArray(hhEntry.history) ? hhEntry.history : null;
  if (base) {
    for (const h of base) {
      if (excludeDate && h.date === excludeDate) continue; // 当日行は除外（leak防止）
      const rank = toRank(h.finish);
      const dm = h.distanceMeters != null ? Number(h.distanceMeters) : null;
      const rb = h.date ? rbByDate.get(h.date) : null; // 同日 racebook 過去走で補完
      out.push({
        date: h.date || null,
        venue: venueName(h.venue),
        rank,
        distanceMeters: dm,
        surface: h.surface || null,
        popularity: h.popularity != null ? Number(h.popularity) : null,
        entryCount: h.entryCount != null ? Number(h.entryCount) : null,
        last3f: rb ? toNum(rb.final3F) : null, // hh には無い → racebook 補完のみ（補助加点用）
        paceType: rb ? (rb.paceType || null) : null,
        isUsable: rank != null && dm != null,
      });
    }
  } else {
    // horseHistories に無い馬（外国馬・新規等）→ racebook pastRaces のみで構築
    for (const pr of horse.pastRaces || []) {
      if (excludeDate && pr.date === excludeDate) continue; // 当日行は除外（leak防止）
      const rank = toRank(pr.finish);
      const dm = pr.distanceMeters != null ? Number(pr.distanceMeters) : null;
      out.push({
        date: pr.date || null,
        venue: venueName(pr.venue),
        rank,
        distanceMeters: dm,
        surface: pr.surface || surfaceFromDistance(pr.distance),
        popularity: pr.popularity != null ? Number(pr.popularity) : null,
        entryCount: null,
        last3f: toNum(pr.final3F),
        paceType: pr.paceType || null,
        isUsable: rank != null && dm != null,
      });
    }
  }
  return out;
}

// ============================================================================
// raw 特徴量（相対化前）。算出不能は {raw:null, basis:0}
// ============================================================================
function finishToScore(rank) {
  if (!rank || rank <= 0) return 0;
  if (rank === 1) return 100;
  if (rank === 2) return 85;
  if (rank === 3) return 70;
  if (rank <= 5) return 55;
  if (rank <= 8) return 35;
  return 15;
}
const ROLE_SCORE = { '本命': 90, '対抗': 80, '単穴': 70, '連下最上位': 60, '連下': 50, '補欠': 40, '無': 35 };

function rawSpeed(np) {
  const races = np.filter(r => r.last3f != null);
  if (races.length === 0) return { raw: null, basis: 0 };
  let sum = 0;
  for (const r of races) {
    let p = 40 - r.last3f; // 上がりが速いほど高い
    if (r.rank === 1) p += 3; else if (r.rank === 2) p += 1.5; else if (r.rank === 3) p += 0.5;
    sum += p;
  }
  return { raw: sum / races.length, basis: races.length };
}
function rawStamina(np) {
  const races = np.filter(r => r.last3f != null || r.paceType);
  if (races.length === 0) return { raw: null, basis: 0 };
  let sum = 0;
  for (const r of races) {
    let p = 0;
    if (r.paceType === 'H' || r.paceType === 'Ｈ') {
      if (r.rank && r.rank <= 3) p += 6; else if (r.rank && r.rank <= 5) p += 2.5;
    }
    if (r.last3f != null) {
      if (r.last3f < 37) p += 3; else if (r.last3f > 40) p -= 3; // バテ指標
    }
    sum += p;
  }
  return { raw: sum / races.length, basis: races.length };
}
function rawFormTrend(np) {
  // 直近重視の加重平均（np は oldest-first 想定 → 末尾が直近）
  const usable = np.filter(r => r.rank != null);
  if (usable.length === 0) return { raw: null, basis: 0 };
  const recent = usable.slice(-5).reverse(); // 直近5走、直近から
  const weights = [1.0, 0.8, 0.6, 0.4, 0.2];
  let t = 0, w = 0;
  for (let i = 0; i < recent.length; i++) { t += finishToScore(recent[i].rank) * weights[i]; w += weights[i]; }
  return { raw: w ? t / w : null, basis: recent.length };
}
function rawTrackCompat(np, curVenue) {
  const cv = (curVenue || '').replace('競馬', '');
  if (!cv) return { raw: null, basis: 0 };
  const same = np.filter(r => r.venue && (r.venue.includes(cv) || cv.includes(r.venue)) && r.rank != null);
  if (same.length === 0) return { raw: null, basis: 0 };
  const good = same.filter(r => r.rank <= 3).length;
  return { raw: good / same.length, basis: same.length };
}
function rawDistanceFitness(np, curDm) {
  if (!curDm) return { raw: null, basis: 0 };
  const same = np.filter(r => r.distanceMeters != null && Math.abs(r.distanceMeters - curDm) <= 200 && r.rank != null);
  if (same.length === 0) return { raw: null, basis: 0 };
  let good = 0;
  for (const r of same) { if (r.rank <= 3) good += 1; else if (r.rank <= 5) good += 0.5; }
  return { raw: good / same.length, basis: same.length };
}
function rawJockey(horse) {
  const role = horse.assignment || '無';
  const base = ROLE_SCORE[role] != null ? ROLE_SCORE[role] : 35;
  const pt = toNum(horse.totalScore) || 0;
  return { raw: base + pt * 0.1, basis: 0 }; // basis=0: 過去走非依存（常に算出可）
}

// ============================================================================
// jra-v1 専用 raw（final3F/paceType 非依存。horseHistories の
// finish/distanceMeters/surface/venue/date/popularity/entryCount を主材料）。
// np は newest-first（horseHistories.history 由来の並び）。
// nankan-v1 の raw* 関数は一切変更しない。
// ============================================================================
const RW = [1, 0.8, 0.6, 0.4, 0.25, 0.15, 0.1, 0.08, 0.06, 0.05]; // recency 加重
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** 着順の質。entryCount があれば頭数補正(relFinish)を 25% ブレンド */
function qual(r) {
  const pq = finishToScore(r.rank);
  if (r.entryCount != null && r.entryCount > 1) {
    const rel = (1 - (r.rank - 1) / (r.entryCount - 1)) * 100;
    return pq * 0.75 + rel * 0.25;
  }
  return pq;
}
function wavg(arr, fn) {
  let n = 0, d = 0;
  arr.forEach((r, i) => { const w = RW[i] != null ? RW[i] : 0.04; n += fn(r) * w; d += w; });
  return d ? n / d : 0;
}
function avgQual(arr) { return arr.length ? arr.reduce((s, r) => s + qual(r), 0) / arr.length : null; }
function slope(points) { // [[x,y]] 単回帰の傾き
  const n = points.length; if (n < 2) return 0;
  const sx = points.reduce((s, p) => s + p[0], 0), sy = points.reduce((s, p) => s + p[1], 0);
  const sxx = points.reduce((s, p) => s + p[0] * p[0], 0), sxy = points.reduce((s, p) => s + p[0] * p[1], 0);
  const den = n * sxx - sx * sx; return den ? (n * sxy - sx * sy) / den : 0;
}

function rawSpeedJra(np, curDm) {
  const us = np.filter(r => r.rank != null);
  if (us.length === 0) return { raw: null, basis: 0 };
  const term1 = wavg(us, qual);                                   // 着順の質（全走・直近重視）
  const goodRate = us.filter(r => r.rank <= 3).length / us.length; // 好走率
  const boardRate = us.filter(r => r.rank <= 5).length / us.length; // 掲示板率
  let band = (curDm ? us.filter(r => r.distanceMeters != null && Math.abs(r.distanceMeters - curDm) <= 400) : []);
  let bandCoef = 1; if (band.length === 0) { band = us; bandCoef = 0.5; }
  const term4 = wavg(band, qual) * bandCoef;                      // 今回距離帯のパフォーマンス
  const opVals = us.filter(r => r.popularity != null).map(r => clamp(r.popularity - r.rank, -10, 10));
  const opAvg = opVals.length ? opVals.reduce((a, b) => a + b, 0) / opVals.length : 0;
  const opScore = (opAvg + 10) / 20 * 100;                        // 人気以上の好走（市場期待超過）
  let bonus = 0;                                                  // final3F は補助加点のみ
  const f3 = us.filter(r => r.last3f != null);
  if (f3.length) bonus = (f3.filter(r => r.last3f < 37).length / f3.length) * 5;
  const raw = 0.40 * term1 + 0.20 * goodRate * 100 + 0.15 * boardRate * 100 + 0.20 * term4 + 0.05 * opScore + bonus;
  return { raw, basis: us.length };
}

function rawStaminaJra(np, curDm) {
  const us = np.filter(r => r.rank != null);
  if (us.length === 0) return { raw: null, basis: 0 };
  let longSet = (curDm ? us.filter(r => r.distanceMeters != null && r.distanceMeters >= curDm - 200) : []);
  let longCoef = 1; if (longSet.length === 0) { longSet = us; longCoef = 0.5; }
  const term1 = wavg(longSet, qual) * longCoef;                   // 今回以上/近距離での好走
  const chrono = [...us].reverse();                               // oldest-first（延長検出用）
  let extAcc = 0, extCnt = 0;
  for (let i = 1; i < chrono.length; i++) {
    const prev = chrono[i - 1], cur = chrono[i];
    if (prev.distanceMeters != null && cur.distanceMeters != null && cur.distanceMeters > prev.distanceMeters + 100) {
      extCnt++; extAcc += (cur.rank <= 3 ? 100 : cur.rank <= 5 ? 60 : 20);
    }
  }
  const term2 = extCnt ? extAcc / extCnt : 50;                    // 距離延長への対応（機会なければ中立50）
  const pts = us.filter(r => r.distanceMeters != null).map(r => [r.distanceMeters, qual(r)]);
  const term3 = pts.length >= 2 ? clamp(50 + slope(pts) * 600, 0, 100) : 50; // distance↑でも質維持か
  const goodLong = longSet.filter(r => r.rank <= 3).length / longSet.length;
  let bonus = 0;                                                  // paceType は補助加点のみ
  const ph = us.filter(r => r.paceType === 'H' || r.paceType === 'Ｈ');
  if (ph.length) bonus = (ph.filter(r => r.rank <= 3).length / ph.length) * 5;
  const raw = 0.45 * term1 + 0.25 * term2 + 0.20 * term3 + 0.10 * goodLong * 100 + bonus;
  return { raw, basis: us.length };
}

function rawFormTrendJra(np) {
  const us = np.filter(r => r.rank != null);
  if (us.length === 0) return { raw: null, basis: 0 };
  const base = wavg(us.slice(0, 5), qual);                        // 直近5走の加重平均（newest-first）
  const a1 = avgQual(us.slice(0, 3)), a0 = avgQual(us.slice(3, 6));
  const trend = (a1 != null && a0 != null) ? clamp(50 + (a1 - a0), 0, 100) : 50; // 上昇基調なら>50
  return { raw: 0.70 * base + 0.30 * trend, basis: us.length };
}

function rawTrackCompatJra(np, curVenue, curSurface) {
  const us = np.filter(r => r.rank != null);
  if (us.length === 0) return { raw: null, basis: 0 };
  const cv = (curVenue || '').replace('競馬', '');
  const t1 = us.filter(r => r.venue && cv && (r.venue.includes(cv) || cv.includes(r.venue))); // 同競馬場
  const t2 = curSurface ? us.filter(r => r.surface === curSurface) : [];                       // 同surface
  const gr = set => set.filter(r => r.rank <= 3).length / set.length * 100;
  let raw;
  if (t1.length && t2.length) raw = (gr(t1) * 1.0 + gr(t2) * 0.6) / 1.6;
  else if (t1.length) raw = gr(t1);
  else if (t2.length) raw = gr(t2);
  else return { raw: null, basis: 0 };                            // 同場も同surfaceも無 → insufficient
  const basis = new Set([...t1, ...t2]).size;
  return { raw, basis };
}

function rawDistanceFitnessJra(np, curDm) {
  const usAll = np.filter(r => r.rank != null);
  if (usAll.length === 0) return { raw: null, basis: 0 };
  const q = set => { let g = 0; set.forEach(r => { g += r.rank <= 3 ? 1 : r.rank <= 5 ? 0.5 : 0; }); return g / set.length * 100; };
  if (!curDm) return { raw: q(usAll), basis: usAll.length };       // 今回距離不明 → 全体ベースライン
  const usDm = usAll.filter(r => r.distanceMeters != null);
  const t1 = usDm.filter(r => Math.abs(r.distanceMeters - curDm) <= 200);
  const t2 = usDm.filter(r => Math.abs(r.distanceMeters - curDm) <= 400);
  let acc = 0, wsum = 0;
  if (t1.length) { acc += q(t1) * 1.0; wsum += 1.0; }             // ±200m
  if (t2.length) { acc += q(t2) * 0.6; wsum += 0.6; }             // ±400m
  acc += q(usAll) * 0.2; wsum += 0.2;                            // 全体ベースライン（常時）
  const basis = t1.length || t2.length || usAll.length;
  return { raw: wsum ? acc / wsum : null, basis };
}

// ============================================================================
// 相対化（レース内 z-score → [12,96]）+ 検査
// ============================================================================
const FEATURES = ['speedIndex', 'staminaRating', 'formTrend', 'trackCompatibility', 'distanceFitness', 'jockeyFactor'];
const MIN_BASIS = 2; // jockeyFactor を除く

function scaleFeature(raws, key, uniformFlags, raceNumber, minBasis = MIN_BASIS) {
  // raws: [{ horseNumber, raw, basis }]
  const exempt = key === 'jockeyFactor';
  const qualifying = raws.filter(r => r.raw != null && (exempt || r.basis >= minBasis));
  const result = new Map(); // horseNumber → {value, confidence, basis}

  // まず全馬を insufficient で初期化
  for (const r of raws) {
    const conf = (exempt || r.basis >= minBasis) ? null : 'insufficient';
    result.set(r.horseNumber, { value: null, confidence: r.raw == null ? 'insufficient' : conf, basis: r.basis });
  }
  if (qualifying.length === 0) return result;

  const vals = qualifying.map(r => r.raw);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  const sd = Math.sqrt(variance);

  if (qualifying.length > 1 && sd < 1e-9) {
    // 全頭同値 → 識別不能。value=null/insufficient + 警告
    uniformFlags.push({ raceNumber, feature: key, horses: qualifying.length });
    for (const r of qualifying) result.set(r.horseNumber, { value: null, confidence: 'insufficient', basis: r.basis });
    return result;
  }

  // 順位付け用に value を計算
  const scored = [];
  for (const r of qualifying) {
    const z = sd > 0 ? (r.raw - mean) / sd : 0;
    let value = Math.max(12, Math.min(96, Math.round(56 + 18 * z)));
    // 50/100 を予約値として出力域から除外（万一出たら相対化バグの検知シグナルになる）。
    // 50 は z-score が偶然この整数に丸まることがあるため 1 ずらす。100 は clamp 96 で原理的に出ない。
    if (value === 50) value = 49;
    if (value === 100) value = 99;
    let confidence = 'high';
    if (!exempt) confidence = r.basis >= 4 ? 'high' : (r.basis >= 2 ? 'medium' : 'low');
    scored.push({ horseNumber: r.horseNumber, value, confidence, basis: r.basis });
  }
  scored.sort((a, b) => b.value - a.value);
  scored.forEach((s, idx) => {
    result.set(s.horseNumber, { value: s.value, rank: idx + 1, confidence: s.confidence, basis: s.basis });
  });
  return result;
}

// ============================================================================
// shared 保存（--push）。PUT 対象は featureScores パスのみ。dispatch なし。
// ============================================================================
const putRel = `${opts.category}/featureScores/${y}/${m}/${opts.date}-${opts.venue}.json`;

function assertPutPath(rel) {
  if (!PUT_ALLOW.test(rel)) {
    console.error(`SAFETY ABORT: PUT 対象が featureScores パスではありません: ${rel}`);
    process.exit(3);
  }
  // category とパス接頭辞の整合（jra→jra/..., nankan→nankan/...）
  if (!rel.startsWith(`${opts.category}/featureScores/`)) {
    console.error(`SAFETY ABORT: category(${opts.category}) と PUT パスが不整合: ${rel}`);
    process.exit(3);
  }
}

/** keiba-data-shared の Contents API GET（既存 sha / 内容取得）。read only */
async function ghGetContents(rel) {
  const token = process.env.GITHUB_TOKEN_KEIBA_DATA_SHARED;
  const url = `https://api.github.com/repos/${PUT_OWNER}/${PUT_REPO}/contents/${rel}?ref=${PUT_BRANCH}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
  if (res.status === 404) return { exists: false, sha: null, json: null };
  if (!res.ok) throw new Error(`GET ${rel} status=${res.status}`);
  const body = await res.json();
  const content = Buffer.from(body.content || '', 'base64').toString('utf-8');
  let json = null; try { json = JSON.parse(content); } catch { /* 既存が壊れていても backup はする */ }
  return { exists: true, sha: body.sha, json, raw: content };
}

/** featureScores JSON を PUT。assertPutPath を必ず通す。dispatch は呼ばない。 */
async function ghPutContents(rel, obj, sha) {
  assertPutPath(rel); // 二重ガード
  const token = process.env.GITHUB_TOKEN_KEIBA_DATA_SHARED;
  const url = `https://api.github.com/repos/${PUT_OWNER}/${PUT_REPO}/contents/${rel}`;
  const payload = {
    message: `chore(featureScores): ${opts.category} ${opts.date}-${opts.venue} (${ENGINE})`,
    content: Buffer.from(JSON.stringify(obj, null, 2), 'utf-8').toString('base64'),
    branch: PUT_BRANCH,
  };
  if (sha) payload.sha = sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`PUT ${rel} status=${res.status} ${await res.text()}`);
  return res.json();
}

function summarizeDiff(oldJson, newOut) {
  const countHorses = j => j && j.races ? Object.values(j.races).reduce((s, r) => s + Object.keys(r.horses || {}).length, 0) : 0;
  const nullCounts = j => {
    const acc = Object.fromEntries(FEATURES.map(f => [f, 0]));
    if (j && j.races) for (const r of Object.values(j.races)) for (const h of Object.values(r.horses || {}))
      for (const f of FEATURES) if (!h.featureScores || h.featureScores[f]?.value == null) acc[f]++;
    return acc;
  };
  return {
    races: { old: oldJson ? Object.keys(oldJson.races || {}).length : 0, new: Object.keys(newOut.races).length },
    horses: { old: countHorses(oldJson), new: countHorses(newOut) },
    generatedAt: { old: oldJson?.generatedAt || null, new: newOut.generatedAt },
    nullOld: oldJson ? nullCounts(oldJson) : null,
    nullNew: newOut.report.nullSummary,
  };
}

/** 既存ファイルを tmp/feature-scores/backup/ にローカル退避（shared には書かない） */
function backupExistingLocal(raw, oldJson) {
  const stamp = (oldJson?.generatedAt || new Date().toISOString()).replace(/[:.]/g, '-');
  const rel = path.join('tmp', 'feature-scores', 'backup', `${opts.date}-${opts.venue}.${stamp}.json`);
  const abs = path.resolve(process.cwd(), rel);
  const tmpRoot = path.resolve(process.cwd(), 'tmp') + path.sep;
  if (!abs.startsWith(tmpRoot)) { console.error('SAFETY ABORT: backup 先が tmp/ 外'); process.exit(3); }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, raw, 'utf-8');
  return rel;
}

/** PUT ゲート：engine混在OK かつ fixed50/100 OK のときのみ true（全頭同値・nullは中止条件にしない） */
function putGateOk(report) {
  return report.engineCheck.ok && report.fixedValueCheck.ok;
}

// ============================================================================
// メイン
// ============================================================================
async function main() {
  const racebook = await loadJSON(racebookRel);
  const hh = opts.category === 'jra' ? await loadJSON(horseHistRel, true) : null;
  if (opts.category === 'jra' && !hh) {
    console.warn(`⚠️ horseHistories が見つかりません（${horseHistRel}）。racebook pastRaces のみで構築します。`);
  }

  // horseHistories 馬名 index
  const hhByName = new Map();
  if (hh && hh.horses) {
    for (const id of Object.keys(hh.horses)) {
      const e = hh.horses[id];
      if (e.horseName) hhByName.set(e.horseName, e);
    }
  }

  const venueNameCur = racebook.track || (hh && hh.venue) || '';
  const out = {
    engine: ENGINE,
    category: opts.category,
    date: opts.date,
    venue: venueNameCur,
    venueCode: opts.venue,
    generatedAt: new Date().toISOString(),
    races: {},
    report: {},
  };

  const uniformFlags = [];
  const fixedHits = [];   // value===50 || value===100
  const nullSummary = Object.fromEntries(FEATURES.map(f => [f, 0]));
  const engineViolations = [];
  let horseTotal = 0, noHistory = 0;

  for (const race of racebook.races || []) {
    const rNo = race.raceNumber;
    const curDm = distanceMetersOf(race);
    const curSurface = race.surface || surfaceFromDistance(race.distance);
    const horseBlocks = {};
    const rawByFeature = Object.fromEntries(FEATURES.map(f => [f, []]));

    for (const horse of race.horses || []) {
      horseTotal++;
      const hhEntry = opts.category === 'jra' ? hhByName.get(horse.name) : null;
      const np = opts.category === 'jra' ? normalizeJra(horse, hhEntry, opts.date) : normalizeNankan(horse);
      const usableCount = np.filter(r => r.isUsable).length;
      if (usableCount === 0) noHistory++;

      let rawS, rawSt, rawF, rawT, rawD;
      if (ENGINE === 'jra-v1') {
        rawS = rawSpeedJra(np, curDm); rawSt = rawStaminaJra(np, curDm); rawF = rawFormTrendJra(np);
        rawT = rawTrackCompatJra(np, venueNameCur, curSurface); rawD = rawDistanceFitnessJra(np, curDm);
      } else {
        rawS = rawSpeed(np); rawSt = rawStamina(np); rawF = rawFormTrend(np);
        rawT = rawTrackCompat(np, venueNameCur); rawD = rawDistanceFitness(np, curDm);
      }
      const rawJ = rawJockey(horse);
      rawByFeature.speedIndex.push({ horseNumber: horse.number, ...rawS });
      rawByFeature.staminaRating.push({ horseNumber: horse.number, ...rawSt });
      rawByFeature.formTrend.push({ horseNumber: horse.number, ...rawF });
      rawByFeature.trackCompatibility.push({ horseNumber: horse.number, ...rawT });
      rawByFeature.distanceFitness.push({ horseNumber: horse.number, ...rawD });
      rawByFeature.jockeyFactor.push({ horseNumber: horse.number, ...rawJ });

      horseBlocks[horse.number] = {
        raceNumber: rNo,
        horseNumber: horse.number,
        engine: ENGINE,
        sourceRefs: {
          horseHistories: opts.category === 'jra' && !!hhEntry,
          racebookPastRaces: (horse.pastRaces || []).length,
          recentRaces: opts.category === 'nankan' ? (horse.pastRaces || []).length : 0,
        },
        normalizedPastRaces: np,
        featureScores: {}, // 後段で埋める
        dataQuality: {
          usableRaceCount: usableCount,
          nullFeatures: [],
          horseLevel: usableCount === 0 ? 'no-history' : (usableCount < 3 ? 'sparse' : 'ok'),
        },
      };

      // engine 混在検査
      if (ENGINE === 'nankan-v1' && horseBlocks[horse.number].sourceRefs.horseHistories) {
        engineViolations.push({ raceNumber: rNo, horseNumber: horse.number, reason: 'nankan-v1 with horseHistories' });
      }
      if (ENGINE === 'jra-v1' && horseBlocks[horse.number].sourceRefs.recentRaces > 0) {
        engineViolations.push({ raceNumber: rNo, horseNumber: horse.number, reason: 'jra-v1 with recentRaces path' });
      }
    }

    // 特徴量ごとに相対化
    const scaled = {};
    const minBasis = ENGINE === 'jra-v1' ? 1 : MIN_BASIS; // jra: usable>=1 で出す / nankan: 現行(2)維持
    for (const f of FEATURES) scaled[f] = scaleFeature(rawByFeature[f], f, uniformFlags, rNo, minBasis);

    // horse block に featureScores を書き戻し
    for (const hn of Object.keys(horseBlocks)) {
      const block = horseBlocks[hn];
      const fs6 = {};
      for (const f of FEATURES) {
        const s = scaled[f].get(block.horseNumber) || { value: null, confidence: 'insufficient', basis: 0 };
        fs6[f] = {
          value: s.value != null ? s.value : null,
          rank: s.rank != null ? s.rank : null,
          confidence: s.confidence || 'insufficient',
          basisRaces: s.basis != null ? s.basis : 0,
        };
        if (s.value == null) { nullSummary[f]++; block.dataQuality.nullFeatures.push(f); }
        if (s.value === 50 || s.value === 100) fixedHits.push({ raceNumber: rNo, horseNumber: block.horseNumber, feature: f, value: s.value });
      }
      block.featureScores = fs6;
    }

    out.races[rNo] = { raceNumber: rNo, distanceMeters: curDm, venue: venueNameCur, horses: horseBlocks };
  }

  out.report = {
    engineCheck: { ok: engineViolations.length === 0, expected: ENGINE, violations: engineViolations },
    fixedValueCheck: { ok: fixedHits.length === 0, count50: fixedHits.filter(h => h.value === 50).length, count100: fixedHits.filter(h => h.value === 100).length, samples: fixedHits.slice(0, 10) },
    uniformCheck: { ok: uniformFlags.length === 0, flagged: uniformFlags },
    nullSummary,
    coverage: { horses: horseTotal, noHistory },
  };

  // ----- 書き込み（tmp/ のみ・実行時アサート） -----
  const outRel = path.join('tmp', 'feature-scores', `${opts.date}-${opts.venue}.json`);
  const outAbs = path.resolve(process.cwd(), outRel);
  const tmpRoot = path.resolve(process.cwd(), 'tmp') + path.sep;
  if (!outAbs.startsWith(tmpRoot)) {
    console.error(`SAFETY ABORT: 書き込み先が tmp/ 配下ではありません: ${outAbs}`);
    process.exit(3);
  }
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, JSON.stringify(out, null, 2), 'utf-8');

  // ----- レポート出力 -----
  console.log('\n========================================');
  console.log(`Feature Scores dry-run: ${opts.category} ${opts.date} ${opts.venue} (engine=${ENGINE})`);
  console.log('========================================');
  console.log(`出力: ${outRel}`);
  console.log(`レース数: ${Object.keys(out.races).length} / 馬数: ${horseTotal} / 過去走なし馬: ${noHistory}`);
  console.log('\n[engine 混在検査] ' + (out.report.engineCheck.ok ? 'OK' : `NG (${engineViolations.length}件)`));
  if (!out.report.engineCheck.ok) console.log('  ', JSON.stringify(engineViolations.slice(0, 5)));
  console.log(`[固定値 50/100 検査] ` + (out.report.fixedValueCheck.ok ? 'OK (0件)' : `NG (50:${out.report.fixedValueCheck.count50} / 100:${out.report.fixedValueCheck.count100})`));
  if (!out.report.fixedValueCheck.ok) console.log('  samples', JSON.stringify(out.report.fixedValueCheck.samples));
  console.log(`[全頭同値検査] ` + (out.report.uniformCheck.ok ? 'OK' : `警告 ${uniformFlags.length}件`));
  if (!out.report.uniformCheck.ok) console.log('  ', JSON.stringify(uniformFlags.slice(0, 10)));
  console.log('[null / insufficient 件数（特徴量別 / 全馬中）]');
  for (const f of FEATURES) console.log(`  ${f.padEnd(20)}: ${nullSummary[f]} / ${horseTotal}`);

  // サンプル: 1R 上位3頭の featureScores
  const firstRaceNo = Object.keys(out.races)[0];
  if (firstRaceNo) {
    const horses = Object.values(out.races[firstRaceNo].horses).slice(0, 3);
    console.log(`\n[サンプル R${firstRaceNo} 先頭3頭]`);
    for (const h of horses) {
      const fv = Object.fromEntries(FEATURES.map(f => [f, h.featureScores[f].value]));
      console.log(`  #${h.horseNumber} usable=${h.dataQuality.usableRaceCount} level=${h.dataQuality.horseLevel} ${JSON.stringify(fv)}`);
    }
  }
  // ----- shared 保存（--push 指定時のみ）。未指定は dry-run のまま終了 -----
  if (!opts.push) {
    console.log('\n（--push 未指定 = dry-run。shared 書き込み・GitHub PUT・dispatch は一切行っていません）\n');
    return;
  }

  // PUT ゲート：engine混在 / fixed50,100 が NG なら PUT しない
  console.log('\n----- shared 保存（--push）-----');
  console.log(`PUT 先: ${PUT_OWNER}/${PUT_REPO}:${PUT_BRANCH} / ${putRel}`);
  assertPutPath(putRel);
  if (!putGateOk(out.report)) {
    console.error('❌ 保存前検査 NG（engine混在 or fixed50/100）。PUT を中止します。');
    process.exit(4);
  }

  // 事前 GET（既存 sha / 内容）
  const existing = await ghGetContents(putRel);
  if (existing.exists) {
    const diff = summarizeDiff(existing.json, out);
    console.log('既存ファイルあり → 差分要約:');
    console.log(`  races:  ${diff.races.old} → ${diff.races.new}`);
    console.log(`  horses: ${diff.horses.old} → ${diff.horses.new}`);
    console.log(`  generatedAt: ${diff.generatedAt.old} → ${diff.generatedAt.new}`);
    console.log(`  null(new): ${JSON.stringify(diff.nullNew)}`);
    if (diff.nullOld) console.log(`  null(old): ${JSON.stringify(diff.nullOld)}`);
    const backupRel = backupExistingLocal(existing.raw, existing.json);
    console.log(`  既存を退避: ${backupRel}`);
  } else {
    console.log('既存なし → 新規作成');
  }

  // PUT 実行（dispatch は呼ばない）
  await ghPutContents(putRel, out, existing.sha);
  console.log(`✅ PUT 完了: ${putRel}`);
  console.log('（dispatch は実装していません。表示反映は既存リビルド周期に依存します）\n');
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
