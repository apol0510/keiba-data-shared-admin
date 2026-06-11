/**
 * 南関 出馬表ページ（uma_shosai/{raceID}.do）HTML → parsedResult 直接マッピング（PR-F1b）
 *
 * 採用方針: 案b（HTML→parsedResult 直接マッピング）。
 * コピペ相当テキスト再構成（→parseEntriesText）は採用しない。
 * 理由: nankankeiba の出馬表HTMLは nk23_* class 等で構造化されており、direct mapping の方が堅牢。
 *
 * 厳守（純粋・副作用なし）:
 * - 取得しない / 保存しない / fetch しない / fs を触らない / DOM(window) に依存しない。
 * - 入力は「UTF-8 化済みHTML文字列 + metadata」。Shift_JIS→UTF-8 変換は呼び出し側（script）の責務。
 * - 対象は出馬表ページ（uma_shosai = レース出馬表）。**uma_info（馬単体・全履歴）とは別物・進まない**。
 * - featureScores / AI指数 / 印 / 買い目 / 穴馬 に接続しない。
 *
 * 出力: 既存 `nankan/entries` と同一 parsedResult schema（F2 validator にそのまま通せる）。
 *
 * 既知の制約（F1b 初回）:
 * - **record（着別 5分割 total/left/right/venue/distance × wins/seconds/thirds/unplaced）は
 *   uma_shosai 出馬表ページに存在しない**（当ページの成績欄は会場別/条件別の勝率・平均で別形式）。
 *   → record は 0 埋め（構造的には valid）で出力し、呼び出し側で「record 未取得（coverage 0%）」を明示する。
 *   着別 record の正本は番組表/成績ビュー由来であり、別ステップで補う。
 */

import * as cheerio from 'cheerio';

const RECENT_MAX = 5;

// uma_shosai 出馬表ページには着別 record（5分割）が無い（§28.1 / 契約§12.11）。
// → record は 0 埋めせず **null（未取得）** とし、sourceMeta で明示する（PR-F2b）。
const MISSING_RECORD_REASON = 'uma_shosai_no_record';

