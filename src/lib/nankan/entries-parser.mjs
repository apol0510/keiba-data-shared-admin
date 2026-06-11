/**
 * 南関 entries テキストパーサー（コアのポート・DOM非依存）
 *
 * 出自: src/pages/admin/entries-manager.astro の南関（地方）向け純粋 parse 関数を
 *       Node 側へポートしたもの。**entries-manager.astro は変更していない**（複製）。
 *
 * スコープ（PR-F1a）:
 * - 入力 = コピペ相当のプレーンテキスト（出馬表テキスト）+ metadata。
 * - 出力 = 既存 `nankan/entries/YYYY/MM/YYYY-MM-DD-{VENUE}.json` と同一の parsedResult schema。
 * - **取得しない・保存しない・DOM/UI に依存しない**（fetch / HTML→テキスト整形は PR-F1b）。
 * - JRA 経路は意図的に含めない（本モジュールは南関＝地方フォーマット専用）。
 *
 * 注意:
 * - entries-manager.astro 原本とロジック一致を保つ（乖離検証は PR-F2 validator）。
 * - console.* のデバッグ出力は除去し、警告は onWarn コールバックで収集可能にしてある。
 */

// ========== venue / category ヘルパー（entries-manager.astro 由来） ==========

/** 南関 venueCode → 日本語会場名 */
export const NANKAN_VENUE_NAME_BY_CODE = Object.freeze({
  OOI: '大井',
  KAW: '川崎',
  FUN: '船橋',
  URA: '浦和'
});

/** venue（日本語名）→ category */
export function getCategoryByVenue(venue) {
  const jra = ['東京', '中山', '阪神', '京都', '中京', '新潟', '小倉', '札幌', '函館', '福島'];
  const nankan = ['大井', '川崎', '船橋', '浦和'];
  if (jra.includes(venue)) return 'jra';
  if (nankan.includes(venue)) return 'nankan';
  return 'local';
}

/** venue（日本語名）→ 3文字コード */
export function getVenueCode(venue) {
  const codes = {
    '東京': 'TOK', '中山': 'NAK', '阪神': 'HAN', '京都': 'KYO',
    '中京': 'CHU', '新潟': 'NII', '小倉': 'KOK', '札幌': 'SAP',
    '函館': 'HKD', '福島': 'FKS',
    '大井': 'OOI', '川崎': 'KAW', '船橋': 'FUN', '浦和': 'URA',
    '門別': 'MON', '帯広': 'OBI', '盛岡': 'MOR', '水沢': 'MIZ', '金沢': 'KNZ',
    '笠松': 'KSM', '名古屋': 'NGY', '園田': 'SON', '姫路': 'HIM',
    '高知': 'KOC', '佐賀': 'SAG'
  };
  return codes[venue] || 'XXX';
}

// ========== 前処理・自動検出（entries-manager.astro 由来） ==========

export function removeSeparatorLines(text) {
  const lines = text.split('\n');
  const pattern = /^[\s　]*={3,}.*={3,}[\s　]*$/;
  const filtered = lines.filter(line => !pattern.test(line));
  return filtered.join('\n');
}

export function detectDateFromText(text) {
  // 「2026年3月30日」形式
  const m = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  return null;
}

export function detectVenueFromText(text) {
  const venues = ['大井', '川崎', '船橋', '浦和', '東京', '中山', '阪神', '京都', '中京', '新潟', '小倉', '札幌', '函館', '福島', '門別', '帯広', '盛岡', '水沢', '金沢', '笠松', '名古屋', '園田', '姫路', '高知', '佐賀'];
  const lines = text.split('\n');
  // 地方: 「第N競走」を含むヘッダー行から検出
  for (const line of lines) {
    if (/第\d{1,2}競走/.test(line)) {
      const n = line.replace(/[\s　]+/g, '');
      for (const v of venues) { if (n.includes(v)) return v; }
    }
  }
  // JRA: 「N回中山N日」形式から検出
  for (const line of lines) {
    const jm = line.match(/\d回(中山|東京|阪神|京都|中京|新潟|小倉|札幌|函館|福島)\d日/);
    if (jm) return jm[1];
  }
  // フォールバック: 先頭200文字
  const head = text.substring(0, 200).replace(/[\s　]+/g, '');
  for (const v of venues) { if (head.includes(v)) return v; }
  return null;
}

// ========== レース分割（南関＝地方経路のみ） ==========

