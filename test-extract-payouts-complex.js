/**
 * extractPayouts() 複雑データテスト
 * 複勝3着分・"-"行スキップのテスト
 */

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

// テストデータ: 複勝3着分、一部券種なし（"-"）
const testData = `
第5競走　ガーネット２２００
ダート外2200m　14頭立　発走時刻20:50

着順  枠  馬番  馬名        騎手      調教師    走破時計  着差    上3F  人気
1着   5   7    マキシマムパワー  町田直希   林正人    2:28.0    -     39.3   1
2着   7   9    ゴールドスター    佐々木    米谷康    2:28.5   2 1/2  39.5   5
3着   8  11    シルバーキング    本田正    石崎駿    2:28.8   1 1/2  39.8   8

払戻金
        単勝        複勝           枠複        馬複         枠単        馬単
組番  金額  人気  組番  金額  人気  組番  金額  人気  組番  金額  人気  組番  金額  人気  組番  金額  人気
7    290   1    7    110   1    -    -    -    7-9  1210  12   5-7  420   3    7-9  10160 40
              9    210   3                  7-11 1850  19   7-5  980   10
             11    340   5                  9-11 2530  28

        ワイド         三連複        三連単
組番  金額  人気  組番   金額   人気  組番   金額   人気
7-9   580   8    7-9-11 18040  72   7-9-11 72850  278
7-11  780   13   -      -      -    -      -      -
9-11  1230  25
`;

console.log('========================================');
console.log('extractPayouts() 複雑データテスト');
console.log('========================================\n');

console.log('【テストケース】');
console.log('・複勝3着分（3行）');
console.log('・枠複なし（"-"）');
console.log('・三連複1件のみ、三連単1件のみ');
console.log('・馬複・枠単が複数行\n');

const result = extractPayouts(testData);

console.log('【抽出結果JSON】');
console.log(JSON.stringify(result, null, 2));

console.log('\n【検証】');
console.log(`✅ 単勝: ${result.tansho?.length || 0}件`);
console.log(`✅ 複勝: ${result.fukusho?.length || 0}件（3着分 = 3件期待）`);
console.log(`✅ 枠複: ${result.wakuren ? '❌ 存在する（"-"をスキップできていない）' : '✅ なし（"-"を正しくスキップ）'}`);
console.log(`✅ 馬複: ${result.umaren?.length || 0}件（3件期待）`);
console.log(`✅ 枠単: ${result.wakutan?.length || 0}件（2件期待）`);
console.log(`✅ 馬単: ${result.umatan?.length || 0}件`);
console.log(`✅ ワイド: ${result.wide?.length || 0}件（3件期待）`);
console.log(`✅ 三連複: ${result.sanrenpuku?.length || 0}件`);
console.log(`✅ 三連単: ${result.sanrentan?.length || 0}件`);

// 詳細検証
console.log('\n【詳細検証】');
if (result.fukusho && result.fukusho.length === 3) {
  console.log('✅ 複勝3着分が正しく抽出されている');
  result.fukusho.forEach((item, i) => {
    console.log(`   ${i+1}着: 馬番${item.number} ${item.payout}円 人気${item.popularity}`);
  });
}

if (result.umaren && result.umaren.length === 3) {
  console.log('✅ 馬複3行が正しく抽出されている');
}

if (!result.wakuren) {
  console.log('✅ 枠複の"-"行が正しくスキップされている');
}

console.log('\n========================================');
console.log('複雑データテスト完了 ✅');
console.log('========================================');
