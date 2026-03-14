/**
 * 入力データのクリーニング処理
 *
 * スタッフ運用で混入する区切り線を除去し、既存のレース判定ロジックを維持する
 */

/**
 * 区切り線パターン（表記ゆれ・重複・Rのみ表記にも対応）
 *
 * 想定パターン:
 * - ==========   1R   ↓   ==========
 * - ========== 1R ↓ ==========
 * - ========== 1 ↓ ==========
 * - ========== 12R ==========
 * - =====1R=====
 * - === 1 ===
 *
 * 除去方針:
 * - 「=」が3個以上連続する行
 * - 数字（1-2桁）と「R」「レース」「↓」が含まれる可能性がある
 * - 前後の空白・全角スペースも許容
 */
const SEPARATOR_LINE_PATTERN = /^[\s\u3000]*={3,}.*={3,}[\s\u3000]*$/;

/**
 * 入力データから区切り線を除去
 *
 * @param input - ユーザー入力（テキストまたはHTML）
 * @returns 区切り線を除去したクリーンな入力
 */
export function removeSeparatorLines(input: string): string {
  if (!input || typeof input !== 'string') {
    return input;
  }

  // 行ごとに分割
  const lines = input.split('\n');

  // 区切り線を除去
  const cleanedLines = lines.filter(line => {
    // 区切り線パターンにマッチする行を除外
    return !SEPARATOR_LINE_PATTERN.test(line);
  });

  // 結合して返す
  return cleanedLines.join('\n');
}

/**
 * デバッグ用: 除去された行をログ出力
 *
 * @param input - 元の入力
 * @returns 除去された行の配列
 */
export function debugRemovedLines(input: string): string[] {
  if (!input || typeof input !== 'string') {
    return [];
  }

  const lines = input.split('\n');
  const removedLines = lines.filter(line => SEPARATOR_LINE_PATTERN.test(line));

  if (removedLines.length > 0) {
    console.log(`[InputCleaner] 除去された区切り線: ${removedLines.length}行`);
    removedLines.forEach((line, index) => {
      console.log(`  [${index + 1}] ${line}`);
    });
  }

  return removedLines;
}

/**
 * 入力データのクリーニング（メイン処理）
 *
 * @param input - ユーザー入力
 * @returns クリーンな入力
 */
export function cleanInput(input: string): string {
  // デバッグログ出力
  debugRemovedLines(input);

  // 区切り線を除去
  return removeSeparatorLines(input);
}
