# JRA racebook 外字馬名欠落バグ（read-only 監査記録）

> 中央JRA の racebook 生成で、外国産馬「(外)」/ 地方馬「(地)」等のマーカーが
> PDF 由来の **PUA 外字グリフ1文字だけ**になり、**カタカナ馬名本体が欠落**する問題の記録。
> 2026-06-06 東京11R「(外)スナッピードレッサ」で表面化（AK 不要馬化 / KI 過去走・詳細欠落）。
>
> 本書は **read-only 監査結果の記録**であり、実装・JSON 再生成・shared PUT・dispatch は含まない。

関連: [docs/nankan-horse-detail-display-plan.md](nankan-horse-detail-display-plan.md) /
[docs/jra-horse-histories-operation.md](jra-horse-histories-operation.md)

---

## 1. 現象

2026-06-06 東京11R 麦秋S（ダ1400m）12番「(外)スナッピードレッサ」について:

- 日刊コンピ / shared computer では **index 82・1位で正常**。
- **AK free JRA では不要馬側に落ちた**（role「無」/ pt 70）。
- **KI free JRA では上位表示はされる**（pt 152 / 本命）**が、過去5走・詳細データが欠落**。
- 画像確認上 AK/KI で症状が異なるが、**根本原因は同じ shared racebook の馬名欠落**。

---

## 2. shared データ上の確認結果

```text
computer:
- jra/predictions/computer/2026/06/2026-06-06-TOK.json
- R11 #12 name="(外)スナッピードレッサ"
- computerIndex=82
- popularity=1
- 正常

racebook:
- jra/racebook/2026/06/2026-06-06-TOK.json
- R11 #12 name=""
- U+E615 外字1文字のみ
- 馬名本体「スナッピードレッサ」が欠落
- assignment / ranking / totalScore は存在（=不要馬ではない。racebook 上は assignment="対抗" ranking=1）

horseHistories:
- jra/horseHistories/2026/06/2026-06-06-TOK.json
- horseName="スナッピードレッサ"（外なし、horseId キー）
- recent5 あり
- 正常
```

---

## 3. 原因箇所

```text
生成スクリプト:
src/pages/admin/race-data-importer.astro
（ブラウザ側 JS パーサー。pdftohtml -xml 貼り付け → parseAllRaces() →
 racebook JSON 生成 → save-keiba-book.mjs に POST）

該当箇所:
extractHorse() の馬名抽出処理（676–681 行付近）

原因:
- 馬名抽出で nameEls を height 降順に並べ、最初の1要素 nameEls[0] だけを馬名にしている
- 外国産馬 / 地方馬では、(外) / (地) のマーカーが PUA 外字グリフとして別 text 要素になっている
- その外字要素が height ソートで先頭になり馬名として採用され、カタカナ馬名本体が破棄される
- 馬名フィールドには normPUA が適用されていない
  （raceClass / jockey / distance 等は normPUA 適用済なのに馬名だけ素の .text.trim()）
- 通常馬は名前要素が1個なので偶然成立しているだけ
```

---

## 4. 外字の意味

今回 computer 側（同会場・同 raceNumber+horseNumber の正規名）と突合して確認:

```text
U+E615 = (外)   外国産馬
U+E618 = (地)   地方馬
```

2026-06-06 TOK で確認できた同型欠落 6頭:

```text
R6  #11  U+E615  (外)ラッキースウィッチ
R7  #12  U+E615  (外)モンドシュピーゲル
R11 #12  U+E615  (外)スナッピードレッサ
R9  #6   U+E618  (地)リリエンフェルト
R10 #7   U+E618  (地)タイキエクセロン
R12 #7   U+E618  (地)アイファーファイト
```

> 補足: computer のテキスト入力ではマーカーが**漢字「外/地」**で来るため
> `parse-computer.mjs` の `/^(地|外|抽|父|市)/ → ($1)` 変換で正しく「(外)/(地)」化される。
> racebook の XML 入力ではマーカーが**PUA 外字グリフ**で来るため、馬名用のデコードが無く欠落する。
> 既存 PUA マップ（`netlify/lib/pua-distance-map.json` = 距離専用 E567–E587 / `PUA_MARK_MAP` = 印専用）
> はいずれも馬名マーカー用ではなく、U+E615/U+E618 はどこにもマップされていない。

