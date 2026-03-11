# 南関競馬 会場データ混入バグ 修正完了レポート

## エグゼクティブサマリー

**バグID**: VENUE-MIX-001
**発生日**: 2026-03-10～12（2会場同時開催日）
**重要度**: 🔴 Critical（予想精度に直接影響）
**修正日**: 2026-03-12
**修正者**: Claude Code
**ステータス**: ✅ 修正完了・テストスイート作成完了・再発防止策実装完了

---

## 1. 問題の概要

### 1.1 症状
2026-03-11のように南関競馬で大井と船橋が同時開催される日に、**船橋のコンピ指数データに大井のtrainer/jockey情報が混入**していた。

### 1.2 影響範囲
- 汚染データ: 4ファイル（2026-03-10～12 船橋・大井）
- 影響システム: computer-manager.astro（コンピ指数管理画面）
- 影響フロー: 「競馬ブック予想」→「コンピ指数」補完処理

### 1.3 具体例
```json
// 2026-03-11 船橋 11R 10番（バグ発生時）
{
  "venue": "船橋",
  "horses": [
    {
      "number": 10,
      "name": "ワンダージャーニー",
      "trainer": "(大)渡辺和",  // ← ❌ 船橋なのに大井の調教師
      "jockey": "石崎駿",
      "computerIndex": 49
    }
  ]
}
```

---

## 2. 根本原因分析

### 2.1 原因1: ファイル取得ロジックの不備

**問題箇所**: `save-computer.mjs:173`, `preview-computer.mjs:335`

```javascript
// 【バグ】南関は日付のみでファイル名を構成（会場コードなし）
const fileName = category === 'jra'
  ? `${date}-${venueCode}.json`  // JRAは会場コード付き
  : `${date}.json`;               // 南関は会場コードなし ← バグ
```

**問題点**:
- 2026-03-11.json に大井と船橋のデータが両方含まれる
- fetchPredictionData() がこのファイルを取得
- 本来は `2026-03-11-OOI.json` と `2026-03-11-FUN.json` を個別に取得すべき

**実際のファイル構造**:
```
nankan/predictions/2026/03/
├── 2026-03-11-OOI.json  （大井予想データ）
├── 2026-03-11-FUN.json  （船橋予想データ）
```

**取得していたファイル**（存在しない）:
```
nankan/predictions/2026/03/
└── 2026-03-11.json  （存在しない、または古い統合ファイル）
```

### 2.2 原因2: レース照合ロジックの不備

**問題箇所**: `save-computer.mjs:138`, `preview-computer.mjs:256-260`

```javascript
// 【バグ】レース番号のみで照合（会場を考慮しない）
predictionRace = predictionData.races?.find(r =>
  r.raceInfo.raceNumber === `${computerRace.raceNumber}R` &&
  r.raceInfo.track === venue  // ← この行がなかった！
);
```

**問題点**:
- 大井1Rと船橋1Rが同じraceNumberを持つ
- 会場をチェックせずに最初に見つかったレースを使用
- 結果: 船橋1Rに大井1Rの予想データを補完

**誤マッチ例**:
```
コンピ指数: 船橋 1R
予想データ: [大井 1R, 船橋 1R]
マッチ結果: 大井 1R（最初に見つかった） ← バグ
```

### 2.3 原因3: 馬照合ロジックの不備

**問題箇所**: `save-computer.mjs:160-161`, `preview-computer.mjs:275-276`

```javascript
// 【バグ】馬番のみで照合（会場は既にレースレベルで誤マッチ）
let predictionHorse = predictionRace.horses.find(h =>
  h.number === computerHorse.number  // 馬番のみ
);
```

**問題点**:
- レースレベルで既に誤マッチしているため、馬レベルでも誤マッチ
- 船橋1R10番 → 大井1R10番の予想データを補完

---

## 3. 修正内容

### 3.1 修正1: ファイル取得ロジックの修正

**ファイル**: `save-computer.mjs`, `preview-computer.mjs`

```javascript
// 【修正前】
const fileName = category === 'jra' ? `${date}-${venueCode}.json` : `${date}.json`;

// 【修正後】
const fileName = `${date}-${venueCode}.json`;
```

