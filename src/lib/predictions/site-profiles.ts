/**
 * サイトプロファイル設定
 * 複数サイトで自動調整して使用できる核の設計
 */

import type { SiteProfile } from "../types/predictions";

/**
 * nankan-analytics用プロファイル
 */
export const NANKAN_ANALYTICS_PROFILE: SiteProfile = {
  id: "nankan-analytics",
  name: "南関アナリティクス",
  description: "南関競馬専門の予想サイト。累積スコア・特徴量重要度・買い目3戦略を含む。",

  extensionFields: {
    // 馬ごとの拡張フィールド
    horses: [
      {
        key: "score",
        label: "累積スコア",
        type: "number",
        unit: "pt",
        min: 0,
        max: 100,
        required: true,
      },
      {
        key: "stability",
        label: "安定性",
        type: "number",
        unit: "%",
        min: 0,
        max: 100,
        required: true,
      },
      {
        key: "abilityRank",
        label: "能力上位性",
        type: "number",
        unit: "%",
        min: 0,
        max: 100,
        required: true,
      },
      {
        key: "paceAdvantage",
        label: "展開利",
        type: "number",
        unit: "%",
        min: 0,
        max: 100,
        required: true,
      },
      {
        key: "evaluation",
        label: "総合評価",
        type: "string",
        required: false,
      },
    ],

    // 買い目戦略の拡張フィールド
    strategies: [
      {
        key: "safe_title",
        label: "少点数的中型: タイトル",
        type: "string",
        required: true,
      },
      {
        key: "safe_bets",
        label: "少点数的中型: 買い目",
        type: "string",
        required: true,
      },
      {
        key: "safe_hitRate",
        label: "少点数的中型: 的中率",
        type: "number",
        unit: "%",
        min: 0,
        max: 100,
        required: true,
      },
      {
        key: "balance_title",
        label: "バランス型: タイトル",
        type: "string",
        required: true,
      },
      {
        key: "balance_bets",
        label: "バランス型: 買い目",
        type: "string",
        required: true,
      },
      {
        key: "balance_hitRate",
        label: "バランス型: 的中率",
        type: "number",
        unit: "%",
        min: 0,
        max: 100,
        required: true,
      },
      {
        key: "aggressive_title",
        label: "高配当追求型: タイトル",
        type: "string",
        required: true,
      },
      {
        key: "aggressive_bets",
        label: "高配当追求型: 買い目",
        type: "string",
        required: true,
      },
      {
        key: "aggressive_hitRate",
        label: "高配当追求型: 的中率",
        type: "number",
        unit: "%",
        min: 0,
        max: 100,
        required: true,
      },
    ],
  },

  exporters: [
    {
      target: "keiba-data-shared",
      repository: "apol0510/keiba-data-shared",
      path: "nankan/predictions/{YYYY}/{MM}/{YYYY-MM-DD}.json",
      schema: "nankan-v1",
      branch: "main",
    },
  ],
};

/**
 * 中央競馬用プロファイル（将来の拡張例）
 */
export const CENTRAL_KEIBA_PROFILE: SiteProfile = {
  id: "central-keiba",
  name: "中央競馬アナリティクス",
  description: "中央競馬専門の予想サイト。シンプルな構成。",

  extensionFields: {
    horses: [
      {
        key: "score",
        label: "総合スコア",
        type: "number",
        unit: "pt",
        min: 0,
        max: 100,
        required: true,
      },
      {
        key: "confidence",
        label: "信頼度",
        type: "number",
        unit: "%",
        min: 0,
        max: 100,
        required: false,
      },
    ],
    strategies: [], // 買い目戦略は不要
  },

  exporters: [
    {
      target: "keiba-data-shared",
      repository: "apol0510/keiba-data-shared",
      path: "central/predictions/{YYYY}/{MM}/{YYYY-MM-DD}.json",
      schema: "central-v1",
      branch: "main",
    },
  ],
};

/**
 * ミニマル構成（将来の拡張例）
 */
export const MINIMAL_PROFILE: SiteProfile = {
  id: "minimal",
  name: "ミニマル予想",
  description: "最小限の構成。印のみ。",

  extensionFields: {
    horses: [],
    strategies: [],
  },

  exporters: [
    {
      target: "keiba-data-shared",
      repository: "apol0510/keiba-data-shared",
      path: "minimal/predictions/{YYYY}/{MM}/{YYYY-MM-DD}.json",
      schema: "custom",
      branch: "main",
    },
  ],
};

/**
 * 全プロファイルのリスト
 */
export const SITE_PROFILES: SiteProfile[] = [
  NANKAN_ANALYTICS_PROFILE,
  CENTRAL_KEIBA_PROFILE,
  MINIMAL_PROFILE,
];

/**
 * プロファイルをIDで取得
 */
export function getSiteProfile(id: string): SiteProfile | undefined {
  return SITE_PROFILES.find((profile) => profile.id === id);
}

/**
 * デフォルトプロファイル
 */
export const DEFAULT_PROFILE = NANKAN_ANALYTICS_PROFILE;

/**
 * パステンプレートを展開
 * {YYYY}/{MM}/{YYYY-MM-DD}.json → 2026/01/2026-01-30.json
 */
export function expandPathTemplate(template: string, date: string): string {
  const d = new Date(date);
  const yyyy = d.getFullYear().toString();
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  const yyyymmdd = `${yyyy}-${mm}-${dd}`;

  return template
    .replace(/\{YYYY\}/g, yyyy)
    .replace(/\{MM\}/g, mm)
    .replace(/\{DD\}/g, dd)
    .replace(/\{YYYY-MM-DD\}/g, yyyymmdd);
}

/**
 * 競馬場名を正規化
 */
export function normalizeTrackName(track: string): string {
  const trackMap: { [key: string]: string } = {
    大井: "大井競馬",
    船橋: "船橋競馬",
    川崎: "川崎競馬",
    浦和: "浦和競馬",
    中山: "中山競馬",
    東京: "東京競馬",
    阪神: "阪神競馬",
    京都: "京都競馬",
    // 必要に応じて追加
  };

  return trackMap[track] || track;
}
