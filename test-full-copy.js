/**
 * 実際のブラウザコピペテスト
 * レース結果テーブルも含む全文コピペ
 */

function extractTimeData(text) {
  const timeData = {};

  console.log('[DEBUG] 入力テキスト長:', text.length);
  console.log('[DEBUG] 入力テキスト（最初の500文字）:', text.substring(0, 500));

  // まず「タイム」セクションを抽出
  const timeSection = text.match(/タイム[\s\S]*?(?=通過順|払戻金|コーナー通過順|$)/);
  if (!timeSection) {
    console.log('[DEBUG] タイムセクション: 見つかりません');
    return null;
  }

  const timeSectionText = timeSection[0];
  console.log('[DEBUG] タイムセクション抽出成功');
  console.log('[DEBUG] タイムセクション長:', timeSectionText.length);
  console.log('[DEBUG] タイムセクション内容:', timeSectionText.substring(0, 300));

  // 表形式の場合：ヘッダー行とデータ行を分離
  const lines = timeSectionText.split('\n').map(l => l.trim()).filter(l => l);
  console.log('[DEBUG] タイムセクション行数:', lines.length);
  console.log('[DEBUG] 最初の5行:', lines.slice(0, 5));

  // ヘッダー行（上がり3F, 上がり4F, ハロンタイムを含む行）を探す
  const headerIdx = lines.findIndex(l => l.includes('上がり3F') && l.includes('ハロンタイム'));
  console.log('[DEBUG] ヘッダー行インデックス:', headerIdx);

  if (headerIdx > -1 && lines[headerIdx + 1]) {
    // データ行（ヘッダーの次の行）
    const dataLine = lines[headerIdx + 1];
    console.log('[DEBUG] データ行:', dataLine);

    // タブまたはスペースで分割
    const values = dataLine.split(/[\s\t]+/).filter(v => v);
    console.log('[DEBUG] データ値:', values);

    // ヘッダーの列順を確認
    const headers = lines[headerIdx].split(/[\s\t]+/).filter(v => v);
    console.log('[DEBUG] ヘッダー:', headers);

    const last3FIdx = headers.indexOf('上がり3F');
    const last4FIdx = headers.indexOf('上がり4F');
    const furlongIdx = headers.indexOf('ハロンタイム');

    // 上がり3F
    if (last3FIdx > -1 && values[last3FIdx]) {
      timeData.last3F = parseFloat(values[last3FIdx]);
      console.log('[DEBUG] 上がり3F抽出成功:', timeData.last3F);
    }

    // 上がり4F
    if (last4FIdx > -1 && values[last4FIdx]) {
      timeData.last4F = parseFloat(values[last4FIdx]);
      console.log('[DEBUG] 上がり4F抽出成功:', timeData.last4F);
    }

    // ハロンタイム
    if (furlongIdx > -1 && values[furlongIdx]) {
      const furlongStr = values[furlongIdx];
      console.log('[DEBUG] ハロンタイム文字列:', furlongStr);
      const furlongs = furlongStr.split('-').map(f => parseFloat(f.trim())).filter(f => !isNaN(f));
      console.log('[DEBUG] ハロンタイム配列:', furlongs);
      if (furlongs.length > 0) {
        timeData.furlongTimes = furlongs;
      }
    }
  } else {
    console.log('[DEBUG] ヘッダー行が見つからない、表形式ではない');
  }

  return Object.keys(timeData).length > 0 ? timeData : null;
}

// レース結果テーブルを含む実際のコピペ（簡略版）
const testData = `着 枠 馬番 馬名 タイム 着差 上がり3F 人気
1 7 12 キリンジ 2:49.8 - 38.1 1
2 5 8 ミヤギザオウ 2:51.0 ６ 39.5 8

タイム
上がり3F    上がり4F    ハロンタイム
38.8    51.4    12.8-12.2-14.1-13.4-13.6-13.6-13.5-12.8-12.4-12.6-13.5-12.2-13.1

通過順`;

console.log('========================================');
console.log('実際のブラウザコピペテスト');
console.log('========================================\n');

const result = extractTimeData(testData);

console.log('\n【結果】');
console.log(JSON.stringify(result, null, 2));

console.log('\n【期待値】');
console.log('上がり3F: 38.8');
console.log('上がり4F: 51.4');
console.log('ハロンタイム: 13個');

if (result?.last3F === 38.8 && result?.last4F === 51.4 && result?.furlongTimes?.length === 13) {
  console.log('\n✅ すべて正常');
} else {
  console.log('\n❌ 抽出失敗');
}
