/**
 * 南関競馬の実際のフォーマットでテスト
 * 2026-01-23 船橋 1R の実データ
 */

// extractTimeData()関数（修正版）
function extractTimeData(text) {
  const timeData = {};

  // タイムセクションを抽出（表形式対応）
  const timeSection = text.match(/タイム[\s\S]*?(?=\n\n|通過順|払戻金|$)/);
  if (timeSection) {
    const timeSectionText = timeSection[0];
    const lines = timeSectionText.split('\n').map(l => l.trim()).filter(l => l);

    // 上がり3F/4F/ハロンタイムのヘッダー行を探す
    const headerIdx = lines.findIndex(l => l.includes('上がり3F') && l.includes('ハロンタイム'));

    if (headerIdx > -1 && lines[headerIdx + 1]) {
      // データ行（ヘッダーの次の行）
      const dataLine = lines[headerIdx + 1];
      const values = dataLine.split(/[\s\u3000]+/).filter(v => v);

      // ヘッダー列の順番を確認
      const headers = lines[headerIdx].split(/[\s\u3000]+/).filter(v => v);
      const last3FIdx = headers.indexOf('上がり3F');
      const last4FIdx = headers.indexOf('上がり4F');
      const furlongIdx = headers.indexOf('ハロンタイム');

      // 上がり3F
      if (last3FIdx > -1 && values[last3FIdx]) {
        timeData.last3F = parseFloat(values[last3FIdx]);
      }

      // 上がり4F
      if (last4FIdx > -1 && values[last4FIdx]) {
        timeData.last4F = parseFloat(values[last4FIdx]);
      }

      // ハロンタイム
      if (furlongIdx > -1 && values[furlongIdx]) {
        const furlongStr = values[furlongIdx];
        const furlongs = furlongStr.split(/[,-]/).map(f => parseFloat(f.trim())).filter(f => !isNaN(f));
        if (furlongs.length > 0) {
          timeData.furlongTimes = furlongs;
        }
      }
    }
  }

  return Object.keys(timeData).length > 0 ? timeData : null;
}

// extractCornerData()関数
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

// 実データ（2026-01-23 船橋 1R）
const realData = `
タイム
上がり3F    上がり4F    ハロンタイム
40.1    52.9    13.1-12.6-12.8-12.9-13.7-13.5
「()」は1馬身未満の差で併走している馬群を示し、()内は馬番順で記します。

通過順
コーナー通過順
２角    2,3,4,6,1,7,5
３角    2,3,1,4,6,5,7
４角    2,3,1,4,6,5,7
`;

console.log('========================================');
console.log('南関競馬 実データテスト');
console.log('2026-01-23 船橋 第1R');
console.log('========================================\n');

// タイムデータ抽出
console.log('【タイムデータ抽出】');
const timeResult = extractTimeData(realData);
console.log(JSON.stringify(timeResult, null, 2));

console.log('\n【検証】');
console.log(`✅ 上がり3F: ${timeResult?.last3F}秒 (期待値: 40.1)`);
console.log(`✅ 上がり4F: ${timeResult?.last4F}秒 (期待値: 52.9)`);
console.log(`✅ ハロンタイム: ${timeResult?.furlongTimes?.length}ハロン (期待値: 6ハロン)`);
console.log(`   データ: [${timeResult?.furlongTimes?.join(', ')}]`);
console.log(`   期待値: [13.1, 12.6, 12.8, 12.9, 13.7, 13.5]`);

// コーナー通過順抽出
console.log('\n【コーナー通過順抽出】');
const cornerResult = extractCornerData(realData);
console.log(JSON.stringify(cornerResult, null, 2));

console.log('\n【検証】');
console.log(`✅ コーナー数: ${cornerResult?.length}個 (期待値: 3個 - ２角/３角/４角)`);
if (cornerResult) {
  cornerResult.forEach((c, i) => {
    const expected = [
      { corner: '２角', order: [2, 3, 4, 6, 1, 7, 5] },
      { corner: '３角', order: [2, 3, 1, 4, 6, 5, 7] },
      { corner: '４角', order: [2, 3, 1, 4, 6, 5, 7] }
    ];
    const match = JSON.stringify(c) === JSON.stringify(expected[i]);
    console.log(`   ${match ? '✅' : '❌'} ${c.corner}: [${c.order.join(', ')}]`);
  });
}

// 総合判定
console.log('\n========================================');
let allPassed = true;

if (timeResult?.last3F === 40.1) {
  console.log('✅ 上がり3F抽出成功');
} else {
  console.log('❌ 上がり3F抽出失敗');
  allPassed = false;
}

if (timeResult?.last4F === 52.9) {
  console.log('✅ 上がり4F抽出成功');
} else {
  console.log('❌ 上がり4F抽出失敗');
  allPassed = false;
}

if (timeResult?.furlongTimes?.length === 6) {
  const expected = [13.1, 12.6, 12.8, 12.9, 13.7, 13.5];
  const match = JSON.stringify(timeResult.furlongTimes) === JSON.stringify(expected);
  if (match) {
    console.log('✅ ハロンタイム抽出成功（6ハロン、値も一致）');
  } else {
    console.log('❌ ハロンタイム値が不一致');
    allPassed = false;
  }
} else {
  console.log('❌ ハロンタイム抽出失敗');
  allPassed = false;
}

if (cornerResult?.length === 3) {
  console.log('✅ コーナー通過順抽出成功（3コーナー）');
} else {
  console.log('❌ コーナー通過順抽出失敗');
  allPassed = false;
}

console.log('\n========================================');
if (allPassed) {
  console.log('🎉 南関競馬フォーマット対応完了 ✅');
} else {
  console.log('❌ 一部抽出失敗');
}
console.log('========================================');
