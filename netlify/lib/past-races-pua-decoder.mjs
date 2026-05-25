/**
 * pastRaces PUA 距離デコーダ（段階 C）
 *
 * 役割:
 * - results 突合の後段で、まだ distanceMeters=null のままの past race に対し、
 *   distanceGaiji (PUA 外字 1文字) を手掛かりに distance を確定する。
 * - 同一 keibabook PDF 内では同じ PUA codepoint は同じ距離を意味することが
 *   高頻度で確認されている (output.xml 実測で 96% gaiji 捕捉 + 14 codepoint で
 *   conflict 0)。これを per-PDF bootstrap で活用する。
 *
 * 重要方針:
 * - **per-PDF bootstrap を primary**: 同 data 内で (distanceGaiji, distanceMeters)
 *   ペアが取れた codepoint のみで map を構築し、それを優先適用する。
 * - **seed map は限定 fallback**: per-PDF に含まれない codepoint だけに seed を
 *   適用する。font subset が PDF ごとに変わる可能性を尊重し、静的 map を
 *   絶対正解扱いにしない。
 * - **conflict は null のまま**: 同一 codepoint で複数 distance が混在 (95% 未満)
 *   の場合は推測しない。
 * - **既存値非破壊**: distanceMeters が既に入っていれば一切上書きしない。
 *   他フィールド (distance 文字列、surface、margin、jockey、time 等) は触らない。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 注意: top-level で fileURLToPath(import.meta.url) を呼ぶと、
// Netlify Functions の CJS バンドルでは import.meta.url が undefined になり
// モジュールロード時に TypeError でクラッシュする。
// → path 解決は loadSeedMap() 内で遅延 + try/catch で行う。

const MAJORITY_THRESHOLD = 0.95; // 多数決で確定とみなす閾値

function gaijiToHex(g) {
  if (!g || typeof g !== 'string' || g.length === 0) return null;
  return g.charCodeAt(0).toString(16).toUpperCase();
}

/**
 * data 内の past races から (gaiji, distanceMeters) ペアを集めて per-PDF map を構築。
 * 同一 codepoint で複数 distance が出た場合:
 *   - 多数派が 95% 以上を占める → 多数派を採用
 *   - そうでない → 該当 codepoint は map から除外 (=null のまま)
 *
 * @param {object} data
 * @returns {{ map: Object<string, number>, conflicts: Array }}
 */
export function buildPerPdfMap(data) {
  const candidates = new Map(); // hex -> { distMeters: count }
  if (!data || !Array.isArray(data.races)) return { map: {}, conflicts: [] };

  for (const race of data.races) {
    if (!Array.isArray(race.horses)) continue;
    for (const horse of race.horses) {
      for (const pr of (horse.pastRaces || [])) {
        const hex = gaijiToHex(pr.distanceGaiji);
        const d = pr.distanceMeters;
        if (!hex || d == null) continue;
        if (!candidates.has(hex)) candidates.set(hex, {});
        const m = candidates.get(hex);
        m[d] = (m[d] || 0) + 1;
      }
    }
  }

  const map = {};
  const conflicts = [];
  for (const [hex, distances] of candidates.entries()) {
    const entries = Object.entries(distances);
    if (entries.length === 1) {
      map[hex] = Number(entries[0][0]);
      continue;
    }
    const total = entries.reduce((s, [, n]) => s + n, 0);
    const sorted = entries.sort((a, b) => b[1] - a[1]);
    const topRatio = sorted[0][1] / total;
    if (topRatio >= MAJORITY_THRESHOLD) {
      map[hex] = Number(sorted[0][0]);
    } else {
      conflicts.push({ hex, distribution: Object.fromEntries(sorted) });
    }
  }
  return { map, conflicts };
}

let _seedMapCache = null;
let _seedMapMeta = null;

/**
 * 静的 seed map をロード（fallback 専用）。
 * pua-distance-map.json が無い・壊れている場合は空マップを返す。
 */
export function loadSeedMap() {
  if (_seedMapCache) return { map: _seedMapCache, meta: _seedMapMeta };
  try {
    // path 解決は遅延評価。Netlify CJS バンドルで import.meta.url=undefined になっても
    // ここで catch されるので、モジュールロードはクラッシュしない。
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const seedPath = path.join(dir, 'pua-distance-map.json');
    if (!fs.existsSync(seedPath)) {
      _seedMapCache = {};
      _seedMapMeta = { source: 'missing' };
      return { map: _seedMapCache, meta: _seedMapMeta };
    }
    const raw = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
    _seedMapCache = raw.map || {};
    _seedMapMeta = { source: 'pua-distance-map.json', builtAt: raw._builtAt, stats: raw.stats };
    return { map: _seedMapCache, meta: _seedMapMeta };
  } catch (e) {
    console.warn('[PuaDecoder] seed map load failed:', e.message);
    _seedMapCache = {};
    _seedMapMeta = { source: 'error', error: e.message };
    return { map: _seedMapCache, meta: _seedMapMeta };
  }
}

