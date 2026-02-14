# 競馬場コード統一ガイド

## 🚨 重要：競馬場コードの一元管理

JRA競馬場コードは **`src/lib/constants/venue-codes.ts`** で一元管理されています。

### ❌ やってはいけないこと

```typescript
// ❌ 各ファイルで個別に定義しない
const venueCodeMap = {
  '東京': 'TOK',  // ← 個別定義はNG
  '京都': 'KYO',
  // ...
};
```

### ✅ 正しい方法

```typescript
// ✅ 共通定数をインポートして使用
import { JRA_VENUE_CODE_MAP, getVenueCode } from '../../lib/constants/venue-codes';

// パターン1: オブジェクトをそのまま使う
const venueCode = JRA_VENUE_CODE_MAP['東京'];  // 'TOK'

// パターン2: 関数を使う（デフォルト値付き）
const venueCode = getVenueCode('東京');  // 'TOK'
const venueCode = getVenueCode('存在しない');  // 'TOK'（デフォルト）
```

## 📋 現在の競馬場コード定義

| 競馬場 | コード | 備考 |
|--------|--------|------|
| 東京 | TOK | ⚠️ TKY ではない |
| 中山 | NAK | |
| 京都 | KYO | |
| 阪神 | HAN | |
| 中京 | CHU | |
| 新潟 | NII | |
| 福島 | FKU | |
| 小倉 | KOK | ⚠️ KKU ではない |
| 札幌 | SAP | |
| 函館 | HKD | |

## 🔄 変更が必要な場合

競馬場コードを変更する必要がある場合は、以下の手順に従ってください：

### 1. 共通定数ファイルを修正

**ファイル:** `src/lib/constants/venue-codes.ts`

```typescript
export const JRA_VENUE_CODE_MAP: Record<string, string> = {
  '東京': 'TOK',  // ← ここを修正
  // ...
} as const;
```

### 2. keiba-data-sharedの表示側も確認

**重要:** keiba-data-sharedリポジトリの以下のファイルも同じコードを使っているか確認してください：

- `src/pages/jra/results/[year]/[month]/[day]/[venue]/index.astro`
- `src/pages/jra/results/[year]/[month]/[day]/[venue]/[race]/index.astro`

### 3. 既存データの移行

競馬場コードを変更した場合、既存のJSONファイル名も変更する必要があります：

```bash
# 例: TOK → TKY に変更する場合
cd /Users/apolon/Projects/keiba-data-shared
git mv jra/results/2026/02/2026-02-14-TOK.json jra/results/2026/02/2026-02-14-TKY.json
git commit -m "🔄 競馬場コード変更: TOK → TKY"
git push origin main
```

## 📝 使用箇所

### keiba-data-shared-admin

- ✅ `src/pages/admin/results-manager-jra.astro`
- ✅ `src/pages/admin/results-manager-jra-batch.astro`
- ⚠️ `src/pages/admin/predictions-manager-jra.astro`（今後対応）
- ⚠️ `src/pages/admin/predictions-manager-jra-batch.astro`（今後対応）
- ⚠️ `netlify/functions/save-results-jra.mjs`（今後対応）
- ⚠️ `netlify/functions/save-predictions-jra.mjs`（今後対応）

### keiba-data-shared（表示側）

- `src/pages/jra/results/[year]/[month]/[day]/[venue]/index.astro`
- `src/pages/jra/results/[year]/[month]/[day]/[venue]/[race]/index.astro`

## 🐛 過去のバグ事例

### 2026-02-14: 東京のページが404エラー

**原因:**
- 保存側: `'東京': 'TKY'`
- 表示側: `'東京': 'TOK'`
→ ファイル名が `2026-02-14-TKY.json` で保存されたが、表示側は `2026-02-14-TOK.json` を探していた

**解決策:**
- 共通定数ファイル `venue-codes.ts` を作成
- 全ファイルで同じ定数を参照するように統一

## ⚡ まとめ

- ✅ 競馬場コードは `src/lib/constants/venue-codes.ts` で一元管理
- ✅ 個別定義は禁止
- ✅ 変更時は keiba-data-shared の表示側も確認
- ✅ 既存データの移行も忘れずに
