/**
 * Phase 1-A2: 1 ファイル単位 pastRaces 後追い補完 dryRun 専用同期 Function。
 *
 * 目的:
 *   Background Function (enrich-past-races-background.mjs) の console.log 出力が
 *   Netlify CLI/API から取得できない問題を回避するため、HTTP レスポンス JSON で
 *   補完統計を直接返す同期 Function。
 *
 *   同期 Function なので Netlify のタイムアウト上限 (Free: 10秒 / Pro: 26秒)
 *   内に処理を収める必要がある。共通ロジックは Background 版と同じものを再利用。
 *
 * ★★★ このファイルでは絶対に実装しないこと ★★★
 *   - GitHub PUT (Contents API の PUT 呼び出し)
 *   - dispatch (repository_dispatch / workflow trigger)
 *   - dryRun=false 分岐
 *   - 保存処理側 (save-keiba-book / save-computer) への干渉
 *   そのため、共通 lib から PUT 用の関数も import しない。
 *
 * 入力 (POST body JSON):
 *   {
 *     category: 'jra'|'nankan',
 *     date: 'YYYY-MM-DD',
 *     venueCode: 'XXX'   (例: TOK)
 *   }
 *   ※ dryRun フラグは受け取らない（常に dryRun=true 相当）。
 *
 * 出力 (HTTP 200 application/json):
 *   {
 *     ok: true,
 *     dryRun: true,
 *     category, date, venueCode,
 *     racebook: { distanceMeters/distance/surface の BEFORE/AFTER/rate, issues 集計 },
 *     computer: { 同上 },
 *     diff: { pastRacesCountDelta, orderMismatches, ... },
 *     putExecuted: false,
 *     dispatchExecuted: false,
 *   }
 */

import {
  enrichOneFilePair,
  analyzeDistance,
  diffCheck,
} from '../lib/past-races-post-enricher.mjs';

const REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'apol0510';
const REPO_NAME = 'keiba-data-shared';
const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;

// ============================================================================
// 入力検証
// ============================================================================
function validateInput(body) {
  const errors = [];
  const { category, date, venueCode } = body || {};
  if (!['jra', 'nankan'].includes(category)) errors.push(`category must be jra|nankan (got: ${category})`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) errors.push(`date must be YYYY-MM-DD (got: ${date})`);
  if (!/^[A-Z]{3}$/.test(venueCode || '')) errors.push(`venueCode must be 3 uppercase letters (got: ${venueCode})`);
  return errors;
}

// ============================================================================
// GitHub Contents API GET のみ (PUT は意図的に未実装)
// ============================================================================
async function fetchContent(relPath, token) {
  const url = `${API_BASE}/${relPath}`;
  const headers = {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'keiba-data-shared-admin-dryrun',
  };
  const res = await fetch(url, { headers });
  if (res.status === 404) return { exists: false };
  if (!res.ok) throw new Error(`GET ${url} status=${res.status}`);
  const file = await res.json();
  const decoded = Buffer.from(file.content, 'base64').toString('utf-8');
  return { exists: true, data: JSON.parse(decoded) };
}

// ============================================================================
// 比率計算
// ============================================================================
function rate(n, t) {
  if (t <= 0) return 0;
  return Number(((n / t) * 100).toFixed(1));
}

// ============================================================================
// レスポンス JSON 構築
// ============================================================================
function buildFillRateBlock(beforeStats, afterStats) {
  const total = afterStats.total;
  const mk = (name) => ({
    before: beforeStats[name],
    after: afterStats[name],
    total,
    rateBefore: rate(beforeStats[name], beforeStats.total),
    rateAfter: rate(afterStats[name], total),
  });
  return {
    total,
    distance: mk('distance'),
    distanceMeters: mk('distanceMeters'),
    distanceGaiji: mk('distanceGaiji'),
    surface: mk('surface'),
    raceName: mk('raceName'),
    popularity: mk('popularity'),
    margin: mk('margin'),
    final3F: mk('final3F'),
    bodyWeightDiff: mk('bodyWeightDiff'),
  };
}