function splitAndParseRacesLocal(text, onWarn) {
  const lines = text.split('\n');
  const races = [];

  // 地方: 「第N競走」で分割
  const raceStartIndices = [];
  for (let i = 0; i < lines.length; i++) {
    if (/第\d{1,2}競走/.test(lines[i])) raceStartIndices.push(i);
  }

  if (raceStartIndices.length === 0) {
    const race = parseOneRace(lines);
    if (race && race.horses.length > 0) races.push(race);
    return races;
  }

  for (let i = 0; i < raceStartIndices.length; i++) {
    const startIdx = raceStartIndices[i];
    const endIdx = i + 1 < raceStartIndices.length ? raceStartIndices[i + 1] : lines.length;
    try {
      const race = parseOneRace(lines.slice(startIdx, endIdx));
      if (race && race.horses.length > 0) races.push(race);
    } catch (e) {
      if (onWarn) onWarn(`レース解析エラー (index ${i}): ${e.message}`);
    }
  }
  return races;
}

// ========== 1レース ==========

function parseOneRace(lines) {
  const race = {
    raceNumber: null, raceName: '', startTime: '',
    distance: '', surface: '', direction: '',
    conditions: '', headCount: 0, horses: []
  };

  // 上部20行からレース情報を抽出
  const topText = lines.slice(0, Math.min(20, lines.length)).join(' ').replace(/[\s　]+/g, ' ');

  const raceNumMatch = topText.match(/第(\d{1,2})競走/);
  if (raceNumMatch) race.raceNumber = parseInt(raceNumMatch[1], 10);

  const timeMatch = topText.match(/(\d{1,2}:\d{2})発走/);
  if (timeMatch) race.startTime = timeMatch[1];

  const distMatch = topText.match(/(ダート|芝)\s*(\d{3,4})\s*[mｍ]/);
  if (distMatch) { race.surface = distMatch[1]; race.distance = distMatch[2]; }

  const dirMatch = topText.match(/\d{3,4}\s*[mｍ]\s*[（(]\s*(左|右|直)/);
  if (dirMatch) race.direction = dirMatch[1];

  // レース名: ヘッダー行より前の条件的な短い行
  for (let i = 0; i < Math.min(12, lines.length); i++) {
    const line = lines[i].trim();
    if (!line || line.length < 2 || line.length > 50) continue;
    if (/枠番|馬番|発走|前レース|次レース|賞金|電話投票|サラブレッド|対戦表|オッズ|ライブ|印刷用/.test(line)) continue;
    if (/^\d{4}年/.test(line) || /第\d{1,2}競走/.test(line)) continue;
    if (/^(ダート|芝)/.test(line)) continue;
    if (/[ァ-ヶー一-龥Ａ-Ｚ０-９]/.test(line)) {
      race.raceName = line;
      break;
    }
  }

  race.horses = parseHorses(lines);
  race.headCount = race.horses.length;
  return race;
}

// ========== 馬ブロック ==========

function parseHorses(lines, onWarn) {
  const horses = [];
  const horseBlockStarts = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 枠番(1-8) + 区切り + 馬番(1-18) + 区切り + 馬名（カタカナ/漢字）
    const m = line.match(/^(\d)\s+(\d{1,2})\s+([ァ-ヶー一-龥a-zA-Zａ-ｚＡ-Ｚ].+)/);
    if (m) {
      const postPos = parseInt(m[1], 10);
      const num = parseInt(m[2], 10);
      if (postPos >= 1 && postPos <= 8 && num >= 1 && num <= 18) {
        horseBlockStarts.push({ index: i, postPosition: postPos, number: num });
      }
      continue;
    }
  }

  for (let h = 0; h < horseBlockStarts.length; h++) {
    const start = horseBlockStarts[h].index;
    const end = h + 1 < horseBlockStarts.length ? horseBlockStarts[h + 1].index : lines.length;
    const block = lines.slice(start, end);
    try {
      const horse = parseOneHorse(block, horseBlockStarts[h]);
      if (horse) horses.push(horse);
    } catch (e) {
      if (onWarn) onWarn(`馬データ解析エラー (馬番${horseBlockStarts[h].number}): ${e.message}`);
    }
  }

  return horses;
}

