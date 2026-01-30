/**
 * 競馬予想データ型定義
 * 核（Core）: 複数サイトで共通利用する基盤データ
 * 拡張（Extension）: サイトごとにカスタマイズ可能な領域
 */

// ==========================================
// 核（Core）: 共通データ構造
// ==========================================

/**
 * 予想印の種類
 */
export type MarkType = "◎" | "○" | "▲" | "△" | "×" | "穴" | "注" | "消" | "-" | "";

/**
 * 馬データ（抽出結果）
 */
export interface HorseData {
  number: number;           // 馬番
  name: string;             // 馬名
  umacd?: string;           // 馬コード（可能な場合）

  // 予想印（予想者ごと）
  marks: {
    [predictor: string]: MarkType; // "CPU": "○", "牟田雅": "▲"...
  };

  // オッズ（可能な場合）
  odds?: number;

  // 生データ（HTMLの行全体、再現性のため）
  rawHtml?: string;
}

/**
 * 確定印（自動提案＋手動確定後）
 */
export interface FinalMarks {
  main: number;           // 本命◎
  sub: number;            // 対抗○
  hole1?: number;         // 単穴▲
  hole2?: number;         // 単穴▲
  connect: number[];      // 連下△
  reserve: number[];      // 押さえ×
}

/**
 * レース情報
 */
export interface RaceInfo {
  raceDate: string;       // YYYY-MM-DD
  track: string;          // 大井競馬、船橋競馬、中山競馬...
  raceNumber: string;     // 1R, 2R, 11R...
  raceName: string;       // 東京記念、Ｃ３ 選抜牝馬...
  distance: string;       // ダ2,400m
  horseCount: number;     // 14頭
  startTime: string;      // 20:10
  raceCondition?: string; // 良、稍重...
}

/**
 * 核データ（共通）
 */
export interface CorePredictionData {
  // メタ情報
  version: string;        // "1.0.0"
  createdAt: string;      // ISO 8601
  lastUpdated: string;    // ISO 8601

  // レース情報
  raceInfo: RaceInfo;

  // 抽出結果（生データ）
  rawHtml: string;        // 再現性のため絶対必要
  horses: HorseData[];

  // 印の確定結果
  finalMarks: FinalMarks;

  // 予想者リスト（動的）
  predictors: string[];   // ["CPU", "牟田雅", "西村敬", "広瀬健", "本紙"]
}

// ==========================================
// 拡張（Extension）: サイト別カスタマイズ
// ==========================================

/**
 * 拡張フィールド（サイト別）
 */
export interface ExtensionFields {
  [key: string]: any;     // 完全に自由な構造
}

/**
 * nankan-analytics用の拡張フィールド例
 */
export interface NankanAnalyticsExtension extends ExtensionFields {
  horses: {
    [horseNumber: number]: {
      score: number;              // 累積スコア: 92pt
      stability: number;          // 安定性: 89%
      abilityRank: number;        // 能力上位性: 91%
      paceAdvantage: number;      // 展開利: 96%
      evaluation: string;         // 総合評価: "★★★★"
    };
  };
  strategies: {
    safe: {
      title: string;              // "🎯 少点数的中型モデル"
      bets: string[];             // ["馬単 12→1,5,8　3点"]
      hitRate: number;            // 62
      confidence: number;         // 62
      risk: string;               // "低リスク"
    };
    balance: {
      title: string;
      bets: string[];
      hitRate: number;
      confidence: number;
      risk: string;
    };
    aggressive: {
      title: string;
      bets: string[];
      hitRate: number;
      confidence: number;
      risk: string;
    };
  };
}

/**
 * 完全な予想データ（核＋拡張）
 */
export interface PredictionData {
  core: CorePredictionData;
  extensions: ExtensionFields;
}

// ==========================================
// サイトプロファイル
// ==========================================

/**
 * 出力スキーマの種類
 */
export type OutputSchema = "nankan-v1" | "central-v1" | "custom";

/**
 * Exporter設定
 */
export interface ExporterConfig {
  target: string;         // "keiba-data-shared", "another-repo"...
  repository: string;     // "apol0510/keiba-data-shared"
  path: string;           // "nankan/predictions/{YYYY}/{MM}/{YYYY-MM-DD}.json"
  schema: OutputSchema;   // 出力スキーマ
  branch?: string;        // デフォルト: "main"
}

/**
 * 拡張フィールド定義
 */
export interface ExtensionFieldDef {
  key: string;            // "score", "stability"...
  label: string;          // "累積スコア", "安定性"...
  type: "number" | "string" | "boolean";
  unit?: string;          // "pt", "%"...
  min?: number;
  max?: number;
  required?: boolean;
}

/**
 * サイトプロファイル
 */
export interface SiteProfile {
  id: string;             // "nankan-analytics"
  name: string;           // "南関アナリティクス"
  description: string;

  // 拡張フィールド定義
  extensionFields: {
    horses?: ExtensionFieldDef[];
    strategies?: ExtensionFieldDef[];
    other?: ExtensionFieldDef[];
  };

  // Exporter設定
  exporters: ExporterConfig[];
}

// ==========================================
// バリデーション
// ==========================================

/**
 * エラー分類
 */
export enum ValidationError {
  ParseError = "HTML解析失敗",
  MissingField = "必須項目欠損",
  DuplicateMark = "印重複（本命◎が2頭等）",
  OutOfRange = "範囲外（スコア101pt等）",
  CountMismatch = "頭数不一致（14頭抽出なのに13頭入力）",
  NoUmaKey = "馬識別キー欠損（umacd/馬番+馬名）",
  InvalidDate = "日付形式不正",
  InvalidHtml = "HTML形式不正",
}

/**
 * バリデーション結果
 */
export interface ValidationResult {
  valid: boolean;
  errors: {
    type: ValidationError;
    message: string;
    field?: string;
  }[];
  warnings: {
    message: string;
    field?: string;
  }[];
}

// ==========================================
// 抽出結果
// ==========================================

/**
 * HTML抽出結果
 */
export interface ExtractionResult {
  success: boolean;
  horses: HorseData[];
  predictors: string[];
  errors: string[];

  // 自動提案（印の集計結果）
  suggestedMarks?: {
    main: number[];       // 本命候補（スコア順）
    sub: number[];        // 対抗候補
    hole: number[];       // 単穴候補
  };
}

// ==========================================
// ユーティリティ型
// ==========================================

/**
 * 部分的な更新用
 */
export type PartialPredictionData = Partial<PredictionData>;

/**
 * レース識別子
 */
export interface RaceIdentifier {
  date: string;           // YYYY-MM-DD
  track: string;
  raceNumber: string;
}
