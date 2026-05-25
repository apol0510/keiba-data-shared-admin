/**
 * Phase 1-A: 後追い pastRaces 補完の共通ロジック。
 *
 * 用途:
 *   - Background Function (enrich-past-races-background.mjs) から呼ばれる
 *   - 同じロジックをローカル検証スクリプトからも再利用できる
 *
 * 仕様:
 *   1. racebook: normalize → enrichByResults → 拡張 decoder
 *      - 拡張 decoder は PUA codepoint から (distanceMeters, surface) を学習
 *      - distance 文字列 ("ダ1400" 等) も自動組み立て
 *      - 既存値は絶対に上書きしない
 *      - 多数派 95% 未満は conflict として推測補完しない
 *   2. computer: racebook の補完済 pastRaces から backfill
 *      - 馬名 + (venue, finish, time, jockey) で 1 対 1 同定
 *      - 曖昧 (duplicate / key missing) は skip
 *      - 既存値は絶対に上書きしない
 *   3. 差分検証: pastRaces 件数、並び順、既存値、darkHorses、predictions、
 *      horse-level fields (marks/role/customScore/computerIndex 等) すべてが
 *      変わっていないことを確認する。NG なら呼び出し側で PUT を中止する。
 *
 * 重要方針:
 *   - 共通データ契約 (admin/shared 側で完結) を維持する
 *   - 表示側 (intelligence/analytics) を一切触らない前提
 *   - 推測補完は禁止（95% 多数派閾値、conflict 件数は呼び出し側にレポート）
 */

import { normalizeDataPastRaces } from './past-races-normalizer.mjs';
import { enrichByResults } from './past-races-enricher.mjs';

const MAJORITY_THRESHOLD = 0.95;

// ============================================================================
// 拡張 PUA decoder (distanceMeters + surface + distance 文字列 同時補完)
// ============================================================================
export function extractSurfaceFromDistance(s) {
  if (!s || typeof s !== 'string') return null;
  if (/ダ/.test(s)) return 'ダ';
  if (/芝/.test(s)) return '芝';
  if (/障/.test(s)) return '障';
  return null;
}

function gaijiToHex(g) {
  if (!g || typeof g !== 'string' || g.length === 0) return null;
  return g.charCodeAt(0).toString(16).toUpperCase();
}

/**
 * 拡張 per-PDF map: (gaijiHex) -> { distanceMeters, surface }
 * - distanceMeters と surface はそれぞれ独立に多数派 95% 集計
 * - 95% 未満は conflict として除外 (= null のまま残す)
 */
export function buildExtendedPerPdfMap(data) {
  const distMetersCount = new Map();
  const surfaceCount = new Map();
  const conflicts = { distance: [], surface: [] };
  if (!data || !Array.isArray(data.races)) return { map: {}, conflicts };

  for (const race of data.races) {
    if (!Array.isArray(race.horses)) continue;
    for (const horse of race.horses) {
      for (const pr of (horse.pastRaces || [])) {
        const hex = gaijiToHex(pr.distanceGaiji);
        if (!hex) continue;
        if (pr.distanceMeters != null) {
          if (!distMetersCount.has(hex)) distMetersCount.set(hex, new Map());
          const m = distMetersCount.get(hex);
          m.set(pr.distanceMeters, (m.get(pr.distanceMeters) || 0) + 1);
        }
        const surf = pr.surface || extractSurfaceFromDistance(pr.distance);
        if (surf) {
          if (!surfaceCount.has(hex)) surfaceCount.set(hex, new Map());
          const m = surfaceCount.get(hex);
          m.set(surf, (m.get(surf) || 0) + 1);
        }
      }
    }
  }

  const resolveMajority = (counts) => {
    const entries = [...counts.entries()];
    if (entries.length === 0) return { value: null, conflict: false };
    if (entries.length === 1) return { value: entries[0][0], conflict: false };
    const total = entries.reduce((s, [, n]) => s + n, 0);
    const sorted = entries.sort((a, b) => b[1] - a[1]);
    const topRatio = sorted[0][1] / total;
    if (topRatio >= MAJORITY_THRESHOLD) return { value: sorted[0][0], conflict: false };
    return { value: null, conflict: true, distribution: Object.fromEntries(sorted) };
  };

  const map = {};
  const allHex = new Set([...distMetersCount.keys(), ...surfaceCount.keys()]);
  for (const hex of allHex) {
    const dm = distMetersCount.has(hex) ? resolveMajority(distMetersCount.get(hex)) : { value: null };
    const sf = surfaceCount.has(hex) ? resolveMajority(surfaceCount.get(hex)) : { value: null };
    if (dm.conflict) conflicts.distance.push({ hex, distribution: dm.distribution });
    if (sf.conflict) conflicts.surface.push({ hex, distribution: sf.distribution });
    map[hex] = { distanceMeters: dm.value, surface: sf.value };
  }
  return { map, conflicts };
}

