/**
 * Phase 1-A: 1 ファイル単位 pastRaces 後追い補完 Background Function。
 *
 * 目的:
 *   save-keiba-book / save-computer の保存処理から切り離した後追いで、
 *   pastRaces (distance / distanceMeters / distanceGaiji / surface) を補完する。
 *
 * 入力 (POST body JSON):
 *   {
 *     category: 'jra'|'nankan',
 *     date: 'YYYY-MM-DD',
 *     venueCode: 'XXX',  (例: TOK)
 *     dryRun: true|false  (デフォルト true)
 *   }
 *
 * 出力:
 *   Netlify Background Function は HTTP 202 を即時返却する (handler の return は
 *   クライアントに到達しない)。実際の処理結果は Netlify Functions ログを参照すること。
 *
 * 非同期処理 (最大 15 分):
 *   1. keiba-data-shared から racebook と computer を fetch
 *   2. 補完: racebook = normalize + enrichByResults + 拡張 decoder
 *           computer = normalize + racebook backfill + 拡張 decoder
 *   3. 差分検証: pastRaces 件数、並び順、既存値、darkHorses、predictions が
 *      変わっていないこと
 *   4. dryRun=true: ログのみ
 *   5. dryRun=false: 差分検証 OK のときだけ GitHub Contents API で PUT
 *      (racebook と computer の両方を独立に判定。片方 NG なら片方だけ PUT)
 *   6. dispatch は Phase 1 では発火しない
 *
 * 注意:
 *   - save-keiba-book / save-computer の保存処理には一切干渉しない
 *   - ENABLE_PAST_RACES_PIPELINE 環境変数とは独立 (この Function は常に動く)
 *   - 認証は netlify.toml の Basic Auth に依存
 *     (Netlify Functions URL を直接叩かれるリスクは既存 functions と同様)
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
  const { category, date, venueCode, dryRun } = body || {};
  if (!['jra', 'nankan'].includes(category)) errors.push(`category must be jra|nankan (got: ${category})`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) errors.push(`date must be YYYY-MM-DD (got: ${date})`);
  if (!/^[A-Z]{3}$/.test(venueCode || '')) errors.push(`venueCode must be 3 uppercase letters (got: ${venueCode})`);
  if (dryRun != null && typeof dryRun !== 'boolean') errors.push(`dryRun must be boolean (got: ${typeof dryRun})`);
  return errors;
}

// ============================================================================
// GitHub Contents API
// ============================================================================
function authHeaders(token) {
  return {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'keiba-data-shared-admin-post-enricher',
  };
}

async function fetchContent(relPath, token) {
  const url = `${API_BASE}/${relPath}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (res.status === 404) return { exists: false };
  if (!res.ok) throw new Error(`GET ${url} status=${res.status}`);
  const file = await res.json();
  const decoded = Buffer.from(file.content, 'base64').toString('utf-8');
  return { exists: true, data: JSON.parse(decoded), sha: file.sha };
}

async function putContent(relPath, data, sha, message, token) {
  const url = `${API_BASE}/${relPath}`;
  const payload = {
    message,
    content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
    branch: 'main',
  };
  if (sha) payload.sha = sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`PUT ${url} status=${res.status} body=${txt.slice(0, 300)}`);
  }
  const result = await res.json();
  return { htmlUrl: result.content?.html_url };
}

// ============================================================================
// 充足率の整形
// ============================================================================
function pct(n, t) { return t > 0 ? `${((n / t) * 100).toFixed(1)}%` : '-'; }

function logFillRate(label, before, after) {
  const rows = [
    ['distance',       before.distance,        after.distance],
    ['distanceMeters', before.distanceMeters,  after.distanceMeters],
    ['distanceGaiji',  before.distanceGaiji,   after.distanceGaiji],
    ['surface',        before.surface,         after.surface],
    ['raceName',       before.raceName,        after.raceName],
    ['popularity',     before.popularity,      after.popularity],
    ['margin',         before.margin,          after.margin],
    ['final3F',        before.final3F,         after.final3F],
    ['bodyWeightDiff', before.bodyWeightDiff,  after.bodyWeightDiff],
  ];
  for (const [name, b, a] of rows) {
    console.log(`[Enrich] ${label} ${name.padEnd(16)} ${b}/${before.total} (${pct(b, before.total)}) → ${a}/${after.total} (${pct(a, after.total)})  Δ=${a - b > 0 ? '+' : ''}${a - b}`);
  }
}

// ============================================================================
// メイン処理
// ============================================================================
async function runEnrich({ category, date, venueCode, dryRun }, token) {
  const taskId = `${category}-${date}-${venueCode}-${dryRun ? 'dry' : 'put'}-${Date.now()}`;
  console.log(`[Enrich] === START taskId=${taskId} dryRun=${dryRun} ===`);

  const [year, month] = date.split('-');
  const racebookRel = `${category}/racebook/${year}/${month}/${date}-${venueCode}.json`;
  const computerRel = `${category}/predictions/computer/${year}/${month}/${date}-${venueCode}.json`;

  // --- fetch ---
  console.log(`[Enrich] fetching racebook: ${racebookRel}`);
  const racebookFetch = await fetchContent(racebookRel, token);
  console.log(`[Enrich] fetching computer: ${computerRel}`);
  const computerFetch = await fetchContent(computerRel, token);

  if (!racebookFetch.exists) {
    console.warn(`[Enrich] ❌ racebook not found: ${racebookRel} → 補完中止 (どちらか欠けたら PUT しない)`);
    return { ok: false, reason: 'racebook-not-found' };
  }
  if (!computerFetch.exists) {
    console.warn(`[Enrich] ❌ computer not found: ${computerRel} → 補完中止 (どちらか欠けたら PUT しない)`);
    return { ok: false, reason: 'computer-not-found' };
  }

  // --- BEFORE 統計 ---
  const rbBefore = racebookFetch.data;
  const cpBefore = computerFetch.data;
  const rbBeforeStats = analyzeDistance(rbBefore);
  const cpBeforeStats = analyzeDistance(cpBefore);

  // --- 補完 (deep clone してから) ---
  const rbAfter = JSON.parse(JSON.stringify(rbBefore));
  const cpAfter = JSON.parse(JSON.stringify(cpBefore));
  const enrichStats = await enrichOneFilePair(rbAfter, cpAfter, { category, raceDate: date });

  const rbAfterStats = analyzeDistance(rbAfter);
  const cpAfterStats = analyzeDistance(cpAfter);

  // --- 差分検証 ---
  const rbDiff = diffCheck(rbBefore, rbAfter);
  const cpDiff = diffCheck(cpBefore, cpAfter);

  // --- 充足率ログ ---
  logFillRate('racebook', rbBeforeStats, rbAfterStats);
  logFillRate('computer', cpBeforeStats, cpAfterStats);

  // --- decoder 統計ログ ---
  console.log(`[Enrich] racebook decoder map size: ${enrichStats.racebook.decoderMapSize}`);
  console.log(`[Enrich] racebook decode applied (dm/sf/ds): ${enrichStats.racebook.decode.distanceMetersApplied}/${enrichStats.racebook.decode.surfaceApplied}/${enrichStats.racebook.decode.distanceStringApplied}`);
  console.log(`[Enrich] racebook conflicts (distance/surface): ${enrichStats.racebook.conflicts.distance.length}/${enrichStats.racebook.conflicts.surface.length}`);
  console.log(`[Enrich] computer decoder map size: ${enrichStats.computer.decoderMapSize}`);
  console.log(`[Enrich] computer decode applied (dm/sf/ds): ${enrichStats.computer.decode.distanceMetersApplied}/${enrichStats.computer.decode.surfaceApplied}/${enrichStats.computer.decode.distanceStringApplied}`);
  console.log(`[Enrich] computer conflicts (distance/surface): ${enrichStats.computer.conflicts.distance.length}/${enrichStats.computer.conflicts.surface.length}`);

  // --- backfill ログ ---
  const bf = enrichStats.computer.backfill;
  console.log(`[Enrich] backfill horses: ${bf.cpHorsesMatched}/${bf.cpHorsesTotal} matched, no-rb=${bf.cpHorsesNoRacebookCounterpart}`);
  console.log(`[Enrich] backfill pastRaces: matched=${bf.pastRacesMatched}/${bf.pastRacesTotal}, key-missing=${bf.pastRacesKeyMissing}, no-rb=${bf.pastRacesNoRbCounterpart}, dup-rb=${bf.pastRacesDuplicateRb}, dup-cp=${bf.pastRacesDuplicateCp}`);
  console.log(`[Enrich] backfill fields: ${JSON.stringify(bf.fieldsApplied)}`);

  // --- 非破壊性ログ ---
  console.log(`[Enrich] racebook diff: pastRacesΔ=${rbDiff.stats.pastRacesCountDelta}, orderMis=${rbDiff.stats.orderMismatches}, prBreaks=${rbDiff.stats.preserveBreaks}, horseBreaks=${rbDiff.stats.horseFieldBreaks}, darkHorses=${rbDiff.stats.darkHorsesChanged}, predictions=${rbDiff.stats.predictionsChanged} → issues=${rbDiff.issues.length}`);
  console.log(`[Enrich] computer diff: pastRacesΔ=${cpDiff.stats.pastRacesCountDelta}, orderMis=${cpDiff.stats.orderMismatches}, prBreaks=${cpDiff.stats.preserveBreaks}, horseBreaks=${cpDiff.stats.horseFieldBreaks}, darkHorses=${cpDiff.stats.darkHorsesChanged}, predictions=${cpDiff.stats.predictionsChanged} → issues=${cpDiff.issues.length}`);
  for (const i of rbDiff.issues.slice(0, 10)) console.warn(`[Enrich] racebook issue: ${i}`);
  for (const i of cpDiff.issues.slice(0, 10)) console.warn(`[Enrich] computer issue: ${i}`);

  // --- dryRun 判定 ---
  if (dryRun) {
    console.log(`[Enrich] === DRY-RUN END taskId=${taskId} (PUT skipped) ===`);
    return {
      ok: true,
      dryRun: true,
      racebook: { before: rbBeforeStats, after: rbAfterStats, issues: rbDiff.issues.length },
      computer: { before: cpBeforeStats, after: cpAfterStats, issues: cpDiff.issues.length },
    };
  }

  // --- 本 PUT (差分検証 OK のときだけ、racebook/computer 独立判定) ---
  const result = { ok: true, dryRun: false, racebook: null, computer: null };

  if (rbDiff.issues.length === 0) {
    const distFill = pct(rbAfterStats.distanceMeters, rbAfterStats.total);
    const surfFill = pct(rbAfterStats.surface, rbAfterStats.total);
    const msg = `🔧 pastRaces補完: ${date} ${venueCode} racebook (dm=${distFill} sf=${surfFill})\n\nCo-Authored-By: keiba-data-shared-admin <noreply@anthropic.com>`;
    console.log(`[Enrich] PUT racebook: ${racebookRel}`);
    const putRes = await putContent(racebookRel, rbAfter, racebookFetch.sha, msg, token);
    result.racebook = { put: true, htmlUrl: putRes.htmlUrl };
    console.log(`[Enrich] PUT racebook 完了: ${putRes.htmlUrl}`);
  } else {
    console.warn(`[Enrich] ❌ racebook diff issues=${rbDiff.issues.length} → PUT SKIP`);
    result.racebook = { put: false, reason: 'diff-issues', issues: rbDiff.issues.length };
  }

  if (cpDiff.issues.length === 0) {
    const distFill = pct(cpAfterStats.distanceMeters, cpAfterStats.total);
    const surfFill = pct(cpAfterStats.surface, cpAfterStats.total);
    const msg = `🔧 pastRaces補完: ${date} ${venueCode} computer (dm=${distFill} sf=${surfFill})\n\nCo-Authored-By: keiba-data-shared-admin <noreply@anthropic.com>`;
    console.log(`[Enrich] PUT computer: ${computerRel}`);
    const putRes = await putContent(computerRel, cpAfter, computerFetch.sha, msg, token);
    result.computer = { put: true, htmlUrl: putRes.htmlUrl };
    console.log(`[Enrich] PUT computer 完了: ${putRes.htmlUrl}`);
  } else {
    console.warn(`[Enrich] ❌ computer diff issues=${cpDiff.issues.length} → PUT SKIP`);
    result.computer = { put: false, reason: 'diff-issues', issues: cpDiff.issues.length };
  }

  console.log(`[Enrich] === END taskId=${taskId} dryRun=false ===`);
  console.log(`[Enrich] dispatch は Phase 1 では発火しません (Phase 2 で追加予定)`);
  return result;
}

// ============================================================================
// handler
// ============================================================================
export const handler = async (event) => {
  // ※ -background サフィックス付き Function は、Netlify が HTTP 202 を即時返却する。
  //   handler の戻り値はクライアントに到達せず、ログのみが残る。
  console.log(`[Enrich] handler invoked: method=${event.httpMethod}`);

  if (event.httpMethod !== 'POST') {
    console.warn(`[Enrich] reject: method=${event.httpMethod}`);
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    console.warn(`[Enrich] reject: invalid JSON body: ${e.message}`);
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const errors = validateInput(body);
  if (errors.length > 0) {
    console.warn(`[Enrich] reject: validation errors: ${errors.join('; ')}`);
    return { statusCode: 400, body: JSON.stringify({ errors }) };
  }

  const token = process.env.GITHUB_TOKEN_KEIBA_DATA_SHARED;
  if (!token) {
    console.error(`[Enrich] ❌ GITHUB_TOKEN_KEIBA_DATA_SHARED missing`);
    return { statusCode: 500, body: 'token missing' };
  }

  const dryRun = body.dryRun !== false; // デフォルト true
  try {
    const result = await runEnrich({
      category: body.category,
      date: body.date,
      venueCode: body.venueCode,
      dryRun,
    }, token);
    console.log(`[Enrich] result: ${JSON.stringify(result)}`);
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (e) {
    console.error(`[Enrich] ❌ unhandled error: ${e.message}\n${e.stack}`);
    return { statusCode: 500, body: e.message };
  }
};
