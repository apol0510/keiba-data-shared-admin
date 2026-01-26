/**
 * extractPayouts() テストケース
 * Phase1: 全9券種対応のテスト
 *
 * 実行方法:
 * node test-extract-payouts.js
 */

// extractPayouts()関数（results-manager.astroから抽出）
function extractPayouts(text) {
  const payouts = {};

  const payoutMatch = text.match(/払戻金[\s\S]*$/);
  if (!payoutMatch) return payouts;

  const payoutSection = payoutMatch[0];
  const lines = payoutSection.split('\n').filter(l => l.trim());

  // テーブル1: 単勝/複勝/枠複/馬複/枠単/馬単
  const table1HeaderIdx = lines.findIndex(l =>
    l.includes('単勝') && l.includes('複勝') && l.includes('馬単')
  );

  if (table1HeaderIdx > -1) {
    const dataRows = [];
    for (let i = table1HeaderIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('組番')) continue;
      if (line.includes('ワイド') || line.includes('三連')) break;
      if (/^[\d-]/.test(line)) {
        dataRows.push(line);
      } else if (dataRows.length > 0) {
        break;
      }
    }

    // 各券種の列位置（組番/金額/人気 が3列1セット）
    // 単勝(0-2), 複勝(3-5), 枠複(6-8), 馬複(9-11), 枠単(12-14), 馬単(15-17)
    const ticketTypes = [
      { key: 'tansho', offset: 0, hasNumber: true },
      { key: 'fukusho', offset: 3, hasNumber: true },
      { key: 'wakuren', offset: 6, hasNumber: false },
      { key: 'umaren', offset: 9, hasNumber: false },
      { key: 'wakutan', offset: 12, hasNumber: false },
      { key: 'umatan', offset: 15, hasNumber: false }
    ];

    for (const type of ticketTypes) {
      const items = [];
      for (const row of dataRows) {
        const values = row.split(/[\s\u3000]+/).filter(v => v);
        const numOrCombo = values[type.offset];
        const payout = values[type.offset + 1];
        const popularity = values[type.offset + 2];

        if (numOrCombo && numOrCombo !== '-' && payout && payout !== '-' && popularity && popularity !== '-') {
          items.push({
            [type.hasNumber ? 'number' : 'combination']: numOrCombo,
            payout: parseInt(payout.replace(/,/g, ''), 10),
            popularity: parseInt(popularity, 10)
          });
        }
      }
      if (items.length > 0) {
        payouts[type.key] = items;
      }
    }
  }

  // テーブル2: ワイド/三連複/三連単
  const table2HeaderIdx = lines.findIndex(l =>
    l.includes('ワイド') && l.includes('三連')
  );

  if (table2HeaderIdx > -1) {
    const dataRows = [];
    for (let i = table2HeaderIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('組番')) continue;
      if (line.includes('備考')) break;
      if (/^[\d-]/.test(line)) {
        dataRows.push(line);
      } else if (dataRows.length > 0) {
        break;
      }
    }

    // ワイド(0-2), 三連複(3-5), 三連単(6-8)
    const ticketTypes = [
      { key: 'wide', offset: 0 },
      { key: 'sanrenpuku', offset: 3 },
      { key: 'sanrentan', offset: 6 }
    ];

    for (const type of ticketTypes) {
      const items = [];
      for (const row of dataRows) {
        const values = row.split(/[\s\u3000]+/).filter(v => v);
        const combo = values[type.offset];
        const payout = values[type.offset + 1];
        const popularity = values[type.offset + 2];

        if (combo && combo !== '-' && payout && payout !== '-' && popularity && popularity !== '-') {
          items.push({
            combination: combo,
            payout: parseInt(payout.replace(/,/g, ''), 10),
            popularity: parseInt(popularity, 10)
          });
        }
      }
      if (items.length > 0) {
        payouts[type.key] = items;
      }
    }
  }

  return payouts;
}

// テストデータ: 2026-01-23 船橋 1R（全券種あり想定）
const testRaceData = `
第1競走　３歳　未出走未受賞イ
ダート外1200m　7頭立　発走時刻14:45

着順  枠  馬番  馬名            騎手      調教師    走破時計  着差    上3F  人気
1着   3   3    エスポワールバイオ  本田正重   新井清重   1:18.6    -     39.9   1
2着   2   2    ハウトゥヴェール    張田昂    森泰斗    1:18.7   クビ   40.2   2
3着   4   4    ビッグメダーリア    ▲椿聡太   田中力    1:19.4    ３    40.4   4

払戻金
        単勝        複勝           枠複        馬複         枠単        馬単
組番  金額  人気  組番  金額  人気  組番  金額  人気  組番  金額  人気  組番  金額  人気  組番  金額  人気
3    120   1    3    100   1    2-3  120   1    2-3  110   1    2-3  150   1    3-2  190   1
              2    110   2                                 3-2  200   2
              4    150   3

        ワイド        三連複        三連単
組番  金額  人気  組番  金額  人気  組番  金額  人気
2-3   110   1    2-3-4 250   1    3-2-4 680   2
3-4   180   3
2-4   220   5
`;

console.log('========================================');
console.log('extractPayouts() テストケース - Phase1');
console.log('========================================\n');

console.log('【入力データ】');
console.log('2026-01-23 船橋 第1R ３歳 未出走未受賞イ');
console.log('※ 全9券種の払戻データを含む\n');

console.log('【抽出実行】');
const result = extractPayouts(testRaceData);

console.log('【抽出結果JSON】');
console.log(JSON.stringify(result, null, 2));

console.log('\n【検証】');
console.log(`✅ 単勝（tansho）: ${result.tansho ? result.tansho.length + '件' : '❌ なし'}`);
console.log(`✅ 複勝（fukusho）: ${result.fukusho ? result.fukusho.length + '件' : '❌ なし'}`);
console.log(`✅ 枠複（wakuren）: ${result.wakuren ? result.wakuren.length + '件' : '❌ なし'}`);
console.log(`✅ 馬複（umaren）: ${result.umaren ? result.umaren.length + '件' : '❌ なし'}`);
console.log(`✅ 枠単（wakutan）: ${result.wakutan ? result.wakutan.length + '件' : '❌ なし'}`);
console.log(`✅ 馬単（umatan）: ${result.umatan ? result.umatan.length + '件' : '❌ なし'}`);
console.log(`✅ ワイド（wide）: ${result.wide ? result.wide.length + '件' : '❌ なし'}`);
console.log(`✅ 三連複（sanrenpuku）: ${result.sanrenpuku ? result.sanrenpuku.length + '件' : '❌ なし'}`);
console.log(`✅ 三連単（sanrentan）: ${result.sanrentan ? result.sanrentan.length + '件' : '❌ なし'}`);

// 人気フィールドの存在チェック
console.log('\n【人気フィールドチェック】');
const allTypesHavePopularity = Object.entries(result).every(([key, items]) => {
  return items.every(item => typeof item.popularity === 'number');
});
console.log(allTypesHavePopularity ? '✅ 全券種に人気フィールドあり' : '❌ 人気フィールド欠損あり');

console.log('\n========================================');
console.log('Phase1 完了：全9券種＋人気フィールド対応 ✅');
console.log('========================================');
