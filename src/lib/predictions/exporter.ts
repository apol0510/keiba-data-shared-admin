/**
 * Exporterロジック
 * 核データ＋拡張フィールドを各サイト向けのJSON形式に変換
 */

import type {
  CorePredictionData,
  ExtensionFields,
  NankanAnalyticsExtension,
  SiteProfile,
  ExporterConfig,
} from "../types/predictions";
import { expandPathTemplate } from "./site-profiles";

/**
 * nankan-analytics v1スキーマにエクスポート
 */
export function exportToNankanV1(
  core: CorePredictionData,
  extensions: NankanAnalyticsExtension
): any {
  const { raceInfo, finalMarks, horses } = core;

  // 馬データを変換
  const getHorseByNumber = (num: number) => horses.find((h) => h.number === num);

  const formatHorse = (num: number | undefined, mark: string, type: string) => {
    if (!num) return null;
    const horse = getHorseByNumber(num);
    if (!horse) return null;

    const ext = extensions.horses?.[num];

    return {
      number: num,
      name: horse.name,
      mark,
      type,
      factors: [
        { icon: "★", text: ext?.evaluation || "総合評価:★★★" },
        { icon: "★", text: `累積スコア: ${ext?.score || 0}pt` },
      ],
      importance:
        mark === "◎" || mark === "○"
          ? [
              { label: "安定性", value: (ext?.stability || 0) / 100 },
              { label: "能力上位性", value: (ext?.abilityRank || 0) / 100 },
              { label: "展開利", value: (ext?.paceAdvantage || 0) / 100 },
            ]
          : [],
    };
  };

  // 本命・対抗・単穴・連下・押さえ
  const mainHorse = formatHorse(finalMarks.main, "◎", "本命");
  const subHorse = formatHorse(finalMarks.sub, "○", "対抗");
  const hole1Horse = formatHorse(finalMarks.hole1, "▲", "単穴");
  const hole2Horse = formatHorse(finalMarks.hole2, "▲", "単穴");

  const connectHorses = finalMarks.connect
    .map((num) => formatHorse(num, "△", "連下"))
    .filter((h) => h !== null);

  const reserveHorses = finalMarks.reserve
    .map((num) => formatHorse(num, "×", "押さえ"))
    .filter((h) => h !== null);

  // 買い目戦略
  const strategies = extensions.strategies || {};

  return {
    raceDate: raceInfo.raceDate,
    lastUpdated: core.lastUpdated,
    track: raceInfo.track,
    totalRaces: 1, // 単一レースの場合
    races: [
      {
        raceNumber: raceInfo.raceNumber,
        raceName: raceInfo.raceName,
        tier: "standard",
        isMainRace: false,
        displayOrder: parseInt(raceInfo.raceNumber.replace("R", ""), 10),
        raceInfo: {
          title: `${raceInfo.track}${raceInfo.raceNumber} ${raceInfo.raceName}`,
          date: raceInfo.raceDate,
          track: raceInfo.track,
          raceNumber: raceInfo.raceNumber,
          raceName: raceInfo.raceName,
          abilityIndex: "0.0",
          recommendation: "A",
          expectedReturn: "0",
          distance: raceInfo.distance,
          horseCount: raceInfo.horseCount,
          startTime: raceInfo.startTime,
          raceCondition: raceInfo.raceCondition || "",
          raceDetails: `${raceInfo.track}${raceInfo.raceNumber} ${raceInfo.distance} （${raceInfo.horseCount}頭） 発走時刻${raceInfo.startTime}`,
        },
        horses: {
          main: mainHorse,
          sub: subHorse,
          hole1: hole1Horse,
          hole2: hole2Horse,
          connect: connectHorses,
          reserve: reserveHorses,
        },
        strategies: {
          safe: {
            title: strategies.safe?.title || "🎯 少点数的中型モデル",
            bets: Array.isArray(strategies.safe?.bets)
              ? strategies.safe.bets.map((bet: string) => ({
                  type: "馬単",
                  numbers: bet,
                  odds: "3-8倍",
                }))
              : [],
            hitRate: strategies.safe?.hitRate?.toString() || "0",
            confidence: strategies.safe?.confidence || 0,
            risk: strategies.safe?.risk || "低リスク",
          },
          balance: {
            title: strategies.balance?.title || "⚖️ バランス型モデル",
            bets: Array.isArray(strategies.balance?.bets)
              ? strategies.balance.bets.map((bet: string) => ({
                  type: "馬単",
                  numbers: bet,
                  odds: "6-12倍",
                }))
              : [],
            hitRate: strategies.balance?.hitRate?.toString() || "0",
            confidence: strategies.balance?.confidence || 0,
            risk: strategies.balance?.risk || "中リスク",
          },
          aggressive: {
            title: strategies.aggressive?.title || "🚀 高配当追求型モデル",
            bets: Array.isArray(strategies.aggressive?.bets)
              ? strategies.aggressive.bets.map((bet: string) => ({
                  type: "馬単",
                  numbers: bet,
                  odds: "10-30倍",
                }))
              : [],
            hitRate: strategies.aggressive?.hitRate?.toString() || "0",
            confidence: strategies.aggressive?.confidence || 0,
            risk: strategies.aggressive?.risk || "高リスク",
          },
        },
      },
    ],
  };
}

