# 汚染データ再生成手順

## 概要

南関競馬の2会場同時開催時に発生した会場データ混入バグにより、以下の日付のコンピ指数データが汚染されています。
このドキュメントでは、汚染されたデータを正しいデータに再生成する手順を説明します。

---

## 汚染されたデータ一覧

### 確認済み汚染データ
- **2026-03-10 船橋** (`nankan/predictions/computer/2026/03/2026-03-10-FUN.json`)
- **2026-03-11 船橋** (`nankan/predictions/computer/2026/03/2026-03-11-FUN.json`)
- **2026-03-11 大井** (`nankan/predictions/computer/2026/03/2026-03-11-OOI.json`)
- **2026-03-12 船橋** (`nankan/predictions/computer/2026/03/2026-03-12-FUN.json`)

### 汚染の内容
船橋のレースに大井のtrainer/jockeyが混入
```json
// 例: 2026-03-11 船橋 11R 10番
{
  "number": 10,
  "name": "ワンダージャーニー",
  "trainer": "(大)渡辺和",  // ← 船橋なのに(大)マーク
  "jockey": "石崎駿",
  "computerIndex": 49
}
```

---

## 再生成の前提条件

### 必要な修正が完了していること
- ✅ save-computer.mjs の修正完了
- ✅ preview-computer.mjs の修正完了
- ✅ validateVenueMix() 関数追加済み
- ✅ keiba-data-shared-admin にデプロイ済み

### 必要なデータ
- ✅ コンピ指数の元データ（テキストまたはHTML）
- ✅ 予想データ（補完元、keiba-data-sharedに存在）

---

## 再生成手順（標準フロー）

### Step 1: 元データの入手

#### 方法A: ローカルバックアップから復元
もし元のコンピ指数テキストが残っている場合:
```bash
# ローカルに保存していた場合
ls ~/Downloads/computer-index-2026-03-11-funabashi.txt
```

#### 方法B: keiba-data-sharedから削除して再入力
```bash
cd /Users/apolon/Projects/keiba-data-shared

# 汚染ファイルを削除
git rm nankan/predictions/computer/2026/03/2026-03-11-FUN.json

git commit -m "🗑️ 汚染データ削除: 2026-03-11 船橋コンピ指数

会場混入バグにより大井のtrainer/jockeyが混入していたため削除。
修正後のcomputer-manager.astroで再入力予定。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

git push origin main
```

### Step 2: computer-manager.astroで再入力

1. **https://keiba-data-shared-admin.netlify.app/admin/computer-manager** にアクセス

2. **コンピ指数データを貼り付け**
   - 元データ（テキストまたはHTML）をコピー
   - 「コンピ指数データ」欄に貼り付け

3. **日付・会場を選択**
   - 日付: 2026-03-11
   - 会場: 船橋

4. **🔍 解析実行**
   - パース結果を確認
   - レース数・馬数が正しいか確認

5. **プレビュー確認**
   - 補完ステータスを確認（「12頭補完完了」など）
   - trainer/jockeyフィールドを目視確認
   - **重要**: trainerに `(船)` マークのみ含まれることを確認
   - `(大)`, `(川)`, `(浦)` が含まれていないことを確認

6. **🚀 保存してGit Push**
   - 保存成功メッセージを確認
   - GitHubに自動コミット・プッシュされる

### Step 3: 保存後の検証

```bash
cd /Users/apolon/Projects/keiba-data-shared

# リモートから最新データを取得
git pull origin main

# 再生成されたファイルを確認
cat nankan/predictions/computer/2026/03/2026-03-11-FUN.json | jq '.races[0].horses[0]'

# trainerフィールドをチェック
grep -o '"trainer": "[^"]*"' nankan/predictions/computer/2026/03/2026-03-11-FUN.json | head -10

# 期待される出力（すべて(船)マーク）:
# "trainer": "(船)佐藤賢"
# "trainer": "(船)林正人"
# "trainer": "(船)川島正一"
# ...
```

### Step 4: 異会場マークがないことを確認

```bash
# 異会場マークを検索（何も表示されなければOK）
grep -E '\(大\)|\(川\)|\(浦\)' nankan/predictions/computer/2026/03/2026-03-11-FUN.json

# 出力なし → ✅ 正常
# 出力あり → ❌ まだ汚染されている（Step 2を再実行）
```

---

## 一括再生成スクリプト（推奨）