function parseOneHorse(block, meta) {
  const horse = {
    postPosition: meta.postPosition,
    number: meta.number,
    name: '',
    gender: '',
    age: null,
    coat: '',
    weight: null,
    jockey: '',
    jockeyAffiliation: '',
    trainer: '',
    trainerAffiliation: '',
    owner: '',
    breeder: '',
    sire: '',
    bms: '',
    record: {
      total: { wins: 0, seconds: 0, thirds: 0, unplaced: 0 },
      left: { wins: 0, seconds: 0, thirds: 0, unplaced: 0 },
      right: { wins: 0, seconds: 0, thirds: 0, unplaced: 0 },
      venue: { wins: 0, seconds: 0, thirds: 0, unplaced: 0 },
      distance: { wins: 0, seconds: 0, thirds: 0, unplaced: 0 }
    },
    bestTime: '',
    recentRaces: []
  };

  // 1行目: 枠番 馬番 馬名 騎手（所属）
  const firstLine = block[0];
  const tabParts = firstLine.split(/\t/).map(s => s.trim()).filter(s => s);
  if (tabParts.length >= 3) {
    horse.name = tabParts[2];
    if (tabParts[3]) {
      const jm = tabParts[3].match(/^(.+?)[（(](.+?)[）)]/);
      if (jm) { horse.jockey = jm[1].trim(); horse.jockeyAffiliation = jm[2].trim(); }
      else horse.jockey = tabParts[3].trim();
    }
  } else {
    const fm = firstLine.match(/^\d\s+\d{1,2}\s+(\S+)\s+(.+)/);
    if (fm) {
      horse.name = fm[1].trim();
      const jm = fm[2].match(/^(.+?)[（(](.+?)[）)]/);
      if (jm) { horse.jockey = jm[1].trim(); horse.jockeyAffiliation = jm[2].trim(); }
      else horse.jockey = fm[2].trim();
    }
  }

  // 着別成績: 「全 \t1- \t0- \t0- \t7」
  const recordKeys = ['total', 'left', 'right', 'venue', 'distance'];
  const recordLabels = ['全', '左', '右', '場', '距'];
  for (const line of block) {
    const normalized = line.replace(/\t/g, ' ').trim();
    for (let r = 0; r < recordLabels.length; r++) {
      if (normalized.startsWith(recordLabels[r])) {
        const rm = normalized.match(/(\d+)-\s*(\d+)-\s*(\d+)-\s*(\d+)/);
        if (rm) {
          horse.record[recordKeys[r]] = {
            wins: parseInt(rm[1]), seconds: parseInt(rm[2]),
            thirds: parseInt(rm[3]), unplaced: parseInt(rm[4])
          };
        }
      }
    }
  }

  // 性齢・毛色・斤量
  for (const line of block) {
    const normalized = line.replace(/\t/g, ' ');
    const gm = normalized.match(/(牡|牝|セン)(\d{1,2})\s+([\S]*毛|栗毛|芦毛)\s+/);
    if (gm) {
      horse.gender = gm[1];
      horse.age = parseInt(gm[2]);
      horse.coat = gm[3];
      const wm = normalized.match(/生\s+[△▲☆★]?\s*(\d{2,3}\.\d)/);
      if (wm) horse.weight = parseFloat(wm[1]);
      break;
    }
  }

  // 最高タイム
  for (const line of block) {
    const trimmed = line.replace(/\t/g, ' ').trim();
    const btm = trimmed.match(/^(\d:\d{2}\.\d)\s+[良稍重不]/);
    if (btm) { horse.bestTime = btm[1]; break; }
    if (/^－\s+[良稍重不]/.test(trimmed)) { horse.bestTime = ''; break; }
  }

  // 近5走
  horse.recentRaces = parseRecentRaces(block);

  // 下段ブロック（父馬・調教師・馬主・生産牧場・母父）
  extractLowerBlock(block, horse);

  return horse;
}