**効果**:
- JRAも南関も常に会場コード付きファイル名を使用
- 2026-03-11-FUN.json と 2026-03-11-OOI.json を個別に取得
- 会場の混同が発生しない

**修正箇所**:
- `save-computer.mjs:223`
- `preview-computer.mjs:337`

### 3.2 修正2: レース照合ロジックの強化

**ファイル**: `save-computer.mjs`, `preview-computer.mjs`

```javascript
// 【修正後】南関：raceNumberとtrackで照合（track必須）
predictionRace = predictionData.races?.find(r => {
  const raceNum = parseInt(r.raceInfo.raceNumber) || parseInt(r.raceInfo.raceNumber.replace('R', ''));
  const predictionVenue = r.raceInfo.track || r.raceInfo.venue;

  // 会場が一致しない場合は照合しない（異会場マージ禁止）
  if (predictionVenue !== venue) {
    console.log(`[Enrich] R${computerRace.raceNumber}: 会場不一致（予想=${predictionVenue}, コンピ=${venue}）スキップ`);
    return false;
  }

  return raceNum === computerRace.raceNumber;
});
```

**効果**:
- レース番号だけでなく会場も必ずチェック
- 異会場のレースは自動的にスキップ
- 詳細なログ出力で問題を即座に検知可能

**修正箇所**:
- `save-computer.mjs:138-149`
- `preview-computer.mjs:247-273`

### 3.3 修正3: 会場混入検査（fail fast）

**ファイル**: `save-computer.mjs`, `preview-computer.mjs`

**新規追加**: `validateVenueMix()` 関数

```javascript
/**
 * 会場混入検査（fail fast）
 * trainer/jockeyに異会場の所属記号が含まれていないかチェック
 */
function validateVenueMix(horse, expectedVenue, raceNumber) {
  const venueMarks = {
    '大井': '(大)',
    '船橋': '(船)',
    '川崎': '(川)',
    '浦和': '(浦)'
  };

  const expectedMark = venueMarks[expectedVenue];
  if (!expectedMark) {
    return; // 南関以外はスキップ
  }

  // trainer/jockeyに含まれる所属記号をチェック
  const trainer = horse.trainer || '';
  const jockey = horse.jockey || '';

  // 異会場の所属記号が含まれていないかチェック
  for (const [venueName, mark] of Object.entries(venueMarks)) {
    if (venueName === expectedVenue) continue; // 同じ会場はスキップ

    if (trainer.includes(mark) || jockey.includes(mark)) {
      const errorMsg = `[Venue Mix ERROR] R${raceNumber} ${horse.number}番 ${horse.name}: 会場混入検出！ 期待=${expectedVenue}${expectedMark}, trainer=${trainer}, jockey=${jockey}`;
      console.error(errorMsg);
      throw new Error(errorMsg); // fail fast
    }
  }
}
```

**効果**:
- 補完後のデータに異会場マークがあれば即座にエラー
- 保存される前にバグを検知
- 詳細なエラーメッセージで問題箇所を特定

**呼び出し箇所**:
- `save-computer.mjs:188-190`（南関のみ）
- `preview-computer.mjs:297-299`（南関のみ）

---

## 4. 修正後のデータフロー

### 4.1 正常系フロー（修正後）

```
[Step 1] ユーザーがコンピ指数データを入力
    ↓
    日付: 2026-03-11
    会場: 船橋
    ↓
[Step 2] parseComputerData() でパース
    ↓
    venue: "船橋"
    venueCode: "FUN"
    ↓
[Step 3] fetchPredictionData() で予想データ取得
    ↓
    URL: .../nankan/predictions/2026/03/2026-03-11-FUN.json
    ✅ 会場コード付きで正しいファイルを取得
    ↓
[Step 4] enrichWithPredictionData() で補完
    ↓
    レース照合:
      - raceNumber: 1 == 1 ✅
      - predictionVenue: "船橋" == "船橋" ✅
    ↓
    馬照合:
      - number: 10 == 10 ✅
    ↓
[Step 5] validateVenueMix() で検証
    ↓
    trainer: "(船)佐藤賢" ✅ 船橋に(船)マーク
    jockey: "石崎駿" ✅
    ↓
[Step 6] 保存成功 ✅
```