/**
 * data 内の past races のうち distanceMeters==null かつ distanceGaiji 既知の
 * ものに対し、per-PDF map → seed map の順で適用して distanceMeters を埋める。
 *
 * - 既存値は触らない（distanceMeters が non-null の past race は無変更）
 * - 他フィールド (distance 文字列、surface、time、jockey、weight 等) は触らない
 * - per-PDF で確定 → source='per-pdf'
 * - per-PDF になく seed map で確定 → source='seed'
 * - どちらにもない → null のまま
 *
 * @returns {object} stats { perPdfMapSize, seedMapSize, perPdfApplied, seedApplied,
 *                            leftNull, leftNullReasons, conflicts, perPdfVsSeedDiff }
 */
export function decodeDataPastRaces(data, opts = {}) {
  const stats = {
    perPdfMapSize: 0,
    perPdfMap: {},
    seedMapSize: 0,
    perPdfApplied: 0,
    seedApplied: 0,
    leftNull: 0,
    leftNullReasons: { gaijiMissing: 0, noMapMatch: 0 },
    conflicts: [],
    perPdfVsSeedDiff: [],
  };
  if (!data || !Array.isArray(data.races)) return stats;

  const { map: perPdfMap, conflicts } = buildPerPdfMap(data);
  const { map: seedMap } = loadSeedMap();

  stats.perPdfMapSize = Object.keys(perPdfMap).length;
  stats.perPdfMap = perPdfMap;
  stats.seedMapSize = Object.keys(seedMap).length;
  stats.conflicts = conflicts;

  // per-PDF と seed の差異を記録（per-PDF を優先するが、参考情報として残す）
  for (const [hex, d] of Object.entries(perPdfMap)) {
    if (seedMap[hex] != null && seedMap[hex] !== d) {
      stats.perPdfVsSeedDiff.push({ hex, perPdf: d, seed: seedMap[hex] });
    }
  }

  for (const race of data.races) {
    if (!Array.isArray(race.horses)) continue;
    for (const horse of race.horses) {
      for (const pr of (horse.pastRaces || [])) {
        if (pr.distanceMeters != null) continue; // 既存値非破壊
        const hex = gaijiToHex(pr.distanceGaiji);
        if (!hex) {
          stats.leftNull++;
          stats.leftNullReasons.gaijiMissing++;
          continue;
        }
        // per-PDF を最優先
        if (perPdfMap[hex] != null) {
          pr.distanceMeters = perPdfMap[hex];
          stats.perPdfApplied++;
          continue;
        }
        // fallback: seed map
        if (seedMap[hex] != null) {
          pr.distanceMeters = seedMap[hex];
          stats.seedApplied++;
          continue;
        }
        stats.leftNull++;
        stats.leftNullReasons.noMapMatch++;
      }
    }
  }

  console.log(
    `[PuaDecoder] map sizes — per-PDF: ${stats.perPdfMapSize} codepoint(s) ` +
    `(conflicts excluded: ${stats.conflicts.length}) / seed (fallback): ${stats.seedMapSize}`
  );
  if (stats.perPdfVsSeedDiff.length > 0) {
    console.log(
      `[PuaDecoder] per-PDF と seed の差異: ${stats.perPdfVsSeedDiff.length} codepoint (per-PDF 採用)`
    );
    for (const d of stats.perPdfVsSeedDiff.slice(0, 5)) {
      console.log(`  U+${d.hex}: perPDF=${d.perPdf}m vs seed=${d.seed}m`);
    }
  }
  console.log(
    `[PuaDecoder] decoded ${stats.perPdfApplied + stats.seedApplied} past races ` +
    `(per-PDF: ${stats.perPdfApplied}, seed-fallback: ${stats.seedApplied}) ` +
    `/ still null: ${stats.leftNull} ` +
    `(gaiji-missing: ${stats.leftNullReasons.gaijiMissing}, no-map-match: ${stats.leftNullReasons.noMapMatch})`
  );

  return stats;
}
