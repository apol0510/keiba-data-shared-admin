# 結果システム設計参照

## 設計本体の場所

**結果システムの設計は以下を参照:**

```
../keiba-data-shared/RESULTS_SYSTEM_ARCHITECTURE.md
```

---

## このプロジェクトの役割

**keiba-data-shared-admin**は
結果JSONを生成する役割のみを持つ。

---

## JSON形式

**会場別ファイル形式:**

```
YYYY-MM-DD-OOI.json   # 大井
YYYY-MM-DD-FUN.json   # 船橋
YYYY-MM-DD-KAW.json   # 川崎
YYYY-MM-DD-URA.json   # 浦和
```

**統合ファイル形式（旧）:**

```
YYYY-MM-DD.json       # 1日1ファイル（フォールバック用）
```

---

## データフロー

```
南関公式サイト
  ↓
results-manager.astro（このプロジェクト）
  ↓
parse-nankan-results.js（パース処理）
  ↓
GitHub push（keiba-data-shared）
  ↓
各サイトで自動取り込み
```

---

## 重要な注意事項

**JSON形式を変更する場合:**

1. `keiba-data-shared/RESULTS_SYSTEM_ARCHITECTURE.md` を必ず確認
2. 会場別ファイル優先、統合ファイルはフォールバックのみ
3. venue mapping（OOI/FUN/KAW/URA）を変更しない

---

**最終更新**: 2026-03-10
**作成者**: Claude (クロちゃん)
