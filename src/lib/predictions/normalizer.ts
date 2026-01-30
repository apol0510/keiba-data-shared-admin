/**
 * 正規化ロジック
 * 抽出結果を核データ（CorePredictionData）に変換
 */

import type {
  CorePredictionData,
  RaceInfo,
  FinalMarks,
  ExtractionResult,
} from "../types/predictions";

/**
 * 核データを生成
 */
export function normalizePredictionData(
  raceInfo: RaceInfo,
  extractionResult: ExtractionResult,
  finalMarks: FinalMarks,
  rawHtml: string
): CorePredictionData {
  const now = new Date().toISOString();

  return {
    version: "1.0.0",
    createdAt: now,
    lastUpdated: now,
    raceInfo,
    rawHtml,
    horses: extractionResult.horses,
    finalMarks,
    predictors: extractionResult.predictors,
  };
}

/**
 * レース情報をパース（手動入力から）
 */
export function parseRaceInfo(input: {
  raceDate: string;
  track: string;
  raceNumber: string;
  raceName: string;
  distance: string;
  horseCount: number;
  startTime: string;
  raceCondition?: string;
}): RaceInfo {
  return {
    raceDate: input.raceDate,
    track: input.track,
    raceNumber: input.raceNumber,
    raceName: input.raceName,
    distance: input.distance,
    horseCount: input.horseCount,
    startTime: input.startTime,
    raceCondition: input.raceCondition,
  };
}

/**
 * 確定印をパース（手動選択から）
 */
export function parseFinalMarks(input: {
  main: number;
  sub: number;
  hole1?: number;
  hole2?: number;
  connect: number[];
  reserve: number[];
}): FinalMarks {
  return {
    main: input.main,
    sub: input.sub,
    hole1: input.hole1,
    hole2: input.hole2,
    connect: input.connect,
    reserve: input.reserve,
  };
}

/**
 * 自動提案から確定印を生成（デフォルト値）
 */
export function generateDefaultFinalMarks(
  suggestedMarks: {
    main: number[];
    sub: number[];
    hole: number[];
  }
): FinalMarks {
  return {
    main: suggestedMarks.main[0] || 1,
    sub: suggestedMarks.main[1] || 2,
    hole1: suggestedMarks.main[2],
    hole2: suggestedMarks.sub[0],
    connect: suggestedMarks.sub.slice(1, 3),
    reserve: suggestedMarks.hole.slice(0, 2),
  };
}

/**
 * 馬名を正規化（全角・半角統一、空白除去）
 */
export function normalizeHorseName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, "") // 空白除去
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) =>
      String.fromCharCode(s.charCodeAt(0) - 0xfee0)
    ); // 全角→半角
}

/**
 * レース番号を正規化（"11R" → "11R"、"1" → "1R"）
 */
export function normalizeRaceNumber(raceNumber: string): string {
  const trimmed = raceNumber.trim().toUpperCase();
  if (trimmed.endsWith("R")) {
    return trimmed;
  }
  return `${trimmed}R`;
}

/**
 * 距離を正規化（"ダ2,400m" → "ダ2,400m"、"2400" → "ダ2,400m"）
 */
export function normalizeDistance(distance: string): string {
  const trimmed = distance.trim();

  // すでに正しい形式
  if (/^[ダ芝]\d{1,2},?\d{3}m?$/.test(trimmed)) {
    if (!trimmed.includes(",")) {
      // カンマ挿入
      return trimmed.replace(/(\d)(\d{3})/, "$1,$2");
    }
    if (!trimmed.endsWith("m")) {
      return `${trimmed}m`;
    }
    return trimmed;
  }

  // 数値のみの場合（2400 → ダ2,400m）
  if (/^\d{4}$/.test(trimmed)) {
    const formatted = trimmed.replace(/(\d)(\d{3})/, "$1,$2");
    return `ダ${formatted}m`;
  }

  return trimmed;
}

/**
 * 日付を正規化（YYYY-MM-DD形式に統一）
 */
export function normalizeDate(date: string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${date}`);
  }

  const yyyy = d.getFullYear();
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

/**
 * 時刻を正規化（HH:MM形式に統一）
 */
export function normalizeTime(time: string): string {
  const trimmed = time.trim();

  // すでに正しい形式
  if (/^\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // "14:5" → "14:05"
  if (/^\d{1,2}:\d{1,2}$/.test(trimmed)) {
    const [hh, mm] = trimmed.split(":");
    return `${hh.padStart(2, "0")}:${mm.padStart(2, "0")}`;
  }

  return trimmed;
}

/**
 * 核データを更新
 */
export function updateCoreData(
  core: CorePredictionData,
  updates: Partial<CorePredictionData>
): CorePredictionData {
  return {
    ...core,
    ...updates,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * デバッグ用: 核データをコンソールに出力
 */
export function debugCoreData(core: CorePredictionData): void {
  console.log("=== 核データ ===");
  console.log(`バージョン: ${core.version}`);
  console.log(`作成日時: ${core.createdAt}`);
  console.log(`更新日時: ${core.lastUpdated}`);
  console.log("\nレース情報:");
  console.log(`  日付: ${core.raceInfo.raceDate}`);
  console.log(`  競馬場: ${core.raceInfo.track}`);
  console.log(`  レース番号: ${core.raceInfo.raceNumber}`);
  console.log(`  レース名: ${core.raceInfo.raceName}`);
  console.log(`  距離: ${core.raceInfo.distance}`);
  console.log(`  頭数: ${core.raceInfo.horseCount}`);
  console.log(`  発走時刻: ${core.raceInfo.startTime}`);
  console.log("\n確定印:");
  console.log(`  本命◎: ${core.finalMarks.main}番`);
  console.log(`  対抗○: ${core.finalMarks.sub}番`);
  console.log(`  単穴▲: ${core.finalMarks.hole1}番, ${core.finalMarks.hole2}番`);
  console.log(`  連下△: ${core.finalMarks.connect.join(", ")}番`);
  console.log(`  押さえ×: ${core.finalMarks.reserve.join(", ")}番`);
  console.log(`\n予想者: ${core.predictors.join(", ")}`);
  console.log(`馬数: ${core.horses.length}`);
}
