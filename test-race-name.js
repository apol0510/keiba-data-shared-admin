/**
 * レース名抽出テスト
 */

function extractRaceInfo(text, raceNumber) {
  let raceName = '';
  const lines = text.split('\n');

  // 優先順位1: 重賞レース名（「第○回」「（ＳI」「（ＳII」「（ＧI」「（ＧII」「（ＧIII」「（ＪｐｎI」を含む）
  for (let line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.match(/第\d+回|[（(][ＳＧＪ][ＩIｐｎ]/)) {
      raceName = trimmedLine;
      break;
    }
  }

  // 優先順位2: 地方競馬グレード（Ａ１、Ｂ２など）
  if (!raceName) {
    for (let line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.match(/[ＡＢＣ][１２３０]/)) {
        raceName = trimmedLine;
        break;
      }
    }
  }

  // 優先順位3: 「特別」「賞」「杯」を含む行（副題の可能性あり）
  if (!raceName) {
    for (let line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.match(/特別|賞|杯/)) {
        raceName = trimmedLine;
        break;
      }
    }
  }

  return { raceNumber, raceName };
}

// テストケース1: 重賞レース（金盃）
const testData1 = `
東京中日スポーツ賞
第６９回 金盃（ＳII）
ダート2,600m（外）
（15頭）
`;

// テストケース2: 地方競馬グレード
const testData2 = `
Ｃ３(一) 特選
ダート外1500m
（13頭）
`;

// テストケース3: 一般特別レース
const testData3 = `
師走特別
ダート1200m
（10頭）
`;

console.log('========================================');
console.log('レース名抽出テスト');
console.log('========================================\n');

console.log('【テスト1: 重賞レース（金盃）】');
const result1 = extractRaceInfo(testData1, 11);
console.log('抽出されたレース名:', result1.raceName);
console.log('期待値: 第６９回 金盃（ＳII）');
console.log(result1.raceName === '第６９回 金盃（ＳII）' ? '✅ 正常' : '❌ 失敗');

console.log('\n【テスト2: 地方競馬グレード】');
const result2 = extractRaceInfo(testData2, 3);
console.log('抽出されたレース名:', result2.raceName);
console.log('期待値: Ｃ３(一) 特選');
console.log(result2.raceName === 'Ｃ３(一) 特選' ? '✅ 正常' : '❌ 失敗');

console.log('\n【テスト3: 一般特別レース】');
const result3 = extractRaceInfo(testData3, 5);
console.log('抽出されたレース名:', result3.raceName);
console.log('期待値: 師走特別');
console.log(result3.raceName === '師走特別' ? '✅ 正常' : '❌ 失敗');

console.log('\n========================================');
if (
  result1.raceName === '第６９回 金盃（ＳII）' &&
  result2.raceName === 'Ｃ３(一) 特選' &&
  result3.raceName === '師走特別'
) {
  console.log('🎉 すべてのテスト成功 ✅');
} else {
  console.log('❌ 一部テスト失敗');
}
console.log('========================================');