---

## 5. AK / KI への波及

AK 側:

```text
- AK は computer 注入で num|name の複合キー（importPredictionJra.js）を使う
- racebook 側の馬名が空 / 外字のみになると、computer 側の "(外)スナッピードレッサ" と一致しない
- さらに base 馬名が空だと if (!name) continue で注入対象から除外される
- その結果 sourceComputerIndex が欠落
- computerIndex=0 扱いになり、pt 低下・不要馬化する
```

KI 側:

```text
- KI は computer base なので score / role は比較的正常（pt 152 / 本命）
- しかし racebook 補完は馬名キー（normalizeHorseName で (外)/(地) を剥がす）で行う
- racebook 側が ""、base 側が "スナッピードレッサ" となり突合失敗
  （normalizeHorseName の正規表現はテキストの "(外)" しか剥がさず、PUA 外字グリフは戻せない）
- recentRaces / sire / predictedOdds / recentFormSource が欠落する
```

---

## 6. 原因分類

```text
A. 馬名正規化ミス: 主因（外字 U+E615/U+E618 をデコードせず馬名本体ごと欠落）
B. 馬番ではなく馬名キー突合に依存: 増幅要因（AK=num|name 完全一致 / KI=馬名のみ）
C. featureScores fallback: 直接原因ではない
D. AK/KI 解釈差: 同一 shared 欠陥が別症状として出ている（AK=不要馬化 / KI=詳細欠落）
E. 過去走経路差: AK/KI で症状差を生む要因
```

---

## 7. 修正方針比較

### A. race-data-importer 側で馬名外字を正しく処理

```text
- nameEls を1要素だけ採用するのではなく、馬名関連要素を結合する
- U+E615 / U+E618 を (外)/(地) に変換
- カタカナ馬名本体を落とさない
- 出力は computer と同形の "(外)スナッピードレッサ" にする
  （AK の num|name 完全一致 / KI の normalizeHorseName 前提のため）
- 根本修正だが、生 XML で要素構造（カタカナ名要素が現フィルタを通過しているか／
  結合範囲で通常馬を壊さないか）の確認が必要
```

### B. save-keiba-book 側で computer から補完

```text
- racebook 馬名が空 / PUA 外字のみの場合、同一 raceNumber + horseNumber の computer name で補完
- save-keiba-book.mjs は既にコンピ補完で computer を参照済
- 2026-06-06 TOK のような既存問題に対して確実
- XML 構造に依存しない
- 通常馬に一切触れない（壊れた馬だけ修復）= 最小リスク
- 推奨される安全網
```

### C. horseHistories から補完

```text
- horseHistories は外なし馬名のため、computer ("(外)…") との完全一致には不向き
- 主修正にはしない
```

### D. AK/KI 側の馬番フォールバック

```text
- 表示側の防御としては有効
- ただし shared racebook が壊れたまま残るため、主修正にはしない
- 必要なら後続で AK/KI 両方に同時追加（片寄せ禁止）
```

推奨方針:

```text
まず B を安全網として実装し、可能なら A を生 XML 確認後に実装する。
出力形は必ず computer と同一の "(外)/(地)+名"。
AK/KI だけの片側修正は禁止。
```

---

## 8. 最小安全 PR 分割

```text
PR-JRA-1: docs 記録（本書）
PR-JRA-2: save-keiba-book 側で computer 同一 raceNumber + horseNumber による馬名補完を実装
PR-JRA-3: race-data-importer 側の外字馬名結合修正（生 XML 確認後）
PR-JRA-4: 2026-06-06 TOK racebook 再生成・validate・shared 反映（PUT はマコさん直接実行）
PR-JRA-5: AK/KI 取り込み確認
PR-JRA-6: 必要なら AK/KI 両方に馬番フォールバック防御を追加（両 repo 同時）
```

