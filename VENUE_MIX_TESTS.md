# 南関競馬 会場データ混入バグ テストスイート

## テスト概要

2会場同時開催時のデータ混入を防止するための包括的テストスイート。
修正箇所: `save-computer.mjs`, `preview-computer.mjs`

---

## テスト1: 同日2会場運営での会場分離（正常系）

### 目的
2026-03-11のように大井と船橋が同時開催される日に、各会場のデータが正しく分離されることを確認する。

### テストデータ
- **日付**: 2026-03-11
- **会場1**: 大井（OOI）
- **会場2**: 船橋（FUN）

### 事前準備
1. keiba-data-sharedに以下のファイルが存在すること:
   ```
   nankan/predictions/2026/03/2026-03-11-OOI.json  （大井予想）
   nankan/predictions/2026/03/2026-03-11-FUN.json  （船橋予想）
   ```

2. 各ファイルに正しいtrackフィールドが含まれること:
   ```json
   // 2026-03-11-OOI.json
   { "track": "大井", "races": [...] }

   // 2026-03-11-FUN.json
   { "track": "船橋", "races": [...] }
   ```

### テスト手順
1. コンピ指数データ（大井）を computer-manager.astro に貼り付け
2. 日付: 2026-03-11、会場: 大井 を選択
3. 「🔍 解析実行」をクリック
4. プレビュー結果を確認
5. 補完されたtrainer/jockeyフィールドをチェック
6. 同様に船橋データでもテスト

### 期待結果
- ✅ 大井のコンピ指数 → 大井の予想データで補完
- ✅ 補完後のtrainerに `(大)` マークのみ含まれる
- ✅ 船橋のコンピ指数 → 船橋の予想データで補完
- ✅ 補完後のtrainerに `(船)` マークのみ含まれる
- ✅ 異会場のtrainer/jockeyが混入しない

### NG例（修正前）
```json
// 船橋のレースに大井のtrainerが混入（バグ）
{
  "track": "船橋",
  "horses": [
    {
      "number": 10,
      "name": "ワンダージャーニー",
      "trainer": "(大)渡辺和",  // ← NG: 船橋なのに(大)
      "jockey": "石崎駿",
      "computerIndex": 49
    }
  ]
}
```

### OK例（修正後）
```json
// 船橋のレースに船橋のtrainerのみ
{
  "track": "船橋",
  "horses": [
    {
      "number": 10,
      "name": "ワンダージャーニー",
      "trainer": "(船)佐藤賢",  // ← OK: 船橋に(船)
      "jockey": "石崎駿",
      "computerIndex": 49
    }
  ]
}
```

---

## テスト2: 異会場データ補完拒否（エラー系）

### 目的
コンピ指数の会場と予想データの会場が不一致の場合、補完を拒否することを確認する。

### テストデータ
- **コンピ指数会場**: 船橋（FUN）
- **予想データ会場**: 大井（OOI）

### 事前準備
1. keiba-data-sharedに以下のファイルが存在すること:
   ```
   nankan/predictions/2026/03/2026-03-11-OOI.json  （大井予想のみ）
   ```

2. 船橋の予想データは存在しない、または削除しておく

### テスト手順
1. コンピ指数データ（船橋）を computer-manager.astro に貼り付け
2. 日付: 2026-03-11、会場: 船橋 を選択
3. 「🔍 解析実行」をクリック
4. プレビュー結果を確認

### 期待結果
- ✅ プレビュー成功（エラーにならない）
- ✅ 補完ステータス: 「補完なし（予想データなし）」
- ✅ trainer/jockeyフィールドが null のまま
- ✅ コンソールログに以下が表示される:
  ```
  [Preview Enrich] 予想データなし（補完スキップ）
  ```
  または
  ```
  [Preview Enrich] 会場不一致: 予想データ=大井, コンピ指数=船橋
  [Preview Enrich] 補完スキップ（会場が異なるため）
  ```

### NG例（修正前）
```json
// 船橋のコンピに大井の予想データが補完される（バグ）
{
  "track": "船橋",
  "horses": [
    {
      "number": 10,
      "name": "ワンダージャーニー",
      "trainer": "(大)渡辺和",  // ← NG: 船橋に大井のtrainer
      "computerIndex": 49
    }
  ]
}
```