/**
 * 拡張 decoder 適用 (in-place):
 * - distanceMeters / surface は元 null のときだけ埋める
 * - distance 文字列も元 null かつ surface + distanceMeters が両方確定なら組み立てる
 * - 既存値は絶対に上書きしない
 */
export function applyExtendedDecode(data, map) {
  const stats = {
    distanceMetersApplied: 0,
    surfaceApplied: 0,
    distanceStringApplied: 0,
    leftNullDistanceMeters: 0,
    leftNullSurface: 0,
    leftNullDistanceString: 0,
    gaijiMissing: 0,
  };
  if (!data || !Array.isArray(data.races)) return stats;
  for (const race of data.races) {
    if (!Array.isArray(race.horses)) continue;
    for (const horse of race.horses) {
      for (const pr of (horse.pastRaces || [])) {
        const hex = gaijiToHex(pr.distanceGaiji);
        if (!hex) {
          if (pr.distanceMeters == null) { stats.gaijiMissing++; stats.leftNullDistanceMeters++; }
          if (pr.surface == null) stats.leftNullSurface++;
          if (pr.distance == null) stats.leftNullDistanceString++;
          continue;
        }
        const entry = map[hex];
        if (!entry) {
          if (pr.distanceMeters == null) stats.leftNullDistanceMeters++;
          if (pr.surface == null) stats.leftNullSurface++;
          if (pr.distance == null) stats.leftNullDistanceString++;
          continue;
        }
        if (pr.distanceMeters == null && entry.distanceMeters != null) {
          pr.distanceMeters = entry.distanceMeters;
          stats.distanceMetersApplied++;
        }
        if (pr.surface == null && entry.surface != null) {
          pr.surface = entry.surface;
          stats.surfaceApplied++;
        }
        if (pr.distance == null && pr.surface != null && pr.distanceMeters != null) {
          pr.distance = `${pr.surface}${pr.distanceMeters}`;
          stats.distanceStringApplied++;
        }
        if (pr.distanceMeters == null) stats.leftNullDistanceMeters++;
        if (pr.surface == null) stats.leftNullSurface++;
        if (pr.distance == null) stats.leftNullDistanceString++;
      }
    }
  }
  return stats;
}

// ============================================================================
// racebook → computer backfill
// ============================================================================
function normalizeHorseName(s) {
  return String(s || '').replace(/\s/g, '').normalize('NFKC');
}
function pastRaceKey(pr) {
  if (!pr) return null;
  const v = pr.venue, f = pr.finish, t = pr.time, j = pr.jockey;
  if (!v || f == null || !t || !j) return null;
  return `${v}|${f}|${t}|${j}`;
}

const BACKFILL_FIELDS = [
  'distance', 'distanceMeters', 'distanceGaiji', 'surface',
  'raceName', 'popularity', 'margin', 'bodyWeightDiff', 'final3F',
];

/**
 * racebook の補完済 pastRaces から computer の pastRaces を補完。
 * - 馬名一致 + pastRaceKey (venue + finish + time + jockey) 一致のものを 1 対 1 マッチ
 * - 既存値は絶対に上書きしない (元 null のフィールドだけ埋める)
 * - racebook 側に同 key が 2 件以上なら 'duplicate' でマーク → skip
 * - computer 側に同 key が 2 件以上ある場合も skip
 */
