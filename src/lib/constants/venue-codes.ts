/**
 * JRA競馬場コード定義（中央競馬10場）
 *
 * ⚠️ 重要：keiba-data-sharedの表示側と完全に統一すること
 *
 * 使用箇所：
 * - results-manager-jra.astro（個別入力）
 * - results-manager-jra-batch.astro（一括入力）
 * - predictions-manager-jra.astro（予想・個別入力）
 * - predictions-manager-jra-batch.astro（予想・一括入力）
 * - save-results-jra.mjs（Netlify Function）
 * - save-predictions-jra.mjs（Netlify Function）
 *
 * 参考：keiba-data-shared/src/pages/jra/results/[year]/[month]/[day]/[venue]/index.astro
 */

export const JRA_VENUE_CODE_MAP: Record<string, string> = {
  '東京': 'TOK',
  '中山': 'NAK',
  '京都': 'KYO',
  '阪神': 'HAN',
  '中京': 'CHU',
  '新潟': 'NII',
  '福島': 'FKU',
  '小倉': 'KOK',
  '札幌': 'SAP',
  '函館': 'HKD'
} as const;

/**
 * 競馬場名から競馬場コードを取得
 * @param venueName 競馬場名（例：'東京'）
 * @returns 競馬場コード（例：'TOK'）、存在しない場合はデフォルト 'TOK'
 */
export function getVenueCode(venueName: string): string {
  return JRA_VENUE_CODE_MAP[venueName] || 'TOK';
}

/**
 * 競馬場コードから競馬場名を取得（逆引き）
 * @param venueCode 競馬場コード（例：'TOK'）
 * @returns 競馬場名（例：'東京'）、存在しない場合はnull
 */
export function getVenueName(venueCode: string): string | null {
  const entry = Object.entries(JRA_VENUE_CODE_MAP).find(([_, code]) => code === venueCode);
  return entry ? entry[0] : null;
}

/**
 * 全競馬場名のリスト
 */
export const JRA_VENUE_NAMES = Object.keys(JRA_VENUE_CODE_MAP);

/**
 * 全競馬場コードのリスト
 */
export const JRA_VENUE_CODES = Object.values(JRA_VENUE_CODE_MAP);
