/**
 * extractCornerData() テストケース
 * Phase3: コーナー通過順抽出のテスト
 *
 * 実行方法:
 * node test-extract-corner-data.js
 */

// extractCornerData()関数（results-manager.astroから抽出）
function extractCornerData(text) {
  const corners = [];

  const cornerSection = text.match(/コーナー通過順[\s\S]*?(?=\n\n|払戻金|$)/);
  if (!cornerSection) return null;

  const lines = cornerSection[0].split('\n');

  for (let line of lines) {
    const cornerMatch = line.match(/(２周目)?([１２３４])角[\s\u3000]+([\d,]+)/);
    if (cornerMatch) {
      const isSecondLap = !!cornerMatch[1];
      const cornerNumber = cornerMatch[2];
      const orderStr = cornerMatch[3];

      const order = orderStr.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));

      corners.push({
        corner: isSecondLap ? `2周目${cornerNumber}角` : `${cornerNumber}角`,
        order
      });
    }
  }

  return corners.length > 0 ? corners : null;
}

// テストケース1: 標準的な4コーナー（1500m想定）
const testData1 = `
第3競走　Ｃ３(一) 特選
ダート外1500m　13頭立　発走時刻15:45

着順  枠  馬番  馬名        騎手      調教師    走破時計  着差    上3F  人気
1着   8   13   ウェカピポ    笹川翼    山田信大    1:38.1    -     39.1   2

上がり3F 39.6

コーナー通過順
１角 3,4,11,10,13,2,12,9,7,1,5,6,8
２角 3,4,11,10,13,2,12,9,7,1,5,6,8
３角 3,4,13,11,10,2,12,9,7,5,1,8,6
４角 3,13,4,11,10,2,12,9,7,5,1,8,6

払戻金
`;

// テストケース2: 長距離レース（2周）
const testData2 = `
第5競走　ガーネット２２００
ダート外2200m　14頭立　発走時刻20:50

着順  枠  馬番  馬名        騎手      調教師    走破時計  着差    上3F  人気
1着   5   7    マキシマムパワー  町田直希   林正人    2:28.0    -     39.3   1

上がり3F 40.5

コーナー通過順
１角 7,9,11,3,5,13,1,2,4,6,8,10,12,14
２角 7,9,11,3,5,13,1,2,4,6,8,10,12,14
３角 7,9,11,3,5,13,1,2,4,6,8,10,12,14
４角 7,9,11,3,5,13,1,2,4,6,8,10,12,14
２周目１角 7,9,11,3,5,13,1,2,4,6,8,10,12,14
２周目２角 7,9,11,3,5,13,1,2,4,6,8,10,12,14
２周目３角 7,9,11,3,5,13,1,2,4,6,8,10,12,14
２周目４角 7,9,11,3,5,13,1,2,4,6,8,10,12,14

払戻金
`;

// テストケース3: コーナー通過順なし（短距離）
const testData3 = `
第1競走　３歳 未出走未受賞
ダート外1200m　7頭立　発走時刻14:45

着順  枠  馬番  馬名        騎手      調教師    走破時計  着差    上3F  人気
1着   3   3    エスポワール  本田正重   新井清重    1:18.6    -     39.9   1

上がり3F 39.9

払戻金
`;

console.log('========================================');
console.log('extractCornerData() テストケース - Phase3');
console.log('========================================\n');

// テスト1: 標準的な4コーナー
console.log('【テスト1: 標準的な4コーナー（1500m）】');
console.log('入力: １角〜４角の通過順');
const result1 = extractCornerData(testData1);
console.log('抽出結果:');
console.log(JSON.stringify(result1, null, 2));
console.log(`✅ コーナー数: ${result1?.length}個`);
if (result1) {
  result1.forEach(c => {
    console.log(`   ${c.corner}: ${c.order.length}頭 = [${c.order.slice(0, 5).join(', ')}...]`);
  });
}
console.log('');

// テスト2: 長距離レース（2周）
console.log('【テスト2: 長距離レース（2周、2200m）】');
console.log('入力: １角〜４角 + ２周目１角〜４角');
const result2 = extractCornerData(testData2);
console.log('抽出結果:');
console.log(JSON.stringify(result2, null, 2));
console.log(`✅ コーナー数: ${result2?.length}個（2周分）`);
if (result2) {
  result2.forEach((c, i) => {
    if (i < 4 || i >= result2.length - 2) {
      console.log(`   ${c.corner}: ${c.order.length}頭 = [${c.order.slice(0, 5).join(', ')}...]`);
    }
  });
}
console.log('');

// テスト3: コーナー通過順なし
console.log('【テスト3: コーナー通過順なし（短距離1200m）】');
console.log('入力: コーナー通過順データなし');
const result3 = extractCornerData(testData3);
console.log('抽出結果:');
console.log(result3 === null ? 'null（正常）' : JSON.stringify(result3, null, 2));
console.log(`✅ コーナーデータ: ${result3 ? 'あり（不正）' : 'なし（正常）'}`);
console.log('');

// 検証
console.log('========================================');
console.log('【検証結果】');
console.log('========================================');
let allPassed = true;

if (result1?.length === 4) {
  console.log('✅ テスト1: 4コーナー分を正しく抽出');
} else {
  console.log('❌ テスト1: コーナー数が不正');
  allPassed = false;
}

if (result1?.[0]?.corner === '１角' && result1?.[0]?.order?.length === 13) {
  console.log('✅ テスト1: １角の通過順（13頭）を正しく抽出');
} else {
  console.log('❌ テスト1: １角データが不正');
  allPassed = false;
}

if (result2?.length === 8) {
  console.log('✅ テスト2: 2周分（8コーナー）を正しく抽出');
} else {
  console.log('❌ テスト2: 2周分のコーナー数が不正');
  allPassed = false;
}

const has2shuMeCorner = result2?.some(c => c.corner.includes('２周目') || c.corner.includes('2周目'));
if (has2shuMeCorner) {
  console.log('✅ テスト2: "２周目"または"2周目"ラベルを正しく識別');
} else {
  console.log('❌ テスト2: ２周目ラベルが不正');
  allPassed = false;
}

if (result3 === null) {
  console.log('✅ テスト3: コーナー通過順なしを正しく処理');
} else {
  console.log('❌ テスト3: nullであるべき');
  allPassed = false;
}

if (result1?.[3]?.order?.[0] === 3 && result1?.[3]?.order?.[1] === 13) {
  console.log('✅ 数値変換: 正しくint型に変換されている');
} else {
  console.log('❌ 数値変換: 型が不正');
  allPassed = false;
}

console.log('\n========================================');
if (allPassed) {
  console.log('Phase3 完了：コーナー通過順抽出機能 ✅');
  console.log('- １角〜４角対応 ✅');
  console.log('- ２周目対応（長距離レース） ✅');
  console.log('- 数値変換（int配列） ✅');
  console.log('- cornerData配列保存 ✅');
} else {
  console.log('❌ 一部テスト失敗');
}
console.log('========================================');