### OK例（修正後）
```json
// 補完スキップ、trainer/jockeyはnull
{
  "track": "船橋",
  "horses": [
    {
      "number": 10,
      "name": "ワンダージャーニー",
      "trainer": null,  // ← OK: 補完なし
      "jockey": null,
      "computerIndex": 49
    }
  ]
}
```

---

## テスト3: 会場マーク混入検出（fail fast）

### 目的
補完後のデータに異会場の所属記号が含まれている場合、即座にエラーを投げることを確認する。

### テストデータ
- **会場**: 船橋（FUN）
- **異常データ**: trainer/jockeyに `(大)`, `(川)`, `(浦)` が含まれる

### テスト方法
このテストは自動的に実行されます。もし予想データ側に異会場のマークが含まれていた場合、`validateVenueMix()` 関数が即座にエラーを投げます。

### 期待結果（異常データがある場合）
- ✅ プレビュー/保存が失敗する
- ✅ エラーメッセージが表示される:
  ```
  [Preview Venue Mix ERROR] R5 10番 ワンダージャーニー: 会場混入検出！
  期待=船橋(船), trainer=(大)渡辺和, jockey=石崎駿
  ```
- ✅ ブラウザにエラーメッセージが表示される
- ✅ データが保存されない（fail fast）

### 期待結果（正常データの場合）
- ✅ プレビュー/保存が成功する
- ✅ エラーメッセージが表示されない
- ✅ 会場マークが正しい（船橋なら `(船)` のみ）

### 検査対象
```javascript
const venueMarks = {
  '大井': '(大)',
  '船橋': '(船)',
  '川崎': '(川)',
  '浦和': '(浦)'
};
```

### テスト実施方法
1. computer-manager.astro で船橋のコンピ指数を入力
2. 「🔍 解析実行」をクリック
3. もし予想データに異会場マークが含まれていた場合:
   - エラーが表示されること
   - データが保存されないこと
   - どの馬のどのフィールドに問題があるか明示されること

---

## テスト4: 単独会場運営（既存機能維持）

### 目的
1会場のみの開催日（例: 2026-03-10 船橋のみ）でも正常に動作することを確認する。

### テストデータ
- **日付**: 2026-03-10
- **会場**: 船橋（FUN）
- **他会場**: なし（船橋のみ開催）

### 事前準備
1. keiba-data-sharedに以下のファイルが存在すること:
   ```
   nankan/predictions/2026/03/2026-03-10-FUN.json  （船橋予想のみ）
   ```

### テスト手順
1. コンピ指数データ（船橋）を computer-manager.astro に貼り付け
2. 日付: 2026-03-10、会場: 船橋 を選択
3. 「🔍 解析実行」をクリック
4. プレビュー結果を確認
5. 「🚀 保存してGit Push」をクリック

### 期待結果
- ✅ プレビュー成功
- ✅ 補完ステータス: 「12頭補完完了」（または該当頭数）
- ✅ trainer/jockeyフィールドが正しく補完される
- ✅ trainerに `(船)` マークが含まれる
- ✅ 保存成功
- ✅ GitHubに正しく保存される

### 確認コマンド
```bash
# 保存されたデータを確認
cat /Users/apolon/Projects/keiba-data-shared/nankan/predictions/computer/2026/03/2026-03-10-FUN.json | grep trainer | head -5
```

### 期待される出力
```json
"trainer": "(船)佐藤賢",
"trainer": "(船)林正人",
"trainer": "(船)川島正一",
```

---

## テスト5: raceKey/horseKey 一意性検証

### 目的
レースキーと馬キーが `date + venue + raceNumber + horseNumber` で一意に決まることを確認する。

### テスト方法
コードレビューとログ確認

### 検証ポイント

#### 1. fetchPredictionData() - ファイル名に会場コード含む
```javascript
// save-computer.mjs:223, preview-computer.mjs:337
const fileName = `${date}-${venueCode}.json`;
```
- ✅ 修正前: `${date}.json`（会場コードなし）
- ✅ 修正後: `${date}-${venueCode}.json`（会場コード付き）

#### 2. レース照合 - venue必須
```javascript
// save-computer.mjs:138-149, preview-computer.mjs:247-273
predictionRace = predictionData.races?.find(r => {
  const raceNum = parseInt(r.raceInfo.raceNumber) || ...;
  const predictionVenue = r.raceInfo.track || r.raceInfo.venue;

  // 会場が一致しない場合は照合しない（異会場マージ禁止）
  if (predictionVenue !== venue) {
    console.log(`[Enrich] R${computerRace.raceNumber}: 会場不一致（予想=${predictionVenue}, コンピ=${venue}）スキップ`);
    return false;
  }

  return raceNum === computerRace.raceNumber;
});
```

