/**
 * extractTimeData() テストケース
 * Phase2: ハロンタイム抽出のテスト
 *
 * 実行方法:
 * node test-extract-time-data.js
 */

// extractTimeData()関数（results-manager.astroから抽出）
function extractTimeData(text) {
  const timeData = {};

  const last3FMatch = text.match(/上がり3F[\s\u3000]+([\d.]+)/);
  if (last3FMatch) {
    timeData.last3F = parseFloat(last3FMatch[1]);
  }

  const last4FMatch = text.match(/上がり4F[\s\u3000]+([\d.]+)/);
  if (last4FMatch) {
    timeData.last4F = parseFloat(last4FMatch[1]);
  }

  const furlongMatch = text.match(/ハロンタイム[\s\u3000]+([\d.,-]+)/);
  if (furlongMatch) {
    const furlongStr = furlongMatch[1];
    const furlongs = furlongStr.split(/[,-]/).map(f => parseFloat(f.trim())).filter(f => !isNaN(f));
    if (furlongs.length > 0) {
      timeData.furlongTimes = furlongs;
    }
  }

  return Object.keys(timeData).length > 0 ? timeData : null;
}

// テストケース1: ハイフン区切り
const testData1 = `
第5競走　ガーネット２２００
ダート外2200m　14頭立　発走時刻20:50

着順  枠  馬番  馬名        騎手      調教師    走破時計  着差    上3F  人気
1着   5   7    マキシマムパワー  町田直希   林正人    2:28.0    -     39.3   1

上がり3F 40.5
ハロンタイム 7.2-12.2-12.7-13.2-13.2-13.2-13.1-13.3

コーナー通過順
1角 3,4,11,10,13,2,12,9,7,1,5,6,8
`;

// テストケース2: カンマ区切り
const testData2 = `
第1競走　３歳 未出走未受賞
ダート外1200m　7頭立　発走時刻14:45

着順  枠  馬番  馬名        騎手      調教師    走破時計  着差    上3F  人気
1着   3   3    エスポワール  本田正重   新井清重    1:18.6    -     39.9   1

上がり3F 39.9
ハロンタイム 12.5,12.8,13.1,13.2,13.0,14.0
`;

// テストケース3: 上がり4F + ハロンタイムなし
const testData3 = `
第3競走
ダート外1500m　13頭立　発走時刻15:45

着順  枠  馬番  馬名        騎手      調教師    走破時計  着差    上3F  人気
1着   8   13   ウェカピポ    笹川翼    山田信大    1:38.1    -     39.1   2

上がり3F 39.1
上がり4F 51.0
`;

console.log('========================================');
console.log('extractTimeData() テストケース - Phase2');
console.log('========================================\n');

// テスト1: ハイフン区切り（8ハロン＝2200m想定）
console.log('【テスト1: ハイフン区切り（2200m）】');
console.log('入力: ハロンタイム 7.2-12.2-12.7-13.2-13.2-13.2-13.1-13.3');
const result1 = extractTimeData(testData1);
console.log('抽出結果:');
console.log(JSON.stringify(result1, null, 2));
console.log(`✅ 上がり3F: ${result1?.last3F}秒`);
console.log(`✅ ハロンタイム: ${result1?.furlongTimes?.length}ハロン分 = [${result1?.furlongTimes?.join(', ')}]`);
console.log('');

// テスト2: カンマ区切り（6ハロン＝1200m想定）
console.log('【テスト2: カンマ区切り（1200m）】');
console.log('入力: ハロンタイム 12.5,12.8,13.1,13.2,13.0,14.0');
const result2 = extractTimeData(testData2);
console.log('抽出結果:');
console.log(JSON.stringify(result2, null, 2));
console.log(`✅ 上がり3F: ${result2?.last3F}秒`);
console.log(`✅ ハロンタイム: ${result2?.furlongTimes?.length}ハロン分 = [${result2?.furlongTimes?.join(', ')}]`);
console.log('');

// テスト3: ハロンタイムなし
console.log('【テスト3: ハロンタイムなし】');
console.log('入力: 上がり3F/4Fのみ（ハロンタイムなし）');
const result3 = extractTimeData(testData3);
console.log('抽出結果:');
console.log(JSON.stringify(result3, null, 2));
console.log(`✅ 上がり3F: ${result3?.last3F}秒`);
console.log(`✅ 上がり4F: ${result3?.last4F}秒`);
console.log(`✅ ハロンタイム: ${result3?.furlongTimes ? result3.furlongTimes.length + 'ハロン' : 'なし（正常）'}`);
console.log('');

// 検証
console.log('========================================');
console.log('【検証結果】');
console.log('========================================');
let allPassed = true;

if (result1?.furlongTimes?.length === 8) {
  console.log('✅ テスト1: 8ハロン分を正しく抽出');
} else {
  console.log('❌ テスト1: ハロン数が不正');
  allPassed = false;
}

if (result2?.furlongTimes?.length === 6) {
  console.log('✅ テスト2: 6ハロン分を正しく抽出（カンマ区切り対応）');
} else {
  console.log('❌ テスト2: ハロン数が不正');
  allPassed = false;
}

if (!result3?.furlongTimes) {
  console.log('✅ テスト3: ハロンタイムなしのケースを正しく処理');
} else {
  console.log('❌ テスト3: ハロンタイムが不正に抽出されている');
  allPassed = false;
}

if (result1?.furlongTimes?.[0] === 7.2 && result1?.furlongTimes?.[7] === 13.3) {
  console.log('✅ 数値変換: 正しくfloat型に変換されている');
} else {
  console.log('❌ 数値変換: 型が不正');
  allPassed = false;
}

console.log('\n========================================');
if (allPassed) {
  console.log('Phase2 完了：ハロンタイム抽出機能 ✅');
  console.log('- ハイフン区切り対応 ✅');
  console.log('- カンマ区切り対応 ✅');
  console.log('- 数値変換（float） ✅');
  console.log('- furlongTimes配列保存 ✅');
} else {
  console.log('❌ 一部テスト失敗');
}
console.log('========================================');