### 4.2 異常系フロー（会場不一致）

```
[Step 3] fetchPredictionData() で予想データ取得
    ↓
    URL: .../nankan/predictions/2026/03/2026-03-11-FUN.json
    404 Not Found（船橋の予想データが存在しない）
    ↓
[Step 4] enrichWithPredictionData() で補完スキップ
    ↓
    ログ: "[Enrich] 予想データなし（補完スキップ）"
    ↓
    trainer: null
    jockey: null
    ↓
[Step 5] validateVenueMix() スキップ（nullなので検査不要）
    ↓
[Step 6] 保存成功（補完なし）✅
```

### 4.3 異常系フロー（会場混入検出）

```
[Step 4] enrichWithPredictionData() で補完
    ↓
    （何らかの理由で異会場データが混入）
    trainer: "(大)渡辺和"
    ↓
[Step 5] validateVenueMix() で検証
    ↓
    expectedVenue: "船橋"
    expectedMark: "(船)"
    trainer: "(大)渡辺和" に "(大)" が含まれる
    ↓
    ❌ Error: "会場混入検出！ 期待=船橋(船), trainer=(大)渡辺和"
    ↓
[Step 6] 保存失敗（fail fast）❌
```

---

## 5. テストスイート

詳細は `VENUE_MIX_TESTS.md` を参照。

### 5.1 テスト一覧
1. **テスト1**: 同日2会場運営での会場分離（正常系）
2. **テスト2**: 異会場データ補完拒否（エラー系）
3. **テスト3**: 会場マーク混入検出（fail fast）
4. **テスト4**: 単独会場運営（既存機能維持）
5. **テスト5**: raceKey/horseKey 一意性検証

### 5.2 テスト結果
- ✅ 全5テストケース作成完了
- ⏳ 実施待ち（マコさんによる実運用テスト推奨）

---

## 6. 汚染データの再生成

詳細は `CONTAMINATED_DATA_REMEDIATION.md` を参照。

### 6.1 汚染データ一覧
- 2026-03-10 船橋
- 2026-03-11 船橋
- 2026-03-11 大井
- 2026-03-12 船橋

### 6.2 再生成手順
1. 汚染ファイルを削除
2. computer-manager.astro で再入力
3. 検証スクリプトで確認

### 6.3 検証コマンド
```bash
# 異会場マークを検索
grep -E '\(大\)|\(船\)|\(川\)|\(浦\)' 2026-03-11-FUN.json

# 出力なし → ✅ 正常
```

---

## 7. 再発防止策

### 7.1 技術的対策
1. **会場コードの必須化**
   - ファイル名に常に会場コードを含める
   - JRA・南関・地方すべてで統一

2. **レース照合の厳格化**
   - 会場が一致しない場合は即座にスキップ
   - 詳細なログ出力で問題を即座に検知

3. **fail fast検証**
   - 補完後のデータに異会場マークがあれば即エラー
   - 保存される前にバグを防止

### 7.2 運用的対策
1. **テストスイート作成**
   - 5種類のテストケースで包括的にカバー
   - 今後の修正時に回帰テストとして実施

2. **汚染検出スクリプト**
   - 定期的に実行して汚染データを早期発見
   - GitHub Actionsで自動実行も検討可能

3. **ドキュメント整備**
   - バグ修正レポート（このドキュメント）
   - テストスイート（VENUE_MIX_TESTS.md）
   - 再生成手順（CONTAMINATED_DATA_REMEDIATION.md）

### 7.3 今後の拡張時の注意点
- 新しい補完フローを追加する場合は、必ず会場を考慮する
- レース照合・馬照合の際は `date + venue + raceNumber + horseNumber` をキーとする
- fail fast検証を必ず実装する

---

## 8. 影響範囲と波及効果

### 8.1 修正対象ファイル
1. `/netlify/functions/save-computer.mjs`
   - fetchPredictionData() 修正（line 223）
   - レース照合強化（line 138-149）
   - validateVenueMix() 追加（line 62-89）
   - 検証呼び出し追加（line 188-190）

2. `/netlify/functions/preview-computer.mjs`
   - fetchPredictionData() 修正（line 337）
   - レース照合強化（line 247-273）
   - validateVenueMix() 追加（line 217-244）
   - 検証呼び出し追加（line 297-299）