export function backfillComputerFromRacebook(racebookData, computerData) {
  const rbHorses = new Map();
  for (const race of (racebookData?.races || [])) {
    for (const horse of (race.horses || [])) {
      const name = normalizeHorseName(horse.name);
      if (!rbHorses.has(name)) rbHorses.set(name, new Map());
      const prMap = rbHorses.get(name);
      for (const pr of (horse.pastRaces || [])) {
        const k = pastRaceKey(pr);
        if (!k) continue;
        if (prMap.has(k)) prMap.set(k, 'duplicate');
        else prMap.set(k, pr);
      }
    }
  }

  const stats = {
    cpHorsesTotal: 0,
    cpHorsesMatched: 0,
    cpHorsesNoRacebookCounterpart: 0,
    pastRacesTotal: 0,
    pastRacesMatched: 0,
    pastRacesKeyMissing: 0,
    pastRacesNoRbCounterpart: 0,
    pastRacesDuplicateRb: 0,
    pastRacesDuplicateCp: 0,
    fieldsApplied: Object.fromEntries(BACKFILL_FIELDS.map(f => [f, 0])),
  };

  for (const race of (computerData?.races || [])) {
    for (const horse of (race.horses || [])) {
      stats.cpHorsesTotal++;
      const name = normalizeHorseName(horse.name);
      const rbMap = rbHorses.get(name);
      if (!rbMap) {
        stats.cpHorsesNoRacebookCounterpart++;
        stats.pastRacesNoRbCounterpart += (horse.pastRaces || []).length;
        continue;
      }
      const cpKeyCount = new Map();
      for (const pr of (horse.pastRaces || [])) {
        const k = pastRaceKey(pr);
        if (!k) continue;
        cpKeyCount.set(k, (cpKeyCount.get(k) || 0) + 1);
      }
      let matched = false;
      for (const pr of (horse.pastRaces || [])) {
        stats.pastRacesTotal++;
        const k = pastRaceKey(pr);
        if (!k) { stats.pastRacesKeyMissing++; continue; }
        if (cpKeyCount.get(k) > 1) { stats.pastRacesDuplicateCp++; continue; }
        const rbPr = rbMap.get(k);
        if (rbPr === undefined) { stats.pastRacesNoRbCounterpart++; continue; }
        if (rbPr === 'duplicate') { stats.pastRacesDuplicateRb++; continue; }
        let touched = false;
        for (const f of BACKFILL_FIELDS) {
          if (pr[f] == null && rbPr[f] != null) {
            pr[f] = rbPr[f];
            stats.fieldsApplied[f]++;
            touched = true;
          }
        }
        if (touched) { stats.pastRacesMatched++; matched = true; }
      }
      if (matched) stats.cpHorsesMatched++;
    }
  }
  return stats;
}

// ============================================================================
// 充足率カウント
// ============================================================================
export function analyzeDistance(data) {
  let total = 0, distance = 0, distanceMeters = 0, distanceGaiji = 0,
      raceName = 0, surface = 0, popularity = 0, margin = 0, final3F = 0, bodyWeightDiff = 0;
  for (const race of (data?.races || [])) {
    for (const horse of (race.horses || [])) {
      for (const pr of (horse.pastRaces || [])) {
        total++;
        if (pr.distance != null) distance++;
        if (pr.distanceMeters != null) distanceMeters++;
        if (pr.distanceGaiji != null) distanceGaiji++;
        if (pr.raceName != null) raceName++;
        if (pr.surface != null) surface++;
        if (pr.popularity != null) popularity++;
        if (pr.margin != null) margin++;
        if (pr.final3F != null) final3F++;
        if (pr.bodyWeightDiff != null) bodyWeightDiff++;
      }
    }
  }
  return { total, distance, distanceMeters, distanceGaiji, raceName, surface, popularity, margin, final3F, bodyWeightDiff };
}

// ============================================================================
// 非破壊性検証
// ============================================================================
const PR_PRESERVE = [
  'venue', 'raceClass', 'finish', 'jockey', 'weight', 'time',
  'paceType', 'paceRank', 'bodyWeight', 'final3F', 'winner',
  'courseNote', 'cond', 'distance', 'distanceMeters', 'distanceGaiji',
  'raceName', 'surface', 'popularity', 'margin', 'bodyWeightDiff',
];
const HORSE_PRESERVE = [
  'name', 'number', 'frame', 'jockey', 'weight', 'bodyWeight', 'trainer',
  'sexAge', 'marks', 'role', 'roleLabel', 'customScore', 'score',
  'computerIndex', 'printPriority',
];

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * before / after を比較して既存値が破壊されていないか検証。
 * @returns {{ issues: string[], stats: object }}
 *   issues.length === 0 のときだけ呼び出し側は PUT してよい。
 */