もし複数日付のデータを一度に再生成する場合:

```bash
#!/bin/bash
# regenerate-contaminated-data.sh

DATES=(
  "2026-03-10:FUN"  # 船橋のみ
  "2026-03-11:FUN"  # 船橋
  "2026-03-11:OOI"  # 大井
  "2026-03-12:FUN"  # 船橋
)

echo "=== 汚染データ一括削除 ==="

cd /Users/apolon/Projects/keiba-data-shared

for ENTRY in "${DATES[@]}"; do
  DATE=$(echo $ENTRY | cut -d: -f1)
  VENUE_CODE=$(echo $ENTRY | cut -d: -f2)

  FILE="nankan/predictions/computer/${DATE:0:4}/${DATE:5:2}/${DATE}-${VENUE_CODE}.json"

  if [ -f "$FILE" ]; then
    echo "削除: $FILE"
    git rm "$FILE"
  else
    echo "スキップ（存在しない）: $FILE"
  fi
done

git commit -m "🗑️ 汚染データ一括削除: 2026-03-10～12

会場混入バグにより異会場のtrainer/jockeyが混入していたため削除。
修正後のcomputer-manager.astroで再入力予定。

対象日付:
- 2026-03-10 船橋
- 2026-03-11 船橋
- 2026-03-11 大井
- 2026-03-12 船橋

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

git push origin main

echo "=== 削除完了 ==="
echo "次の手順: computer-manager.astro で各日付を再入力してください"
```

実行方法:
```bash
chmod +x regenerate-contaminated-data.sh
./regenerate-contaminated-data.sh
```

---

## 汚染検出スクリプト（他の日付もチェック）

もし他の日付にも汚染がないか心配な場合:

```bash
#!/bin/bash
# detect-contaminated-data.sh

echo "=== 汚染データ検出スクリプト ==="

cd /Users/apolon/Projects/keiba-data-shared

# 南関コンピ指数ファイルをすべて検索
FILES=$(find nankan/predictions/computer -name "*.json" -type f)

for FILE in $FILES; do
  # ファイル名から会場コードを抽出（例: 2026-03-11-FUN.json → FUN）
  VENUE_CODE=$(basename "$FILE" .json | cut -d- -f4)

  # 会場コードから会場名を取得
  case "$VENUE_CODE" in
    "OOI") VENUE="大井"; EXPECTED_MARK="(大)" ;;
    "FUN") VENUE="船橋"; EXPECTED_MARK="(船)" ;;
    "KAW") VENUE="川崎"; EXPECTED_MARK="(川)" ;;
    "URA") VENUE="浦和"; EXPECTED_MARK="(浦)" ;;
    *) continue ;;  # 南関以外はスキップ
  esac

  # 異会場マークを検索
  if [ "$VENUE" = "大井" ]; then
    BAD_MARKS=$(grep -oE '\(船\)|\(川\)|\(浦\)' "$FILE" 2>/dev/null | wc -l)
  elif [ "$VENUE" = "船橋" ]; then
    BAD_MARKS=$(grep -oE '\(大\)|\(川\)|\(浦\)' "$FILE" 2>/dev/null | wc -l)
  elif [ "$VENUE" = "川崎" ]; then
    BAD_MARKS=$(grep -oE '\(大\)|\(船\)|\(浦\)' "$FILE" 2>/dev/null | wc -l)
  elif [ "$VENUE" = "浦和" ]; then
    BAD_MARKS=$(grep -oE '\(大\)|\(船\)|\(川\)' "$FILE" 2>/dev/null | wc -l)
  fi

  if [ $BAD_MARKS -gt 0 ]; then
    echo "❌ 汚染検出: $FILE ($VENUE: 異会場マーク ${BAD_MARKS}件)"
  fi
done

echo "=== 検出完了 ==="
```

実行方法:
```bash
chmod +x detect-contaminated-data.sh
./detect-contaminated-data.sh
```

期待される出力（汚染がある場合）:
```
=== 汚染データ検出スクリプト ===
❌ 汚染検出: nankan/predictions/computer/2026/03/2026-03-10-FUN.json (船橋: 異会場マーク 15件)
❌ 汚染検出: nankan/predictions/computer/2026/03/2026-03-11-FUN.json (船橋: 異会場マーク 18件)
❌ 汚染検出: nankan/predictions/computer/2026/03/2026-03-12-FUN.json (船橋: 異会場マーク 12件)
=== 検出完了 ===
```