const clean = (s) => (s == null ? '' : String(s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim());
const toIntOrNull = (s) => {
  const m = clean(s).match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
};
const toFloatOrNull = (s) => {
  const m = clean(s).match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};

// "YY.M.D" / "YYYY.M.D" / "YYYYMMDD" → "YYYY-MM-DD"（不可なら ''）
function normalizeDate(raw) {
  const s = clean(raw);
  let m = s.match(/^(\d{8})$/);
  if (m) return `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`;
  m = s.match(/(\d{2,4})\.(\d{1,2})\.(\d{1,2})/);
  if (m) {
    let y = m[1];
    if (y.length === 2) y = `20${y}`;
    return `${y}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  }
  return '';
}

/**
 * レースヘッダ（raceName / startTime / surface / distance / direction / headCount / 検出date）を抽出。
 */
function parseRaceHeader($) {
  const header = {};
  header.raceName = clean($('.nk23_c-tab1__title__text').first().text());

  // タブ見出しブロックのテキストから距離・馬場・発走・頭数・日付を拾う
  const headText = clean($('.nk23_c-tab1').first().text()) || clean($('body').text().slice(0, 600));

  const dist = headText.match(/(ダ|芝)\s*([\d,]+)\s*m\s*(?:[（(]\s*(内|外|左|右|直)\s*[)）])?/);
  if (dist) {
    header.surface = dist[1] === 'ダ' ? 'ダート' : '芝';
    header.distance = dist[2].replace(/,/g, '');
    header.direction = dist[3] || '';
  } else {
    header.surface = ''; header.distance = ''; header.direction = '';
  }

  const st = headText.match(/発走時刻?\s*([0-2]?\d:[0-5]\d)/);
  header.startTime = st ? st[1] : '';

  const hc = headText.match(/[（(]\s*(\d{1,2})\s*頭\s*[)）]/);
  header.headCountText = hc ? parseInt(hc[1], 10) : null;

  const d = headText.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  header.detectedDate = d ? `${d[1]}-${String(d[2]).padStart(2, '0')}-${String(d[3]).padStart(2, '0')}` : '';

  // raceNumber は ID（呼び出し側 meta）優先だが、見出し "NR" からも拾える
  const rn = headText.match(/(?:^|\s)(\d{1,2})R(?:\s|$)/);
  header.raceNumber = rn ? parseInt(rn[1], 10) : null;

  return header;
}

/**
 * 1頭の <tr> から horse オブジェクトを構築。
 */
function parseHorseRow($, tr) {
  const $tr = $(tr);
  const horse = {
    postPosition: toIntOrNull($tr.find('td.waku').first().text()),
    number: toIntOrNull($tr.find('td.umaban').first().text()),
    name: '', gender: '', age: null, coat: '',
    weight: null, jockey: '', jockeyAffiliation: '',
    trainer: '', trainerAffiliation: '', owner: '', breeder: '',
    sire: '', bms: '',
    record: null,              // ← 当ページに着別 record 無し。0埋めせず null（未取得）。sourceMeta で明示。
    bestTime: '',
    recentRaces: []
  };

  // 馬名セル: 父(text12) / 馬名(uma_info link text16) / 性齢・毛色・生年(text10) / 母(text10) / 母父(text10)
  const $nameCell = $tr.find('td.pr-umaName-textRound').first();
  horse.sire = clean($nameCell.children('p.nk23_u-text12').first().text());
  horse.name = clean($nameCell.find('a[href*="/uma_info/"] .nk23_u-text16').first().text())
    || clean($nameCell.find('a[href*="/uma_info/"]').first().text());

  const text10s = $nameCell.children('p.nk23_u-text10').map((i, el) => clean($(el).text())).get();
  // 1つ目: 性齢 毛色 生年（例 "セ8 鹿毛 18.3.28"）
  if (text10s[0]) {
    const g = text10s[0].match(/(牡|牝|セ|騸)\s*(\d{1,2})/);
    if (g) { horse.gender = g[1]; horse.age = parseInt(g[2], 10); }
    const c = text10s[0].match(/(鹿毛|黒鹿毛|栗毛|栃栗毛|芦毛|青毛|青鹿毛|白毛)/);
    if (c) horse.coat = c[1];
  }
  // 最後の括弧書き = 母父(bms)、その手前の非括弧 = 母(dam・entries では未保持)
  for (let i = text10s.length - 1; i >= 1; i--) {
    const bm = text10s[i].match(/^[（(]\s*([^）)]+?)\s*[)）]$/);
    if (bm) { horse.bms = clean(bm[1]); break; }
  }

  // 騎手・斤量・調教師セル
  const $g1 = $tr.find('td.cs-g1').first();
  const $jk = $g1.find('a[href*="/kis_info/"]').first();
  horse.jockey = clean($jk.text());
  const jkAff = $jk.parent().find('span.nk23_u-text10').first().text();
  horse.jockeyAffiliation = clean(jkAff).replace(/[（()）]/g, '');
  horse.weight = toFloatOrNull($g1.find('span.nk23_u-text12').first().text());
  const $tr2 = $g1.find('a[href*="/cho_info/"]').first();
  horse.trainer = clean($tr2.text());
  const trAff = $tr2.parent().find('span.nk23_u-text10').first().text();
  horse.trainerAffiliation = clean(trAff).replace(/[（()）]/g, '');

  // recentRaces（cs-z1..cs-z5）
  for (let z = 1; z <= RECENT_MAX; z++) {
    const $cell = $tr.find(`td.cs-z${z}`).first();
    if ($cell.length === 0) continue;
    const rr = parseRecentCell($, $cell, z);
    if (rr) horse.recentRaces.push(rr);
  }

  return horse;
}

function parseRecentCell($, $cell, order) {
  const text = clean($cell.text());
  if (!text) return null;

  const rr = {
    order,
    finish: null, finishStatus: null,
    date: '', trackCondition: '', headCount: null,
    venue: '', direction: '', distance: null, postPosition: null,
    raceName: '', popularity: null, bodyWeight: '', jockey: '', weight: null,
    time: '', passingOrder: '', last3f: '', margin: '', opponentName: ''
  };

  // 着順 / 中止等
  const finRaw = clean($cell.find('.nk23_u-text19').first().text()).replace(/着/g, '');
  if (/^\d+$/.test(finRaw)) rr.finish = parseInt(finRaw, 10);
  else if (finRaw) rr.finishStatus = finRaw;

  // 日付（hidden rcd_ を最優先・無ければ "大井26.5.19" 等から）
  const rcd = $cell.find('input[id^="rcd_"]').first().attr('value');
  if (rcd) rr.date = normalizeDate(rcd);

  // venue + date テキスト "大井26.5.19"
  const venText = clean($cell.find('span.nk23_u-text10').filter((i, el) => /[一-龥]{2,}\d{2}\.\d/.test(clean($(el).text()))).first().text());
  let vm = venText.match(/^([一-龥ぁ-んァ-ヶ]+?)\s*(\d{2,4}\.\d{1,2}\.\d{1,2})/);
  if (vm) {
    rr.venue = vm[1];
    if (!rr.date) rr.date = normalizeDate(vm[2]);
  }

  // 馬場 + 距離 "良内ダ 1600"
  const condBlock = $cell.find('span.nk23_u-text10').map((i, el) => clean($(el).text())).get()
    .find(t => /(良|稍重|重|不良)/.test(t) && /\d{3,4}/.test(t));
  if (condBlock) {
    const tc = condBlock.match(/(不良|稍重|重|良)/);
    if (tc) rr.trackCondition = tc[1];
    const dm = condBlock.match(/(\d{3,4})/);
    if (dm) rr.distance = parseInt(dm[1], 10);
  }

  // raceName
  rr.raceName = clean($cell.find('a.race_name_len').first().attr('title') || $cell.find('a.race_name_len').first().text());

  // popularity "13頭 8番 4人気"
  const pop = clean($cell.find('span.popularity').first().text());
  const pm = pop.match(/(\d{1,2})頭/); if (pm) rr.headCount = parseInt(pm[1], 10);
  const bm = pop.match(/(\d{1,2})番/); if (bm) rr.postPosition = parseInt(bm[1], 10);
  const ppm = pop.match(/(\d{1,2})人気/); if (ppm) rr.popularity = parseInt(ppm[1], 10);

  // popularity の隣 span: 騎手 + 斤量
  const $popSpan = $cell.find('span.popularity').first();
  const jkSpan = clean($popSpan.next('span').text());
  if (jkSpan) {
    const jm = jkSpan.match(/^([^\d]+?)\s*([\d.]+)?$/);
    if (jm) { rr.jockey = clean(jm[1]); if (jm[2]) rr.weight = parseFloat(jm[2]); }
  }

  // 馬体重・勝ち馬
  rr.bodyWeight = (clean($cell.find('span.weight').first().text()).match(/\d+/) || [''])[0];
  rr.opponentName = clean($cell.find('span.winner').first().text());

  // タイム + 着差 "1:46.9 (2.2)"
  const rt = clean($cell.find('span.racetime').first().text());
  const tm = rt.match(/(\d:\d{2}\.\d)/); if (tm) rr.time = tm[1];
  const mg = rt.match(/[（(]\s*([\d.]+)\s*[)）]/); if (mg) rr.margin = mg[1];

  // 上り3F "3F 41.4 (6)"
  const ft = clean($cell.find('span.furlongtime').first().text());
  const lm = ft.match(/(\d{1,2}\.\d)/); if (lm) rr.last3f = lm[1];

  // 通過順 position spans
  const pos = $cell.find('p.position span').map((i, el) => clean($(el).text())).get().filter(Boolean);
  if (pos.length) rr.passingOrder = pos.join('-');

  // 実体のない（空・プレースホルダ）セルは過去走として扱わない
  const hasSubstance = rr.finish != null || rr.finishStatus || rr.date || rr.raceName || rr.time;
  if (!hasSubstance) return null;

  return rr;
}

/**
 * 出馬表HTML（UTF-8）→ parsedResult。
 * @param {string} html  UTF-8 化済みHTML。
 * @param {object} meta  { date, venue, venueCode, category, raceNumber?, sourceUrl?, now? }
 * @returns {object} parsedResult（既存 nankan/entries schema）。1ページ=1レース=1 venue。
 */
export function convertNankanEntriesHtmlToParsed(html, meta = {}) {
  if (typeof html !== 'string' || html.trim() === '') {
    throw new Error('HTML 入力が空です');
  }
  const $ = cheerio.load(html);
  const header = parseRaceHeader($);

  // 馬行 = td.umaban を含む tr
  const horseRows = $('tr').filter((i, tr) => $(tr).find('td.umaban').length > 0).toArray();
  const horses = horseRows.map((tr) => parseHorseRow($, tr)).filter(h => h.number != null);

  const date = meta.date || header.detectedDate;
  const venue = meta.venue || '';
  const venueCode = meta.venueCode || '';
  const category = meta.category || 'nankan';
  const raceNumber = meta.raceNumber != null ? meta.raceNumber : header.raceNumber;
  const now = meta.now || new Date().toISOString();

  const race = {
    raceNumber,
    raceName: header.raceName || '',
    startTime: header.startTime || '',
    distance: header.distance || '',
    surface: header.surface || '',
    direction: header.direction || '',
    conditions: '',
    headCount: horses.length,
    horses
  };

  return {
    version: '1.0.0',
    createdAt: now,
    lastUpdated: now,
    date: date || '',
    venue,
    venueCode,
    category,
    totalRaces: 1,
    races: [race],
    // 取得方法と record 未取得を明示（PR-F2b・record optional 方針 §28）。
    sourceMeta: {
      sourceType: 'auto',
      sourcePageType: meta.sourcePageType || 'uma_shosai',
      sourceUrl: meta.sourceUrl || null,
      recordSourced: false,                       // uma_shosai に着別 record 無し
      recordCoverage: '0%',
      missingRecordReason: MISSING_RECORD_REASON  // 'uma_shosai_no_record'
    }
  };
}

/**
 * 全頭の record が未取得（null）か。呼び出し側の coverage / 未取得明示用。
 * record を 0 埋めせず null にする方針（PR-F2b）に合わせ、null を未取得とみなす。
 */
export function isRecordUnsourced(parsed) {
  const horses = (parsed?.races || []).flatMap(r => r.horses || []);
  if (horses.length === 0) return false;
  return horses.every(h => h?.record == null);
}