export function diffCheck(before, after) {
  const issues = [];
  const stats = {
    racesCount: { before: (before?.races || []).length, after: (after?.races || []).length },
    pastRacesCountDelta: 0,
    orderMismatches: 0,
    preserveBreaks: 0,
    horseFieldBreaks: 0,
    darkHorsesChanged: 0,
    predictionsChanged: 0,
  };
  if (stats.racesCount.before !== stats.racesCount.after) {
    issues.push(`races count mismatch: ${stats.racesCount.before} → ${stats.racesCount.after}`);
  }
  if (before?.predictions && !deepEqual(before.predictions, after?.predictions)) {
    stats.predictionsChanged++;
    issues.push(`data.predictions changed (top-level)`);
  }
  for (let ri = 0; ri < (before?.races || []).length; ri++) {
    const rb = before.races[ri];
    const ra = after?.races?.[ri];
    if (!ra) { issues.push(`R[${ri}] missing in after`); continue; }
    if (!deepEqual(rb.darkHorses || null, ra.darkHorses || null)) {
      stats.darkHorsesChanged++;
      issues.push(`R${rb.raceNumber} darkHorses changed`);
    }
    if (rb.predictions && !deepEqual(rb.predictions, ra.predictions)) {
      stats.predictionsChanged++;
      issues.push(`R${rb.raceNumber} predictions changed`);
    }
    for (let hi = 0; hi < (rb.horses || []).length; hi++) {
      const hb = rb.horses[hi];
      const ha = ra.horses?.[hi];
      if (!ha) { issues.push(`R${rb.raceNumber} horses[${hi}] missing`); continue; }
      for (const f of HORSE_PRESERVE) {
        if (hb[f] === undefined) continue;
        if (!deepEqual(hb[f], ha[f])) {
          stats.horseFieldBreaks++;
          issues.push(`R${rb.raceNumber} ${hb.name} ${f} changed`);
        }
      }
      const prB = hb.pastRaces || [];
      const prA = ha.pastRaces || [];
      if (prB.length !== prA.length) {
        stats.pastRacesCountDelta++;
        issues.push(`R${rb.raceNumber} ${hb.name} pastRaces count: ${prB.length} → ${prA.length}`);
      }
      for (let pi = 0; pi < prA.length; pi++) {
        const pb = prB[pi] || {};
        const pa = prA[pi];
        if ((pb.venue || null) !== pa.venue) {
          stats.orderMismatches++;
          issues.push(`R${rb.raceNumber} ${hb.name} past[${pi}] venue order changed`);
        }
        for (const f of PR_PRESERVE) {
          if (pb[f] == null) continue;
          if (!deepEqual(pb[f], pa[f])) {
            stats.preserveBreaks++;
            issues.push(`R${rb.raceNumber} ${hb.name} past[${pi}].${f}: ${JSON.stringify(pb[f])} → ${JSON.stringify(pa[f])}`);
          }
        }
      }
    }
  }
  return { issues, stats };
}

// ============================================================================
// オーケストレータ: racebook 補完 + computer backfill
// ============================================================================
/**
 * 1 venue 分の racebook と computer を後追い補完する。
 * 入力は deep clone した上で渡してください（呼び出し側で BEFORE/AFTER を保持するため）。
 *
 * @param {object} racebookData  racebook JSON (補完対象、in-place)
 * @param {object} computerData  computer JSON (補完対象、in-place)
 * @param {{category: 'jra'|'nankan', raceDate: string}} opts
 * @returns {Promise<object>} 統計情報
 */
export async function enrichOneFilePair(racebookData, computerData, { category, raceDate }) {
  // --- racebook: normalize → enrichByResults → 拡張 decoder ---
  normalizeDataPastRaces(racebookData);
  await enrichByResults(racebookData, { category, raceDate });
  const { map: rbMap, conflicts: rbConflicts } = buildExtendedPerPdfMap(racebookData);
  const rbDecodeStats = applyExtendedDecode(racebookData, rbMap);

  // --- computer: normalize → racebook backfill → 拡張 decoder (backfill 後) ---
  normalizeDataPastRaces(computerData);
  const backfillStats = backfillComputerFromRacebook(racebookData, computerData);
  const { map: cpMap, conflicts: cpConflicts } = buildExtendedPerPdfMap(computerData);
  const cpDecodeStats = applyExtendedDecode(computerData, cpMap);

  return {
    racebook: {
      decoderMapSize: Object.keys(rbMap).length,
      decode: rbDecodeStats,
      conflicts: rbConflicts,
    },
    computer: {
      decoderMapSize: Object.keys(cpMap).length,
      decode: cpDecodeStats,
      conflicts: cpConflicts,
      backfill: backfillStats,
    },
  };
}