// ============================================================================
// メイン処理
// ============================================================================
async function runDryRun({ category, date, venueCode }, token) {
  const [year, month] = date.split('-');
  const racebookRel = `${category}/racebook/${year}/${month}/${date}-${venueCode}.json`;
  const computerRel = `${category}/predictions/computer/${year}/${month}/${date}-${venueCode}.json`;

  const racebookFetch = await fetchContent(racebookRel, token);
  const computerFetch = await fetchContent(computerRel, token);

  if (!racebookFetch.exists) {
    return { ok: false, reason: 'racebook-not-found', path: racebookRel };
  }
  if (!computerFetch.exists) {
    return { ok: false, reason: 'computer-not-found', path: computerRel };
  }

  const rbBefore = racebookFetch.data;
  const cpBefore = computerFetch.data;
  const rbBeforeStats = analyzeDistance(rbBefore);
  const cpBeforeStats = analyzeDistance(cpBefore);

  // deep clone してから補完 (元データは破壊しない)
  const rbAfter = JSON.parse(JSON.stringify(rbBefore));
  const cpAfter = JSON.parse(JSON.stringify(cpBefore));
  const enrichStats = await enrichOneFilePair(rbAfter, cpAfter, { category, raceDate: date });

  const rbAfterStats = analyzeDistance(rbAfter);
  const cpAfterStats = analyzeDistance(cpAfter);

  const rbDiff = diffCheck(rbBefore, rbAfter);
  const cpDiff = diffCheck(cpBefore, cpAfter);

  // ★★★ PUT も dispatch も呼ばない（コードに存在させない） ★★★

  return {
    ok: true,
    dryRun: true,
    putExecuted: false,
    dispatchExecuted: false,
    category,
    date,
    venueCode,
    paths: { racebook: racebookRel, computer: computerRel },
    racebook: {
      fillRate: buildFillRateBlock(rbBeforeStats, rbAfterStats),
      decoder: {
        mapSize: enrichStats.racebook.decoderMapSize,
        distanceMetersApplied: enrichStats.racebook.decode.distanceMetersApplied,
        surfaceApplied: enrichStats.racebook.decode.surfaceApplied,
        distanceStringApplied: enrichStats.racebook.decode.distanceStringApplied,
        leftNullDistanceMeters: enrichStats.racebook.decode.leftNullDistanceMeters,
        gaijiMissing: enrichStats.racebook.decode.gaijiMissing,
      },
      conflicts: {
        distance: enrichStats.racebook.conflicts.distance.length,
        surface: enrichStats.racebook.conflicts.surface.length,
        surfaceDetail: enrichStats.racebook.conflicts.surface.slice(0, 10),
      },
      diff: {
        issues: rbDiff.issues.length,
        pastRacesCountDelta: rbDiff.stats.pastRacesCountDelta,
        orderMismatches: rbDiff.stats.orderMismatches,
        preserveBreaks: rbDiff.stats.preserveBreaks,
        horseFieldBreaks: rbDiff.stats.horseFieldBreaks,
        darkHorsesChanged: rbDiff.stats.darkHorsesChanged,
        predictionsChanged: rbDiff.stats.predictionsChanged,
        firstIssues: rbDiff.issues.slice(0, 10),
      },
    },
    computer: {
      fillRate: buildFillRateBlock(cpBeforeStats, cpAfterStats),
      decoder: {
        mapSize: enrichStats.computer.decoderMapSize,
        distanceMetersApplied: enrichStats.computer.decode.distanceMetersApplied,
        surfaceApplied: enrichStats.computer.decode.surfaceApplied,
        distanceStringApplied: enrichStats.computer.decode.distanceStringApplied,
      },
      backfill: enrichStats.computer.backfill,
      conflicts: {
        distance: enrichStats.computer.conflicts.distance.length,
        surface: enrichStats.computer.conflicts.surface.length,
      },
      diff: {
        issues: cpDiff.issues.length,
        pastRacesCountDelta: cpDiff.stats.pastRacesCountDelta,
        orderMismatches: cpDiff.stats.orderMismatches,
        preserveBreaks: cpDiff.stats.preserveBreaks,
        horseFieldBreaks: cpDiff.stats.horseFieldBreaks,
        darkHorsesChanged: cpDiff.stats.darkHorsesChanged,
        predictionsChanged: cpDiff.stats.predictionsChanged,
        firstIssues: cpDiff.issues.slice(0, 10),
      },
    },
  };
}

// ============================================================================
// handler (同期 Function、10秒 timeout 想定 / Pro なら 26秒)
// ============================================================================
export const handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ ok: false, error: 'Invalid JSON', detail: e.message }) };
  }

  const errors = validateInput(body);
  if (errors.length > 0) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ ok: false, errors }) };
  }

  const token = process.env.GITHUB_TOKEN_KEIBA_DATA_SHARED;
  if (!token) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ ok: false, error: 'GITHUB_TOKEN_KEIBA_DATA_SHARED missing' }) };
  }

  const startedAt = Date.now();
  try {
    const result = await runDryRun({
      category: body.category,
      date: body.date,
      venueCode: body.venueCode,
    }, token);
    result.elapsedMs = Date.now() - startedAt;
    return { statusCode: 200, headers: cors, body: JSON.stringify(result) };
  } catch (e) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({
        ok: false,
        error: e.message,
        elapsedMs: Date.now() - startedAt,
      }),
    };
  }
};