### 8.2 未修正ファイル（影響なし）
- `save-predictions.mjs`（レース内マージのみ、異データソース補完なし）
- `save-predictions-jra.mjs`（同上）
- `save-results.mjs`（結果データ、補完なし）
- `save-results-jra.mjs`（同上）

### 8.3 下流システムへの影響
- **keiba-computer-web**: SSRなので自動的に正しいデータを表示 ✅
- **keiba-intelligence**: 汚染データを再生成すれば正常化 ✅
- **nankan-analytics**: 同上 ✅

---

## 9. 完了基準と検証

### 9.1 完了基準
- ✅ 根本原因の特定・修正完了
- ✅ テストスイート作成完了（5ケース）
- ✅ 汚染データ再生成手順作成完了
- ✅ ドキュメント整備完了（3ドキュメント）
- ⏳ 実運用テスト待ち（マコさんによるテスト推奨）
- ⏳ 汚染データ再生成待ち（マコさんによる再入力推奨）

### 9.2 検証コマンド
```bash
# 1. コードレビュー
grep -n 'const fileName' save-computer.mjs preview-computer.mjs
# 期待: ${date}-${venueCode}.json が両方にある

# 2. 会場照合確認
grep -A5 'predictionVenue !== venue' save-computer.mjs preview-computer.mjs
# 期待: 会場不一致時にスキップするロジックがある

# 3. fail fast確認
grep -n 'validateVenueMix' save-computer.mjs preview-computer.mjs
# 期待: 関数定義と呼び出しが両方にある

# 4. 汚染検出
./detect-contaminated-data.sh
# 期待: 「=== 検出完了 ===」のみ（汚染データ0件）
```

---

## 10. 今後の課題

### 10.1 短期（1週間以内）
- [ ] 実運用テストの実施（マコさん）
- [ ] 汚染データの再生成（マコさん）
- [ ] 検証スクリプトの実行（マコさん）

### 10.2 中期（1ヶ月以内）
- [ ] 自動テストスクリプトの実装（CI/CD統合）
- [ ] GitHub Actionsで汚染検出を定期実行
- [ ] 他の補完フローの監査（results系など）

### 10.3 長期（3ヶ月以内）
- [ ] E2Eテストの追加（Playwright等）
- [ ] 型安全性の強化（TypeScript化検討）
- [ ] データバリデーションライブラリの導入（Zod等）

---

## 11. 関連ドキュメント

1. **VENUE_MIX_TESTS.md**
   - テストスイート詳細
   - 5種類のテストケース
   - 実施手順

2. **CONTAMINATED_DATA_REMEDIATION.md**
   - 汚染データ再生成手順
   - 検証コマンド
   - トラブルシューティング

3. **MULTI_VENUE_CHECK.md** (keiba-data-shared)
   - 2会場同時開催チェックリスト
   - 結果システム設計

4. **RESULTS_SYSTEM_ARCHITECTURE.md** (keiba-data-shared)
   - 結果システム全体設計

---

## 12. まとめ

### 12.1 修正の要点
1. ✅ 会場コードを常にファイル名に含める（JRA・南関統一）
2. ✅ レース照合時に会場を必ずチェック（異会場マージ禁止）
3. ✅ fail fast検証で異会場マークを検出（保存前にエラー）

### 12.2 なぜ再発しないか
- **ファイル取得**: 会場コード付きで正しいファイルのみ取得
- **レース照合**: 会場が一致しないレースは自動スキップ
- **馬照合**: 会場一致レース内でのみ実行
- **fail fast**: 万が一混入しても保存前にエラー
- **ログ充実**: 問題発生時に即座に原因を特定可能

### 12.3 今後のアクション
1. **マコさんにお願い**: 実運用テスト + 汚染データ再生成
2. **Claude**: 自動テストスクリプト実装検討
3. **チーム**: 他の補完フローの監査

---

**修正日**: 2026-03-12
**修正者**: Claude Code
**レビュアー**: マコ
**ステータス**: ✅ コード修正完了・テスト・ドキュメント整備完了
**Next Action**: 実運用テスト + 汚染データ再生成

🎉 **Thank you for your patience and collaboration!** 🎉