/**
 * 汎用エクスポート（スキーマ自動判別）
 */
export function exportData(
  core: CorePredictionData,
  extensions: ExtensionFields,
  config: ExporterConfig
): any {
  switch (config.schema) {
    case "nankan-v1":
      return exportToNankanV1(core, extensions as NankanAnalyticsExtension);

    case "central-v1":
      // 中央競馬用スキーマ（将来実装）
      return {
        ...core,
        extensions,
      };

    case "custom":
    default:
      // カスタムスキーマ（核データそのまま）
      return {
        core,
        extensions,
      };
  }
}

/**
 * 複数ターゲットに一括エクスポート
 */
export function exportToMultipleTargets(
  core: CorePredictionData,
  extensions: ExtensionFields,
  profile: SiteProfile
): {
  target: string;
  path: string;
  data: any;
}[] {
  return profile.exporters.map((exporter) => ({
    target: exporter.target,
    path: expandPathTemplate(exporter.path, core.raceInfo.raceDate),
    data: exportData(core, extensions, exporter),
  }));
}

/**
 * 保存用のペイロードを生成
 */
export interface SavePayload {
  target: string;
  repository: string;
  branch: string;
  path: string;
  data: any;
  message: string;
}

export function generateSavePayload(
  core: CorePredictionData,
  extensions: ExtensionFields,
  profile: SiteProfile
): SavePayload[] {
  const exports = exportToMultipleTargets(core, extensions, profile);

  return exports.map((exp, index) => {
    const exporter = profile.exporters[index];
    return {
      target: exp.target,
      repository: exporter.repository,
      branch: exporter.branch || "main",
      path: exp.path,
      data: exp.data,
      message: `✨ 予想データ追加: ${core.raceInfo.track} ${core.raceInfo.raceNumber} ${core.raceInfo.raceDate}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>`,
    };
  });
}

/**
 * デバッグ用: エクスポート結果をコンソールに出力
 */
export function debugExport(
  core: CorePredictionData,
  extensions: ExtensionFields,
  profile: SiteProfile
): void {
  console.log("=== エクスポート結果 ===");
  console.log(`サイトプロファイル: ${profile.name}`);

  const exports = exportToMultipleTargets(core, extensions, profile);

  exports.forEach((exp, index) => {
    const exporter = profile.exporters[index];
    console.log(`\nターゲット ${index + 1}:`);
    console.log(`  名前: ${exp.target}`);
    console.log(`  リポジトリ: ${exporter.repository}`);
    console.log(`  ブランチ: ${exporter.branch || "main"}`);
    console.log(`  パス: ${exp.path}`);
    console.log(`  スキーマ: ${exporter.schema}`);
    console.log(`  データサイズ: ${JSON.stringify(exp.data).length} bytes`);
  });
}
