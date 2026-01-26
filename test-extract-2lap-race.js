/**
 * 2周レース・多頭数テスト
 * 2025-01-29 大井 11R 金盃（15頭立て、2,600m）
 */

// extractTimeData()関数
function extractTimeData(text) {
  const timeData = {};

  const timeSection = text.match(/タイム[\s\S]*?(?=\n\n|通過順|払戻金|$)/);
  if (timeSection) {
    const timeSectionText = timeSection[0];
    const lines = timeSectionText.split('\n').map(l => l.trim()).filter(l => l);

    const headerIdx = lines.findIndex(l => l.includes('上がり3F') && l.includes('ハロンタイム'));

    if (headerIdx > -1 && lines[headerIdx + 1]) {
      const dataLine = lines[headerIdx + 1];
      const values = dataLine.split(/[\s\u3000]+/).filter(v => v);

      const headers = lines[headerIdx].split(/[\s\u3000]+/).filter(v => v);
      const last3FIdx = headers.indexOf('上がり3F');
      const last4FIdx = headers.indexOf('上がり4F');
      const furlongIdx = headers.indexOf('ハロンタイム');

      if (last3FIdx > -1 && values[last3FIdx]) {
        timeData.last3F = parseFloat(values[last3FIdx]);
      }

      if (last4FIdx > -1 && values[last4FIdx]) {
        timeData.last4F = parseFloat(values[last4FIdx]);
      }

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

// extractCornerData()関数（修正版）
function extractCornerData(text) {
  const corners = [];

  const cornerSection = text.match(/コーナー通過順[\s\S]*?(?=\n\n|払戻金|$)/);
  if (!cornerSection) return null;

  const lines = cornerSection[0].split('\n');

  for (let line of lines) {
    // 「１周３角」「２周４角」「１角」「２角」「３角」「４角」などに対応
    const cornerMatch = line.match(/([１２]周)?([１２３４])角[\s\u3000]+([\d,()]+)/);
    if (cornerMatch) {
      const lapPrefix = cornerMatch[1] || ''; // '１周' or '２周' or ''
      const cornerNumber = cornerMatch[2];
      const orderStr = cornerMatch[3];

      // 括弧を除去して馬番を抽出（例: "(4,14)" → "4,14"）
      const cleanedStr = orderStr.replace(/[()]/g, '');
      const order = cleanedStr.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));

      const cornerName = lapPrefix ? `${lapPrefix}${cornerNumber}角` : `${cornerNumber}角`;

      corners.push({
        corner: cornerName,
        order
      });
    }
  }

  return corners.length > 0 ? corners : null;
}

// 実データ（2025-01-29 大井 11R）
const realData = `
タイム
上がり3F    上がり4F    ハロンタイム
38.8    51.4    12.8-12.2-14.1-13.4-13.6-13.6-13.5-12.8-12.4-12.6-13.5-12.2-13.1
「()」は1馬身未満の差で併走している馬群を示し、()内は馬番順で記します。

通過順
コーナー通過順
１周３角    3,7,5,6,8,9,12,2,(4,14),13,10,1,11,15
１周４角    3,7,5,6,8,9,12,2,(4,14),13,10,1,11,15
１角    3,7,5,6,8,9,12,14,2,15,4,13,10,11,1
２角    3,7,5,6,8,9,12,(2,14),15,13,4,10,(1,11)
２周３角    3,7,5,8,9,12,6,2,14,10,13,4,15,11,1
２周４角    3,7,12,8,5,9,2,(6,14),13,10,4,15,11,1
`;

console.log('========================================');
console.log('2周レース・多頭数テスト');
console.log('2025-01-29 大井 第11R 金盃（15頭）');
console.log('========================================\n');

// タイムデータ抽出
console.log('【タイムデータ抽出】');
const timeResult = extractTimeData(realData);
console.log(JSON.stringify(timeResult, null, 2));

console.log('\n【検証】');
console.log(`✅ 上がり3F: ${timeResult?.last3F}秒 (期待値: 38.8)`);
console.log(`✅ 上がり4F: ${timeResult?.last4F}秒 (期待値: 51.4)`);
console.log(`✅ ハロンタイム: ${timeResult?.furlongTimes?.length}ハロン (期待値: 13ハロン)`);
if (timeResult?.furlongTimes) {
  console.log(`   [${timeResult.furlongTimes.slice(0, 5).join(', ')}...]`);
}

// コーナー通過順抽出
console.log('\n【コーナー通過順抽出】');
const cornerResult = extractCornerData(realData);
console.log(JSON.stringify(cornerResult, null, 2));

console.log('\n【検証】');
console.log(`✅ コーナー数: ${cornerResult?.length}個 (期待値: 6個)`);
if (cornerResult) {
  const expected = [
    { corner: '１周３角', count: 15 },
    { corner: '１周４角', count: 15 },
    { corner: '１角', count: 15 },
    { corner: '２角', count: 15 },
    { corner: '２周３角', count: 15 },
    { corner: '２周４角', count: 15 }
  ];

  cornerResult.forEach((c, i) => {
    const match = c.corner === expected[i].corner && c.order.length === expected[i].count;
    console.log(`   ${match ? '✅' : '❌'} ${c.corner}: ${c.order.length}頭 (期待値: ${expected[i].count}頭)`);
    if (i === 0) {
      console.log(`      データ: [${c.order.slice(0, 8).join(', ')}...]`);
      console.log(`      期待値: [3, 7, 5, 6, 8, 9, 12, 2, 4, 14, 13, 10, 1, 11, 15]`);
    }
  });
}

// 括弧表記テスト
console.log('\n【括弧表記テスト】');
const corner1周3角 = cornerResult?.find(c => c.corner === '１周３角');
if (corner1周3角) {
  const has4and14 = corner1周3角.order.includes(4) && corner1周3角.order.includes(14);
  console.log(`✅ １周３角に4番と14番が含まれる: ${has4and14 ? 'はい' : 'いいえ'}`);
  console.log(`   括弧表記 (4,14) から正しく抽出されているか確認`);
}

// 総合判定
console.log('\n========================================');
let allPassed = true;

if (timeResult?.last3F === 38.8) {
  console.log('✅ 上がり3F抽出成功');
} else {
  console.log('❌ 上がり3F抽出失敗');
  allPassed = false;
}

if (timeResult?.furlongTimes?.length === 13) {
  console.log('✅ ハロンタイム抽出成功（13ハロン）');
} else {
  console.log('❌ ハロンタイム抽出失敗');
  allPassed = false;
}

if (cornerResult?.length === 6) {
  console.log('✅ コーナー通過順抽出成功（6コーナー）');
} else {
  console.log('❌ コーナー通過順抽出失敗');
  allPassed = false;
}

const allCorners15 = cornerResult?.every(c => c.order.length === 15);
if (allCorners15) {
  console.log('✅ 全コーナーで15頭分の通過順を抽出');
} else {
  console.log('❌ 一部コーナーで頭数不足');
  allPassed = false;
}

console.log('\n========================================');
if (allPassed) {
  console.log('🎉 2周レース・多頭数対応完了 ✅');
} else {
  console.log('❌ 一部抽出失敗');
}
console.log('========================================');