function extractLowerBlock(block, horse) {
  let genderLineIdx = -1;
  for (let i = 0; i < block.length; i++) {
    const normalized = block[i].replace(/\t/g, ' ').trim();
    if (/^(牡|牝|セン)\d/.test(normalized)) { genderLineIdx = i; break; }
  }

  if (genderLineIdx === -1) {
    return;
  }

  // 性齢行の次 = 父馬名 + 調教師名(所属)
  const sireLineIdx = genderLineIdx + 1;
  if (sireLineIdx < block.length) {
    const sireLine = block[sireLineIdx].replace(/\t/g, '  ').trim();
    const sm = sireLine.match(/^(\S+)\s+(.+?)[（(](.+?)[）)]/);
    if (sm) {
      horse.sire = sm[1].trim();
      horse.trainer = sm[2].trim();
      horse.trainerAffiliation = sm[3].trim();
    } else if (sireLine && !/^\d/.test(sireLine) && !/^[（(]/.test(sireLine)) {
      const p = sireLine.split(/\s{2,}/).filter(s => s.trim());
      if (p.length >= 1) horse.sire = p[0].trim();
      if (p.length >= 2) horse.trainer = p[1].trim();
    }
  }

  // 馬主+生産牧場: タイムを含み人気行でない行
  for (let i = sireLineIdx + 1; i < block.length; i++) {
    const line = block[i].replace(/\t/g, '  ');
    if (/\d:\d{2}\.\d/.test(line) && !/\d+人/.test(line)) {
      const p = line.trim().split(/\s{2,}/).filter(s => s.trim());
      if (p.length >= 2) {
        if (!/^\d/.test(p[0]) && !/\d:\d{2}/.test(p[0])) {
          horse.owner = p[0].trim();
          if (!/\d:\d{2}/.test(p[1])) horse.breeder = p[1].trim();
        }
      }
      break;
    }
  }

  // BMS(母父): （括弧名）で始まる行
  for (let i = sireLineIdx + 1; i < block.length; i++) {
    const line = block[i].replace(/\t/g, '  ').trim();
    const bm = line.match(/^[（(]([^）)]+)[）)]\s+([\S]+)/);
    if (bm) {
      horse.bms = bm[1].trim();
      if (!/^\d/.test(bm[2])) horse.breeder = bm[2].trim();
      break;
    }
  }

  // 近走の追加情報を補完
  enrichRecentRaces(block, horse.recentRaces, genderLineIdx);
}

function parseRecentRaces(block) {
  const recentRaces = [];

  // 着順+日付行
  const raceLineIndices = [];
  for (let i = 0; i < block.length; i++) {
    const line = block[i].replace(/\t/g, ' ').trim();
    if (/^(?:\d{1,2}|中止|取消|除外)\s+\d{2}\.\d{2}\.\d{2}/.test(line)) {
      raceLineIndices.push(i);
    }
  }

  for (let r = 0; r < Math.min(5, raceLineIndices.length); r++) {
    const lineIdx = raceLineIndices[r];
    const line = block[lineIdx].replace(/\t/g, ' ').trim();

    const m = line.match(/^(\d{1,2}|中止|取消|除外)\s+(\d{2})\.(\d{2})\.(\d{2})\s+(良|稍重|重|不良)\s+(\d{1,2})頭/);
    if (!m) continue;

    const finishRaw = m[1];
    const raceData = {
      order: r + 1,
      finish: /^\d+$/.test(finishRaw) ? parseInt(finishRaw) : null,
      finishStatus: /^\d+$/.test(finishRaw) ? null : finishRaw,
      date: `20${m[2]}-${m[3]}-${m[4]}`,
      trackCondition: m[5], headCount: parseInt(m[6]),
      venue: '', direction: '', distance: null, postPosition: null,
      raceName: '', popularity: null, bodyWeight: '', jockey: '', weight: null,
      time: '', passingOrder: '', last3f: '', margin: '', opponentName: ''
    };

    // 次の非空行: 競馬場・距離・枠番
    for (let j = lineIdx + 1; j < Math.min(lineIdx + 3, block.length); j++) {
      const venueLine = block[j].replace(/\t/g, ' ').trim();
      if (!venueLine) continue;
      const vm = venueLine.match(/^(.+?)\s+(左|右|直)?(\d{3,4})\s+(\d{1,2})番/);
      if (vm) {
        raceData.venue = vm[1].replace(/[ナＪJ]$/, '').replace(/[\s　]/g, '').trim();
        raceData.direction = vm[2] || '';
        raceData.distance = parseInt(vm[3]);
        raceData.postPosition = parseInt(vm[4]);
      }
      break;
    }

    recentRaces.push(raceData);
  }

  return recentRaces;
}

