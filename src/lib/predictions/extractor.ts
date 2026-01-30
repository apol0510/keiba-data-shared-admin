/**
 * HTML抽出ロジック
 * 競馬ブックのHTMLから予想印・馬名・馬番・オッズを抽出
 */

import type { HorseData, ExtractionResult, MarkType } from "../types/predictions";

/**
 * DOMParserを使用してHTMLを解析（ブラウザ環境）
 */
function parseHtml(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(html, "text/html");
}

/**
 * SVG印を文字列に変換
 */
function extractMarkFromElement(element: Element): MarkType {
  const text = element.textContent?.trim() || "";

  // SVG（三角）を検出
  if (element.querySelector("svg")) {
    return "▲";
  }

  // 通常のテキスト印
  const markMap: { [key: string]: MarkType } = {
    "◎": "◎",
    "○": "○",
    "▲": "▲",
    "△": "△",
    "×": "×",
    "穴": "穴",
    "注": "注",
    "消": "消",
    "-": "-",
    "": "",
  };

  return markMap[text] || (text as MarkType);
}

/**
 * 予想者列を自動検出
 */
function detectPredictors(headerRow: Element): string[] {
  const headers: string[] = [];
  const ths = headerRow.querySelectorAll("th");

  ths.forEach((th) => {
    const text = th.textContent?.trim() || "";

    // 予想印列を検出（CPU、牟田雅、西村敬、広瀬健、本紙など）
    // "My印", "CPU", "牟田雅"などの列
    if (
      text.includes("My") ||
      text === "CPU" ||
      text.length <= 3 // 短い列名は予想者名の可能性
    ) {
      headers.push(text);
    }
  });

  return headers;
}

/**
 * 馬データを1行から抽出
 */
function extractHorseFromRow(
  row: Element,
  predictors: string[]
): HorseData | null {
  const tds = Array.from(row.querySelectorAll("td"));

  // 馬番を抽出（2列目が馬番の場合が多い）
  let number = 0;
  let name = "";
  let umacd: string | undefined;
  const marks: { [predictor: string]: MarkType } = {};
  let odds: number | undefined;

  // 馬番（umaban class）
  const umabanTd = tds.find((td) => td.classList.contains("umaban"));
  if (umabanTd) {
    number = parseInt(umabanTd.textContent?.trim() || "0", 10);
  }

  // 馬名（bamei class内のリンク）
  const bameiTd = tds.find((td) => td.classList.contains("bamei"));
  if (bameiTd) {
    const link = bameiTd.querySelector("a");
    if (link) {
      name = link.textContent?.trim() || "";
      // umacd抽出（href="/db/uma/0938048"から）
      const href = link.getAttribute("href") || "";
      const match = href.match(/\/uma\/(\d+)/);
      if (match) {
        umacd = match[1];
      }
    }
  }

  // 予想印を抽出（tmyoso class）
  const markTds = tds.filter((td) => td.classList.contains("tmyoso"));
  markTds.forEach((td, index) => {
    if (index < predictors.length) {
      marks[predictors[index]] = extractMarkFromElement(td);
    }
  });

  // オッズを抽出（odds5 class）
  const oddsTd = tds.find((td) => td.classList.contains("odds5"));
  if (oddsTd) {
    const oddsText = oddsTd.textContent?.trim() || "";
    // "5.7"のような数値、"☆"は999.9に変換
    if (oddsText === "☆") {
      odds = 999.9;
    } else {
      const parsed = parseFloat(oddsText);
      if (!isNaN(parsed)) {
        odds = parsed;
      }
    }
  }

  // 馬番と馬名が必須
  if (number === 0 || !name) {
    return null;
  }

  return {
    number,
    name,
    umacd,
    marks,
    odds,
    rawHtml: row.outerHTML,
  };
}

/**
 * 印の集計（自動提案用）
 */
