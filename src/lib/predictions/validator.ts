/**
 * バリデーションロジック
 * 核データの整合性を徹底的にチェック
 */

import type {
  CorePredictionData,
  ValidationResult,
  ValidationError as ValidationErrorType,
  ExtensionFields,
  SiteProfile,
} from "../types/predictions";
import { ValidationError } from "../types/predictions";

/**
 * 核データをバリデーション
 */
export function validateCoreData(
  core: CorePredictionData
): ValidationResult {
  const errors: { type: ValidationErrorType; message: string; field?: string }[] = [];
  const warnings: { message: string; field?: string }[] = [];

  // 1. レース情報のバリデーション
  if (!core.raceInfo.raceDate) {
    errors.push({
      type: ValidationError.MissingField,
      message: "レース日付が必須です",
      field: "raceInfo.raceDate",
    });
  } else {
    // 日付形式チェック（YYYY-MM-DD）
    if (!/^\d{4}-\d{2}-\d{2}$/.test(core.raceInfo.raceDate)) {
      errors.push({
        type: ValidationError.InvalidDate,
        message: "日付形式が不正です（YYYY-MM-DD形式で入力してください）",
        field: "raceInfo.raceDate",
      });
    }
  }

  if (!core.raceInfo.track) {
    errors.push({
      type: ValidationError.MissingField,
      message: "競馬場が必須です",
      field: "raceInfo.track",
    });
  }

  if (!core.raceInfo.raceNumber) {
    errors.push({
      type: ValidationError.MissingField,
      message: "レース番号が必須です",
      field: "raceInfo.raceNumber",
    });
  }

  if (!core.raceInfo.raceName) {
    warnings.push({
      message: "レース名が未入力です",
      field: "raceInfo.raceName",
    });
  }

  if (core.raceInfo.horseCount <= 0) {
    errors.push({
      type: ValidationError.MissingField,
      message: "頭数が必須です",
      field: "raceInfo.horseCount",
    });
  }

  // 2. 馬データのバリデーション
  if (core.horses.length === 0) {
    errors.push({
      type: ValidationError.MissingField,
      message: "馬データが存在しません",
      field: "horses",
    });
  }

  // 2-1. 抽出頭数と入力頭数の一致
  if (core.horses.length !== core.raceInfo.horseCount) {
    errors.push({
      type: ValidationError.CountMismatch,
      message: `頭数が不一致です（設定: ${core.raceInfo.horseCount}頭、実際: ${core.horses.length}頭）`,
      field: "horses",
    });
  }

  // 2-2. 馬識別キー（umacd or 馬番+馬名）
  core.horses.forEach((horse, index) => {
    if (!horse.umacd && (!horse.number || !horse.name)) {
      errors.push({
        type: ValidationError.NoUmaKey,
        message: `馬識別キーが欠損しています（馬番: ${horse.number}, 馬名: ${horse.name}）`,
        field: `horses[${index}]`,
      });
    }

    // 馬番の重複チェック
    const duplicates = core.horses.filter((h) => h.number === horse.number);
    if (duplicates.length > 1) {
      errors.push({
        type: ValidationError.DuplicateMark,
        message: `馬番が重複しています（馬番: ${horse.number}）`,
        field: `horses[${index}].number`,
      });
    }
  });

  // 3. 確定印のバリデーション
  if (!core.finalMarks.main) {
    errors.push({
      type: ValidationError.MissingField,
      message: "本命◎が必須です",
      field: "finalMarks.main",
    });
  }

  if (!core.finalMarks.sub) {
    errors.push({
      type: ValidationError.MissingField,
      message: "対抗○が必須です",
      field: "finalMarks.sub",
    });
  }

  // 3-1. 印の重複チェック
  const allMarks = [
    core.finalMarks.main,
    core.finalMarks.sub,
    core.finalMarks.hole1,
    core.finalMarks.hole2,
    ...core.finalMarks.connect,
    ...core.finalMarks.reserve,
  ].filter((mark) => mark !== undefined);

  const uniqueMarks = new Set(allMarks);
  if (allMarks.length !== uniqueMarks.size) {
    errors.push({
      type: ValidationError.DuplicateMark,
      message: "印が重複しています（同じ馬番が複数の印に指定されています）",
      field: "finalMarks",
    });
  }

  // 3-2. 印の馬番が存在するかチェック
  allMarks.forEach((mark) => {
    if (mark && !core.horses.find((h) => h.number === mark)) {
      errors.push({
        type: ValidationError.MissingField,
        message: `指定された馬番 ${mark} が馬データに存在しません`,
        field: "finalMarks",
      });
    }
  });

  // 4. raw HTMLのバリデーション
  if (!core.rawHtml || core.rawHtml.length < 100) {
    errors.push({
      type: ValidationError.InvalidHtml,
      message: "raw HTMLが不正です（再現性のため必須）",
      field: "rawHtml",
    });
  }

  // 5. 予想者リストのバリデーション
  if (core.predictors.length === 0) {
    warnings.push({
      message: "予想者リストが空です",
      field: "predictors",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 拡張フィールドをバリデーション
 */
export function validateExtensions(
  extensions: ExtensionFields,
  profile: SiteProfile
): ValidationResult {
  const errors: { type: ValidationErrorType; message: string; field?: string }[] = [];
  const warnings: { message: string; field?: string }[] = [];

  // 馬ごとの拡張フィールドをバリデーション
  if (profile.extensionFields.horses) {
    profile.extensionFields.horses.forEach((fieldDef) => {
      if (fieldDef.required && !extensions.horses) {
        errors.push({
          type: ValidationError.MissingField,
          message: `拡張フィールド "${fieldDef.label}" が必須です`,
          field: `extensions.horses.${fieldDef.key}`,
        });
      }

      // 範囲チェック
      if (extensions.horses && fieldDef.type === "number") {
        Object.values(extensions.horses).forEach((horseExt: any, index) => {
          const value = horseExt[fieldDef.key];
          if (value !== undefined) {
            if (fieldDef.min !== undefined && value < fieldDef.min) {
              errors.push({
                type: ValidationError.OutOfRange,
                message: `"${fieldDef.label}" が範囲外です（最小: ${fieldDef.min}）`,
                field: `extensions.horses[${index}].${fieldDef.key}`,
              });
            }
            if (fieldDef.max !== undefined && value > fieldDef.max) {
              errors.push({
                type: ValidationError.OutOfRange,
                message: `"${fieldDef.label}" が範囲外です（最大: ${fieldDef.max}）`,
                field: `extensions.horses[${index}].${fieldDef.key}`,
              });
            }
          }
        });
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 完全なバリデーション（核＋拡張）
 */
export function validateAll(
  core: CorePredictionData,
  extensions: ExtensionFields,
  profile: SiteProfile
): ValidationResult {
  const coreResult = validateCoreData(core);
  const extensionResult = validateExtensions(extensions, profile);

  return {
    valid: coreResult.valid && extensionResult.valid,
    errors: [...coreResult.errors, ...extensionResult.errors],
    warnings: [...coreResult.warnings, ...extensionResult.warnings],
  };
}

/**
 * エラーメッセージを整形
 */
export function formatValidationErrors(result: ValidationResult): string {
  const lines: string[] = [];

  if (result.errors.length > 0) {
    lines.push("❌ エラー:");
    result.errors.forEach((error) => {
      lines.push(`  - [${error.type}] ${error.message}${error.field ? ` (フィールド: ${error.field})` : ""}`);
    });
  }

  if (result.warnings.length > 0) {
    lines.push("\n⚠️ 警告:");
    result.warnings.forEach((warning) => {
      lines.push(`  - ${warning.message}${warning.field ? ` (フィールド: ${warning.field})` : ""}`);
    });
  }

  return lines.join("\n");
}

/**
 * デバッグ用: バリデーション結果をコンソールに出力
 */
export function debugValidation(result: ValidationResult): void {
  console.log("=== バリデーション結果 ===");
  console.log(`有効: ${result.valid ? "✅" : "❌"}`);

  if (result.errors.length > 0) {
    console.error("\nエラー:");
    result.errors.forEach((error) => {
      console.error(
        `  - [${error.type}] ${error.message}${error.field ? ` (${error.field})` : ""}`
      );
    });
  }

  if (result.warnings.length > 0) {
    console.warn("\n警告:");
    result.warnings.forEach((warning) => {
      console.warn(`  - ${warning.message}${warning.field ? ` (${warning.field})` : ""}`);
    });
  }

  if (result.valid && result.warnings.length === 0) {
    console.log("\n✅ すべてのチェックに合格しました");
  }
}