期待される出力（汚染がない場合）:
```
=== 汚染データ検出スクリプト ===
=== 検出完了 ===
```

---

## トラブルシューティング

### Q1: 再入力しても異会場マークが含まれる

**原因**: 予想データ側が汚染されている可能性

**解決策**:
```bash
# 予想データを確認
cat /Users/apolon/Projects/keiba-data-shared/nankan/predictions/2026/03/2026-03-11-FUN.json | jq '.races[0].horses[0]'

# trainerに異会場マークがないか確認
grep -E '\(大\)|\(川\)|\(浦\)' /Users/apolon/Projects/keiba-data-shared/nankan/predictions/2026/03/2026-03-11-FUN.json

# もし予想データ側にも汚染がある場合:
# predictions-manager.astro で予想データを再入力する必要があります
```

### Q2: validateVenueMix() がエラーを投げる

**原因**: 予想データに異会場マークが含まれている

**解決策**:
1. エラーメッセージを確認（どの馬のどのフィールドに問題があるか表示される）
2. 予想データを確認して修正
3. 再度コンピ指数を入力

### Q3: 補完が実行されない（trainer/jockeyがnull）

**原因**: 予想データが存在しない、または会場コードが一致しない

**解決策**:
```bash
# 予想データの存在確認
ls /Users/apolon/Projects/keiba-data-shared/nankan/predictions/2026/03/ | grep 2026-03-11

# 2026-03-11-FUN.json が存在することを確認
# 存在しない場合: predictions-manager.astro で予想データを先に入力
```

### Q4: git push が失敗する

**原因**: リモートに新しいコミットがある

**解決策**:
```bash
cd /Users/apolon/Projects/keiba-data-shared

# リモートから最新を取得
git pull origin main

# 再度プッシュ
git push origin main
```

---

## 検証チェックリスト

再生成後、以下を確認してください:

- [ ] ファイルが正しい場所に保存されている
  ```
  nankan/predictions/computer/YYYY/MM/YYYY-MM-DD-{venueCode}.json
  ```

- [ ] trainerフィールドに正しい会場マークが含まれている
  - 大井: `(大)` のみ
  - 船橋: `(船)` のみ
  - 川崎: `(川)` のみ
  - 浦和: `(浦)` のみ

- [ ] 異会場マークが含まれていない
  ```bash
  # 例: 船橋ファイルに (大)(川)(浦) が含まれていないこと
  grep -E '\(大\)|\(川\)|\(浦\)' 2026-03-11-FUN.json
  # 出力なし → OK
  ```

- [ ] jockeyフィールドが正しく補完されている

- [ ] computerIndexフィールドが保持されている

- [ ] enrichedFrom フィールドが "predictions" になっている

- [ ] enrichedAt フィールドにタイムスタンプが記録されている

---

## 将来の再発防止

### 修正内容
1. **fetchPredictionData()**: 常に会場コード付きファイル名を使用
   ```javascript
   const fileName = `${date}-${venueCode}.json`;
   ```

2. **レース照合**: venue必須チェック
   ```javascript
   if (predictionVenue !== venue) {
     console.log(`会場不一致スキップ`);
     return false;
   }
   ```

3. **validateVenueMix()**: fail fast検証
   ```javascript
   if (trainer.includes(mark) || jockey.includes(mark)) {
     throw new Error(`会場混入検出！`);
   }
   ```

### 今後の運用
- ✅ 2会場同時開催でも正しく分離される
- ✅ 異会場のデータは自動的に除外される
- ✅ 異会場マークがあれば即座にエラー
- ✅ 手動でのチェックは不要（自動検証）

---

## 完了報告

すべての汚染データを再生成したら、以下を確認してください:

```bash
# 検証スクリプトを実行
./detect-contaminated-data.sh

# 出力が「=== 検出完了 ===」のみなら完了
```

**完了基準**:
- ✅ 検出スクリプトで汚染データが0件
- ✅ 各ファイルに正しい会場マークのみ含まれる
- ✅ GitHubに正しいデータがプッシュされている
- ✅ keiba-computer-web で正しい表示がされる（SSRなので自動反映）

---

**作成日**: 2026-03-12
**作成者**: Claude Code
**関連ドキュメント**: VENUE_MIX_TESTS.md