---

## 9. 回帰確認項目

```text
- 2026-06-06 TOK R11 #12 が "(外)スナッピードレッサ" として復元される
- 2026-06-06 TOK の外字欠落 6頭が復元される
- AK で 12番に computerIndex=82 が注入される
- AK で 12番が不要馬から外れる
- KI で 12番の recentRaces / sire / predictedOdds / recentFormSource が復活する
- 通常馬名が壊れない
- 阪神 / HAN など他会場に副作用がない
- featureScores / AI指数 / 印 / 買い目は変更しない
```

---

## 10. 禁止事項

```text
- AK だけで直す
- KI だけで直す
- shared JSON 手編集
- computerIndex や印を手で変更
- featureScores / AI指数 / 印 / 買い目 変更
- PR #56 merge をこの件と混ぜる
- dispatch / workflow 実行
```

---

## 11. 更新履歴

```text
2026-06-05: JRA racebook 外字馬名欠落バグを記録。2026-06-06 TOK の (外)/(地) マーカー付き馬で、
            racebook 馬名が U+E615/U+E618 の外字1文字のみになり馬名本体が欠落する問題を確認。
            AK では computerIndex 注入失敗による不要馬化、KI では racebook 補完欠落として発現。
            admin/shared 側での補完・外字処理修正を優先し、AK/KI 片側修正は禁止。
```

---

## 12. PR-JRA-2 実装メモ（save-keiba-book 馬名補完）

```text
対象: netlify/functions/save-keiba-book.mjs（1ファイル）

追加ヘルパ: isGaijiOrEmptyName(name)
- name が空 / null / undefined / trim後に空 → true
- trim後が PUA(U+E000–U+F8FF) と空白だけで構成 → true（codePointAt で数値判定。ソースに生PUA文字は埋めない）
- 通常カタカナ名 / "(外)…" / "(地)…" → false

補完ロジック: enrichWithComputerIndex() 内の既存 compiRace/compiHorse 突合を流用
- compiRace = compiJson.races.find(r => r.raceNumber === race.raceNumber)
- compiHorse = compiRace.horses.find(ch => ch.number === horse.number)
- 条件: compiHorse?.name && isGaijiOrEmptyName(horse.name)
- 処理: horse.name = compiHorse.name（computer の "(外)/(地)+名" を採用）
- 既存の computerIndex 補完は同 if(compiRace) ブロック内で従来どおり維持
- ログ: 補完時のみ「[Enrich] 馬名補完: R{n} #{num} "旧" -> "新"」+ 件数サマリ「[Enrich] 馬名補完: N頭」

保存タイミング: enrichWithComputerIndex は saveToGitHub の前に実行されるため、
補完後の馬名が保存される。computer 在席時に racebook を(再)保存したときに効く安全網。
新規取込で computer 不在時の根治は PR-JRA-3（importer 側）が担当。

検証(2026-06-06 TOK, read-only シミュレーション):
- 馬名補完 6頭ちょうど（R6#11/R7#12/R11#12=(外), R9#6/R10#7/R12#7=(地)）
- 通常馬 165頭は補完対象外（誤補完 0）
- computerIndex 補完ロジックへの影響なし
- node --check OK / helper 単体判定 期待どおり

別件メモ: AK で JRA 発走時刻が表示されていない件は本バグとは別件。後続で read-only 監査し、
別 PR で対応する（本 PR には混ぜない）。
```

---

## 13. 更新履歴（追記）

```text
2026-06-05: PR-JRA-2 として save-keiba-book.mjs に馬名補完（isGaijiOrEmptyName + computer 馬番突合）を実装。
            既存 computerIndex 補完を維持しつつ、外字/空の馬名のみ computer 正規名で補完。
            2026-06-06 TOK 6頭の復元をシミュレーションで確認、通常馬 165頭は無影響。
            AK の JRA 発走時刻未表示は別件として後続監査に分離。
```