function enrichRecentRaces(block, recentRaces, genderLineIdx) {
  if (recentRaces.length === 0) return;

  // レース名: 性齢行の後半「N-N-N-N \tレース名1 \tレース名2 ...」
  if (genderLineIdx >= 0 && genderLineIdx < block.length) {
    const genderLine = block[genderLineIdx];
    const afterRecord = genderLine.replace(/^.*?\d+-\d+-\d+-\d+/, '');
    if (afterRecord && afterRecord !== genderLine) {
      const raceNames = afterRecord.split(/\t/).map(s => s.trim()).filter(s => s);
      for (let r = 0; r < Math.min(recentRaces.length, raceNames.length); r++) {
        recentRaces[r].raceName = raceNames[r];
      }
    }
  }

  // 下段行を走査
  const startIdx = genderLineIdx >= 0 ? genderLineIdx + 1 : 0;
  for (let i = startIdx; i < block.length; i++) {
    const line = block[i];
    const normalized = line.replace(/\t/g, '    ');

    // 人気行
    const popMatches = [...normalized.matchAll(/(\d{1,2})人\s+(\d{3,4})\s+([^\d\s][^\s]*(?:\s[^\d\s][^\s]*)?)\s+(\d{2,3}\.\d)/g)];
    if (popMatches.length >= 2) {
      for (let r = 0; r < Math.min(recentRaces.length, popMatches.length); r++) {
        recentRaces[r].popularity = parseInt(popMatches[r][1]);
        recentRaces[r].bodyWeight = popMatches[r][2];
        recentRaces[r].jockey = popMatches[r][3].replace(/^[△▲☆★]/, '').trim();
        recentRaces[r].weight = parseFloat(popMatches[r][4]);
      }
      continue;
    }

    // タイム行
    const timeMatches = [...normalized.matchAll(/(\d:\d{2}\.\d)\s+([\d]+-[\d]+(?:-[\d]+)*)\s+(\d{2}\.\d)/g)];
    if (timeMatches.length >= 1) {
      for (let r = 0; r < Math.min(recentRaces.length, timeMatches.length); r++) {
        recentRaces[r].time = timeMatches[r][1];
        recentRaces[r].passingOrder = timeMatches[r][2];
        recentRaces[r].last3f = timeMatches[r][3];
      }
      continue;
    }

    // 着差行
    if (/[（(]/.test(line)) {
      const marginMatches = [...normalized.matchAll(/(\d+\.\d+)\s+([ァ-ヶー一-龥a-zA-Zａ-ｚＡ-Ｚ][^\s]*)/g)];
      if (marginMatches.length >= 1) {
        for (let r = 0; r < Math.min(recentRaces.length, marginMatches.length); r++) {
          recentRaces[r].margin = marginMatches[r][1];
          recentRaces[r].opponentName = marginMatches[r][2];
        }
      }
    }
  }
}

// ========== トップレベル ==========

/**
 * コピペ相当テキスト → parsedResult（既存 nankan/entries schema 同一）。
 *
 * @param {string} text  出馬表テキスト（コピペ相当）。
 * @param {object} meta  { date, venue, venueCode, category, now?, onWarn? }
 *   - date/venue/venueCode/category が与えられればそれを正とする。
 *   - 欠けていればテキストから自動検出してフォールバック補完する。
 *   - now: createdAt/lastUpdated に使う ISO 文字列（テスト再現用・省略時は現在時刻）。
 *   - onWarn(msg): 解析中の警告コールバック（省略可）。
 * @returns {object} parsedResult（version/createdAt/lastUpdated/date/venue/venueCode/category/totalRaces/races）。
 */
export function parseEntriesText(text, meta = {}) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('入力テキストが空です');
  }
  const onWarn = typeof meta.onWarn === 'function' ? meta.onWarn : null;

  const cleaned = removeSeparatorLines(text);

  // date / venue の決定（meta 優先・無ければ自動検出）
  const date = meta.date || detectDateFromText(cleaned);
  let venueName = meta.venue || null;
  if (!venueName && meta.venueCode && NANKAN_VENUE_NAME_BY_CODE[meta.venueCode]) {
    venueName = NANKAN_VENUE_NAME_BY_CODE[meta.venueCode];
  }
  if (!venueName) venueName = detectVenueFromText(cleaned);

  if (!date) throw new Error('date を決定できません（meta.date またはテキストから検出できない）');
  if (!venueName) throw new Error('venue を決定できません（meta.venue/venueCode またはテキストから検出できない）');

  const venueCode = meta.venueCode || getVenueCode(venueName);
  const category = meta.category || getCategoryByVenue(venueName);

  const races = splitAndParseRacesLocal(cleaned, onWarn);

  const now = meta.now || new Date().toISOString();

  return {
    version: '1.0.0',
    createdAt: now,
    lastUpdated: now,
    date,
    venue: venueName,
    venueCode,
    category,
    totalRaces: races.length,
    races
  };
}
