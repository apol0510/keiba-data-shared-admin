# CLAUDE.archive.md — 過去の修正履歴・完了済みPhase

> 現在の運用には不要だが、過去の経緯を確認する際に参照する。

---

## Phase完了チェックリスト

### Phase 1: セットアップ（完了）
- プロジェクト作成、Astro設定、results-manager基本実装、Netlify Function実装

### Phase 2: results-manager完成（完了）
- 全着順データ抽出（15頭対応）、払戻金全券種、タイムデータ、コーナー通過順、レース名抽出
- レースコメント自動生成機能（SEO最適化、250文字）

### Phase 3: デプロイ（完了）
- Git初期化、GitHub連携、Netlifyデプロイ、環境変数設定

### Phase 4-6: 予想管理・JRA対応（完了）
- predictions-manager（南関）、predictions-batch（南関一括）
- predictions-manager-jra / jra-batch（JRA対応）
- results-manager-central（JRA結果）
- computer-manager（コンピ指数、全24競馬場）

### Phase 7: keiba-intelligence自動判定連携（2026-02-28完了）
- repository_dispatch連携、環境変数追加、タイムゾーン修正

### Phase 8: race-data-importer（2026-04完了）
- 統合入力基盤、特徴量実装、地方全場対応

---

## バグ修正履歴

### 2026-04-09: 小頭数レースで馬番単独行パターンに対応（4R検出漏れ修正）
- **原因**: 枠番=馬番の小頭数レースでデータソースが「馬番 馬名」を1行にせず馬番のみの独立行にする
- **修正**: parseTextRace にフォールバック検出、parseTextHorse に馬番単独行対応を追加

### 2026-03-14: スタッフ運用の区切り線自動除去機能を実装
- **背景**: 区切り線 `==========   1R   ↓   ==========` が解析を壊す可能性
- **修正**: `src/lib/utils/input-cleaner.ts` 作成、全5ページに適用
- **正規表現**: `/^[\s\u3000]*={3,}.*={3,}[\s\u3000]*$/`

### 2026-03-07: 複数会場開催日のアーカイブ反映問題の解決
- **原因**: 日付の存在のみチェックし会場数を確認していなかった
- **修正**: import-results-jra-daily.yml に会場数チェックロジック追加

### 2026-03-03 (a): 11Rレース名が空欄になる問題
- **原因**: カタカナ主体レース名（「ブルートシュタインチャレンジ」）が検出できなかった
- **修正**: 抽出優先順位4「カタカナ主体レース名（5文字以上）」を新設

### 2026-03-03 (b): Git競合解決ロジックの修正
- **原因**: unmerged files検出後、indexクリアせずgit reset --hard実行
- **修正**: 2段階リセット（git reset → git reset --hard origin/main）を全6ワークフローに適用

### 2026-03-02: タイムゾーンずれによる自動判定失敗
- **原因**: save-results-jra.mjs が送信した日付とワークフロー実行時のJST日付がずれる
- **修正**: client_payload.date を優先使用

### 2026-03-01: JRA予想統合ワークフロー：コンピ指数ファイル除外
- **原因**: merge-jra-predictions.yml がコンピ指数ファイルも検出対象にしていた
- **修正**: `!jra/predictions/computer/**` を除外パスに追加

### 2026-02-28 (a): Claudeがデータを見つけられない問題
- **原因**: ローカルのkeiba-data-sharedが古く、git pullしていなかった
- **修正**: CLAUDE.mdにgit pull必須手順追加、package.jsonに自動同期スクリプト追加

### 2026-02-28 (b): keiba-intelligence自動判定が実行されない
- **原因**: repository_dispatch連携が未実装
- **修正**: save-results-jra.mjs / save-results.mjs にrepository_dispatch送信を追加

### 2026-02-16: JRA一括入力レース番号検出の堅牢性強化
- **原因**: 正規表現が「11レース」から「1レース」を2回マッチ
- **修正**: 単語境界チェック + 重複除去

### 2026-02-14 (a): JRA結果データ保存後に404エラー
- **原因**: trigger-netlify-build.yml が南関のみ対応
- **修正**: JRAパスを追加

### 2026-02-14 (b): JRA競馬場コード不一致による404エラー
- **原因**: 保存側（TKY）と表示側（TOK）で不一致
- **修正**: `src/lib/constants/venue-codes.ts` で一元管理

### 2026-02-12 (a): 13頭立てレースで8頭しか処理されない
- **原因**: extractResults 関数が最小フィールド数14を要求
- **修正**: 最小フィールド数を14→10に緩和

### 2026-02-12 (b): 着差スペース区切りによる「NaN番人気」
- **原因**: 着差「２ 1/2」でフィールドがずれる
- **修正**: 最後のフィールドから逆算する方式に変更

### 2026-02-12 (c): 出走頭数フィールドの追加
- **原因**: results-batch.astro の data オブジェクトに horses フィールドが欠落
- **修正**: `horses: raceInfo.horses || results.length` を追加

### 2026-02-12 (d): 連下の頭数制限を5頭から3頭に変更
- **原因**: predictions-batch のみ5頭設定が残っていた
- **修正**: 全4ページで連下1〜3頭に統一

---

## 過去の成果ログ

### 2026-02-15: コンピ指数管理システム完全実装
- computer-manager.astro + parse/preview/save-computer.mjs
- 全24競馬場対応、競馬場コード3文字統一、予想データ自動補完

### 2026-02-08: JRA予想管理完全実装
- predictions-manager-jra + jra-batch + save-predictions-jra.mjs
- JRA特有HTML対応、スコアリング、一括入力

### 2026-02-06: 中央競馬結果管理対応完了
- results-manager-central.astro + save-results-central.mjs

### 2026-02-01: predictions-batch 完全実装
- 12レース一括処理、レース境界自動検出

### 2026-01-30: predictions-manager 完全実装
- 著作権対応、スコアリング&自動振り分け、GitHub連携

### 2026-01-28: レースコメント自動生成機能
- SEO最適化、逃げ馬自動特定、250文字

---

## 手動実行コマンド（過去のデータをインポートする場合）
```bash
cd /Users/apolon/Projects/keiba-intelligence
gh workflow run import-results-jra.yml -f date=2026-03-01
```