function aggregateMarks(horses: HorseData[]): {
  main: number[];
  sub: number[];
  hole: number[];
} {
  const scores: { [horseNumber: number]: number } = {};

  // 印ごとのスコア
  const markScores: { [key: string]: number } = {
    "◎": 5,
    "○": 4,
    "▲": 3,
    "△": 2,
    "穴": 2,
    "注": 1,
  };

  horses.forEach((horse) => {
    let score = 0;
    Object.values(horse.marks).forEach((mark) => {
      score += markScores[mark] || 0;
    });
    scores[horse.number] = score;
  });

  // スコア順にソート
  const sorted = Object.entries(scores)
    .sort(([, a], [, b]) => b - a)
    .map(([num]) => parseInt(num, 10));

  return {
    main: sorted.slice(0, 3),     // 本命候補（上位3頭）
    sub: sorted.slice(3, 6),      // 対抗候補（4-6位）
    hole: sorted.slice(6, 10),    // 単穴候補（7-10位）
  };
}

/**
 * HTML全体から予想データを抽出
 */
export function extractPredictions(html: string): ExtractionResult {
  const errors: string[] = [];

  try {
    const doc = parseHtml(html);

    // テーブルを検出
    const table = doc.querySelector("table.default.syutuba");
    if (!table) {
      errors.push("出馬表テーブルが見つかりません（table.default.syutuba）");
      return {
        success: false,
        horses: [],
        predictors: [],
        errors,
      };
    }

    // ヘッダー行から予想者を検出
    const headerRow = table.querySelector("thead tr");
    if (!headerRow) {
      errors.push("ヘッダー行が見つかりません");
      return {
        success: false,
        horses: [],
        predictors: [],
        errors,
      };
    }

    const predictors = detectPredictors(headerRow);
    console.log("[Extractor] 検出した予想者:", predictors);

    // データ行から馬データを抽出
    const rows = table.querySelectorAll("tbody tr");
    const horses: HorseData[] = [];

    rows.forEach((row) => {
      const horse = extractHorseFromRow(row, predictors);
      if (horse) {
        horses.push(horse);
      }
    });

    console.log(`[Extractor] ${horses.length}頭の馬データを抽出`);

    // 自動提案
    const suggestedMarks = aggregateMarks(horses);

    return {
      success: true,
      horses,
      predictors,
      errors,
      suggestedMarks,
    };
  } catch (error) {
    errors.push(`抽出エラー: ${error}`);
    return {
      success: false,
      horses: [],
      predictors: [],
      errors,
    };
  }
}

/**
 * 馬データを更新（手動修正用）
 */
export function updateHorse(
  horses: HorseData[],
  horseNumber: number,
  updates: Partial<HorseData>
): HorseData[] {
  return horses.map((horse) => {
    if (horse.number === horseNumber) {
      return { ...horse, ...updates };
    }
    return horse;
  });
}

/**
 * 予想者を追加（列が欠けた場合のフォールバック）
 */
export function addPredictor(
  horses: HorseData[],
  predictorName: string,
  defaultMark: MarkType = "-"
): HorseData[] {
  return horses.map((horse) => ({
    ...horse,
    marks: {
      ...horse.marks,
      [predictorName]: defaultMark,
    },
  }));
}

/**
 * デバッグ用: 抽出結果をコンソールに出力
 */
export function debugExtraction(result: ExtractionResult): void {
  console.log("=== 抽出結果 ===");
  console.log(`成功: ${result.success}`);
  console.log(`予想者: ${result.predictors.join(", ")}`);
  console.log(`馬数: ${result.horses.length}`);

  if (result.suggestedMarks) {
    console.log("自動提案:");
    console.log(`  本命候補: ${result.suggestedMarks.main.join(", ")}`);
    console.log(`  対抗候補: ${result.suggestedMarks.sub.join(", ")}`);
    console.log(`  単穴候補: ${result.suggestedMarks.hole.join(", ")}`);
  }

  if (result.errors.length > 0) {
    console.error("エラー:");
    result.errors.forEach((err) => console.error(`  - ${err}`));
  }

  console.log("\n馬データ:");
  result.horses.forEach((horse) => {
    const marksStr = Object.entries(horse.marks)
      .map(([pred, mark]) => `${pred}:${mark}`)
      .join(", ");
    console.log(
      `  ${horse.number}番 ${horse.name} (${horse.umacd || "umacd無"}) [${marksStr}] オッズ:${horse.odds || "無"}`
    );
  });
}