#### 3. 馬照合 - number + name
```javascript
// save-computer.mjs:160-168, preview-computer.mjs:274-282
// 馬番で一致する馬を探す（会場一致は既にレースレベルで確認済み）
let predictionHorse = predictionRace.horses.find(h =>
  h.number === computerHorse.number
);

// 馬番で見つからなければ馬名で探す
if (!predictionHorse) {
  predictionHorse = predictionRace.horses.find(h =>
    h.name === computerHorse.name
  );
}
```

### 期待結果
- ✅ 会場コードがファイル名に含まれる
- ✅ レース照合時に venue を必ずチェック
- ✅ 馬照合は会場一致が確認されたレース内でのみ実行
- ✅ 実質的なキー: `date + venueCode + raceNumber + (number or name)`

### 確認方法
```bash
# ログ確認（会場不一致でスキップされることを確認）
# computer-manager.astro でプレビューを実行し、ブラウザコンソールで確認
# 以下のようなログが出力されるはず:

[Preview Enrich] 会場一致確認: 船橋
[Preview Enrich] R1: 予想レース特定 { predictionTrack: "船橋", ... }
[Preview Enrich] R1 10番 ワンダージャーニー: マッチ成功 { matchedBy: "number", ... }
```

---

## テスト実施チェックリスト

### 事前準備
- [ ] keiba-data-sharedリポジトリを最新に同期
  ```bash
  cd /Users/apolon/Projects/keiba-data-shared
  git pull origin main
  ```

- [ ] テストデータが存在することを確認
  ```bash
  ls /Users/apolon/Projects/keiba-data-shared/nankan/predictions/2026/03/
  # 2026-03-10-FUN.json
  # 2026-03-11-OOI.json
  # 2026-03-11-FUN.json
  # などが存在することを確認
  ```

### テスト実施
- [ ] テスト1: 同日2会場運営での会場分離（大井+船橋）
- [ ] テスト2: 異会場データ補完拒否（会場コード不一致）
- [ ] テスト3: 会場マーク混入検出（fail fast動作確認）
- [ ] テスト4: 単独会場運営（既存機能維持確認）
- [ ] テスト5: raceKey/horseKey 一意性検証（コードレビュー）

### テスト後確認
- [ ] 全テストが期待通りの結果になったか
- [ ] エラーメッセージが適切に表示されたか
- [ ] ログが十分に出力されているか
- [ ] 保存されたデータに異会場マークが含まれていないか

---

## バグ再現テスト（修正前の挙動確認）

もし修正前のコードで動作を確認したい場合（非推奨）:

1. save-computer.mjs と preview-computer.mjs のバックアップを取る
2. 修正前のコード（fetchPredictionData の `${date}.json` など）に戻す
3. 2026-03-11の船橋データで解析実行
4. trainer/jockeyに `(大)` が混入することを確認
5. 即座に修正版に戻す

**⚠️ 注意**: この手順は本番環境では絶対に実行しないこと。

---

## 自動テストスクリプト（将来の実装案）

```bash
#!/bin/bash
# test-venue-mix.sh

echo "=== 南関競馬 会場データ混入バグ テストスイート ==="

# テスト1: 同日2会場
echo "[Test 1] 同日2会場運営での会場分離"
# TODO: APIを叩いてpreviewを取得、trainerフィールドを検証

# テスト2: 異会場補完拒否
echo "[Test 2] 異会場データ補完拒否"
# TODO: 存在しない会場コードでpreviewを取得、補完なしを確認

# テスト3: fail fast検証
echo "[Test 3] 会場マーク混入検出"
# TODO: 異常データを用意してエラーが出ることを確認

# テスト4: 単独会場
echo "[Test 4] 単独会場運営（既存機能維持）"
# TODO: 1会場のみの日付でテスト

# テスト5: キー一意性
echo "[Test 5] raceKey/horseKey 一意性検証"
# TODO: ログを解析してキー構造を確認

echo "=== テスト完了 ==="
```

---

**作成日**: 2026-03-12
**作成者**: Claude Code
**対象ファイル**: save-computer.mjs, preview-computer.mjs
**バグチケット**: 南関2場開催時の会場データ混入バグ
