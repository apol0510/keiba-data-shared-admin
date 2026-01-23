import { c as createComponent, i as renderComponent, r as renderTemplate, f as createAstro, m as maybeRenderHead, e as addAttribute, j as renderScript } from '../../chunks/astro/server_BJGX2PJG.mjs';
import 'piccolore';
import { $ as $$BaseLayout } from '../../chunks/BaseLayout_D6_g2f6W.mjs';
/* empty css                                              */
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const prerender = false;
const $$ResultsManager = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$ResultsManager;
  let result = null;
  let errorMessage = null;
  if (Astro2.request.method === "POST") {
    try {
      const formData = await Astro2.request.formData();
      const copiedText = formData.get("copiedText");
      if (!copiedText) {
        throw new Error("\u30B3\u30D4\u30DA\u30C7\u30FC\u30BF\u304C\u7A7A\u3067\u3059");
      }
      const parsedData = parseNankanResults(copiedText);
      result = {
        parsedData,
        json: JSON.stringify(parsedData, null, 2)
      };
    } catch (error) {
      errorMessage = error.message;
    }
  }
  function parseNankanResults(text) {
    if (!text || typeof text !== "string") {
      throw new Error("\u30C6\u30AD\u30B9\u30C8\u304C\u7A7A\u3067\u3059");
    }
    const raceInfo = extractRaceInfo(text);
    const results = extractResults(text);
    const payouts = extractPayouts(text);
    return {
      date: raceInfo.date,
      venue: raceInfo.venue,
      venueCode: raceInfo.venueCode,
      races: [
        {
          raceNumber: raceInfo.raceNumber,
          raceName: raceInfo.raceName,
          distance: raceInfo.distance,
          surface: raceInfo.surface,
          track: raceInfo.track,
          horses: raceInfo.horses,
          startTime: raceInfo.startTime,
          results,
          payouts,
          enteredAt: (/* @__PURE__ */ new Date()).toISOString(),
          enteredBy: "staff-ui"
        }
      ],
      dataVersion: "1.0"
    };
  }
  function extractRaceInfo(text) {
    const dateMatch = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (!dateMatch) throw new Error("\u65E5\u4ED8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
    const year = dateMatch[1];
    const month = dateMatch[2].padStart(2, "0");
    const day = dateMatch[3].padStart(2, "0");
    const date = `${year}-${month}-${day}`;
    const venueMatch = text.match(/(船橋|大井|川崎|浦和)競馬/);
    if (!venueMatch) throw new Error("\u7AF6\u99AC\u5834\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
    const venue = venueMatch[1];
    const venueCodeMap = { "\u8239\u6A4B": "FU", "\u5927\u4E95": "OI", "\u5DDD\u5D0E": "KA", "\u6D66\u548C": "UR" };
    const venueCode = venueCodeMap[venue];
    const raceNumberMatch = text.match(/第(\d+)日/);
    const raceNumber = raceNumberMatch ? parseInt(raceNumberMatch[1], 10) : 1;
    const raceNameMatch = text.match(/日[\s\u3000]+(.+?)[\s\u3000]+Ｂ|日[\s\u3000]+(.+?)$/m);
    const raceName = raceNameMatch ? (raceNameMatch[1] || raceNameMatch[2] || "").trim() : "";
    const distanceMatch = text.match(/[ダ芝][\s\u3000]*(\d{1}),?(\d{3})m/);
    const distance = distanceMatch ? parseInt(distanceMatch[1] + distanceMatch[2], 10) : null;
    const surface = text.includes("\u30C0") ? "\u30C0\u30FC\u30C8" : "\u829D";
    const trackMatch = text.match(/（(外|内|右|左)）/);
    const track = trackMatch ? trackMatch[1] : null;
    const horsesMatch = text.match(/（(\d+)頭）/);
    const horses = horsesMatch ? parseInt(horsesMatch[1], 10) : null;
    const startTimeMatch = text.match(/発走時刻(\d{1,2}):(\d{2})/);
    const startTime = startTimeMatch ? `${startTimeMatch[1]}:${startTimeMatch[2]}` : null;
    return { date, venue, venueCode, raceNumber, raceName, distance, surface, track, horses, startTime };
  }
  function extractResults(text) {
    const results = [];
    const lines = text.split("\n");
    for (let line of lines) {
      const match = line.match(/^(\d+)[\s\u3000]+(\d+)[\s\u3000]+(\d+)[\s\u3000]+(.+?)[\s\u3000]+[牡牝セ]\d+[\s\u3000]+([\d.]+)[\s\u3000]+(\d+)kg[\s\u3000]+([+-±＋－]?\d*)[\s\u3000]+(.+?)[\s\u3000]+(.+?)[\s\u3000]+([\d:.]+)[\s\u3000]+(.*?)[\s\u3000]+([\d.]+)[\s\u3000]+(.*)[\s\u3000]+(\d+)\s*$/);
      if (match) {
        results.push({
          rank: parseInt(match[1], 10),
          bracket: parseInt(match[2], 10),
          number: parseInt(match[3], 10),
          name: match[4].trim(),
          jockey: match[8].trim(),
          trainer: match[9].trim(),
          time: match[10].trim(),
          margin: match[11].trim() || "-",
          lastFurlong: match[12].trim(),
          popularity: parseInt(match[14], 10)
        });
      }
    }
    if (results.length === 0) throw new Error("\u7740\u9806\u30C7\u30FC\u30BF\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
    return results;
  }
  function extractPayouts(text) {
    const payouts = {};
    const payoutMatch = text.match(/払戻金[\s\S]*$/);
    if (!payoutMatch) return payouts;
    const payoutSection = payoutMatch[0];
    const lines = payoutSection.split("\n").filter((l) => l.trim());
    let table1HeaderIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("\u5358\u52DD") && lines[i].includes("\u99AC\u5358")) {
        table1HeaderIndex = i;
        break;
      }
    }
    if (table1HeaderIndex > -1) {
      for (let i = table1HeaderIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        if (/^[\d-]/.test(line) && !line.includes("\u7D44\u756A")) {
          const values = line.split(/[\s\u3000]+/).filter((v) => v);
          if (values.length >= 3) {
            payouts.tansho = {
              number: parseInt(values[0], 10),
              payout: parseInt(values[1].replace(/,/g, ""), 10),
              popularity: parseInt(values[2], 10)
            };
          }
          if (values.length >= 12) {
            payouts.umaren = {
              combination: values[9],
              payout: parseInt(values[10].replace(/,/g, ""), 10),
              popularity: parseInt(values[11], 10)
            };
          }
          if (values.length >= 18) {
            payouts.umatan = {
              combination: values[15],
              payout: parseInt(values[16].replace(/,/g, ""), 10),
              popularity: parseInt(values[17], 10)
            };
          }
          break;
        }
      }
    }
    let table2HeaderIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("\u30EF\u30A4\u30C9") && lines[i].includes("\u4E09\u9023\u8907")) {
        table2HeaderIndex = i;
        break;
      }
    }
    if (table2HeaderIndex > -1) {
      for (let i = table2HeaderIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        if (/^[\d-]/.test(line) && !line.includes("\u7D44\u756A")) {
          const values = line.split(/[\s\u3000]+/).filter((v) => v);
          if (values.length >= 6) {
            payouts.sanrenpuku = {
              combination: values[3],
              payout: parseInt(values[4].replace(/,/g, ""), 10),
              popularity: parseInt(values[5], 10)
            };
          }
          if (values.length >= 9) {
            payouts.sanrentan = {
              combination: values[6],
              payout: parseInt(values[7].replace(/,/g, ""), 10),
              popularity: parseInt(values[8], 10)
            };
          }
          break;
        }
      }
    }
    return payouts;
  }
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "\u7D50\u679C\u7BA1\u7406\u753B\u9762", "description": "\u5357\u95A2\u516C\u5F0F\u30B5\u30A4\u30C8\u304B\u3089\u30B3\u30D4\u30FC\u3057\u305F\u7D50\u679C\u3092\u81EA\u52D5\u89E3\u6790\u3057\u3066\u30C7\u30FC\u30BF\u5316\u3057\u307E\u3059", "data-astro-cid-55ukacgc": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<section class="admin-section" data-astro-cid-55ukacgc> <div class="container" data-astro-cid-55ukacgc> <h1 class="page-title" data-astro-cid-55ukacgc>🏇 南関競馬 結果管理</h1> <p class="page-description" data-astro-cid-55ukacgc>
南関公式サイトの結果を全文コピペして、自動解析します。<br data-astro-cid-55ukacgc> <strong data-astro-cid-55ukacgc>※ 全文コピーしてください（日付・レース情報・着順表・払戻金すべて）</strong> </p> <!-- 入力フォーム --> <div class="card form-card" data-astro-cid-55ukacgc> <h2 data-astro-cid-55ukacgc>📋 南関公式結果を全文コピペ</h2> <form method="POST" data-astro-cid-55ukacgc> <div class="form-group" data-astro-cid-55ukacgc> <label for="copiedText" data-astro-cid-55ukacgc>コピペエリア</label> <textarea id="copiedText" name="copiedText" rows="20" required class="form-textarea" placeholder="2026年1月23日 第10回 船橋競馬 第5日 ダ2,200m（外） （14頭） 発走時刻20:50
ガーネット２２００ Ｂ２Ｂ３ 選抜馬
着    枠    馬番    馬名    性齢    負担    馬体重    増減    騎手    調教師    タイム    着差    上がり3F    コーナー通過順    人気
1    5    7    マキシマムパワー    牡4    55.0    500kg    -1    町田直希    林正人    2:28.0    -    39.3    -    1
2    6    9    ヒロシゲジャック    牡7    57.0    528kg    ＋6    笠野雄大    山中尊徳    2:28.1    クビ    40.1    -    11
...
（全文コピー）" data-astro-cid-55ukacgc></textarea> </div> <button type="submit" class="btn btn-primary btn-lg w-full" data-astro-cid-55ukacgc>
🔍 自動解析
</button> </form> </div> <!-- エラー表示 --> ${errorMessage && renderTemplate`<div class="card error-card" data-astro-cid-55ukacgc> <h3 data-astro-cid-55ukacgc>❌ エラー</h3> <p data-astro-cid-55ukacgc>${errorMessage}</p> <p class="error-hint" data-astro-cid-55ukacgc> <strong data-astro-cid-55ukacgc>解決方法:</strong><br data-astro-cid-55ukacgc>
✅ 日付行から払戻金まで全文コピーしてください<br data-astro-cid-55ukacgc>
✅ 「2026年1月23日」の形式で日付が含まれているか確認<br data-astro-cid-55ukacgc>
✅ 「船橋競馬」「大井競馬」「川崎競馬」「浦和競馬」のいずれかが含まれているか確認
</p> </div>`} <!-- 結果表示 --> ${result && renderTemplate`<div class="results-section" data-astro-cid-55ukacgc> <div class="race-card card" data-astro-cid-55ukacgc> <h2 class="section-title" data-astro-cid-55ukacgc>✅ プレビュー確認</h2> <!-- レース情報 --> <div class="race-info-summary" data-astro-cid-55ukacgc> <h3 data-astro-cid-55ukacgc>📅 レース情報</h3> <div class="info-grid" data-astro-cid-55ukacgc> <div class="info-item" data-astro-cid-55ukacgc> <span class="info-label" data-astro-cid-55ukacgc>日付:</span> <span class="info-value" data-astro-cid-55ukacgc>${result.parsedData.date}</span> </div> <div class="info-item" data-astro-cid-55ukacgc> <span class="info-label" data-astro-cid-55ukacgc>競馬場:</span> <span class="info-value" data-astro-cid-55ukacgc>${result.parsedData.venue}</span> </div> <div class="info-item" data-astro-cid-55ukacgc> <span class="info-label" data-astro-cid-55ukacgc>レース:</span> <span class="info-value" data-astro-cid-55ukacgc>
第${result.parsedData.races[0].raceNumber}R ${result.parsedData.races[0].raceName} </span> </div> <div class="info-item" data-astro-cid-55ukacgc> <span class="info-label" data-astro-cid-55ukacgc>距離:</span> <span class="info-value" data-astro-cid-55ukacgc> ${result.parsedData.races[0].surface}${result.parsedData.races[0].distance}m
${result.parsedData.races[0].track && `\uFF08${result.parsedData.races[0].track}\uFF09`} </span> </div> <div class="info-item" data-astro-cid-55ukacgc> <span class="info-label" data-astro-cid-55ukacgc>頭数:</span> <span class="info-value" data-astro-cid-55ukacgc>${result.parsedData.races[0].horses}頭</span> </div> <div class="info-item" data-astro-cid-55ukacgc> <span class="info-label" data-astro-cid-55ukacgc>発走:</span> <span class="info-value" data-astro-cid-55ukacgc>${result.parsedData.races[0].startTime}</span> </div> </div> </div> <!-- 着順表示 --> <div class="results-display" data-astro-cid-55ukacgc> <h3 data-astro-cid-55ukacgc>🏁 着順</h3> <div class="results-table" data-astro-cid-55ukacgc> <div class="table-header" data-astro-cid-55ukacgc> <span data-astro-cid-55ukacgc>着順</span> <span data-astro-cid-55ukacgc>枠</span> <span data-astro-cid-55ukacgc>馬番</span> <span data-astro-cid-55ukacgc>馬名</span> <span data-astro-cid-55ukacgc>騎手</span> <span data-astro-cid-55ukacgc>タイム</span> <span data-astro-cid-55ukacgc>人気</span> </div> ${result.parsedData.races[0].results.slice(0, 3).map((horse) => renderTemplate`<div${addAttribute(`table-row rank-${horse.rank}`, "class")} data-astro-cid-55ukacgc> <span class="rank" data-astro-cid-55ukacgc>${horse.rank}着</span> <span data-astro-cid-55ukacgc>${horse.bracket}</span> <span class="horse-number" data-astro-cid-55ukacgc>${horse.number}</span> <span class="horse-name" data-astro-cid-55ukacgc>${horse.name}</span> <span data-astro-cid-55ukacgc>${horse.jockey}</span> <span data-astro-cid-55ukacgc>${horse.time}</span> <span data-astro-cid-55ukacgc>${horse.popularity}人気</span> </div>`)} </div> </div> <!-- 払戻金表示 --> <div class="payouts-display" data-astro-cid-55ukacgc> <h3 data-astro-cid-55ukacgc>💰 払戻金</h3> <div class="payouts-grid" data-astro-cid-55ukacgc> ${result.parsedData.races[0].payouts.tansho && renderTemplate`<div class="payout-item" data-astro-cid-55ukacgc> <span class="payout-type" data-astro-cid-55ukacgc>単勝</span> <span class="payout-combo" data-astro-cid-55ukacgc>${result.parsedData.races[0].payouts.tansho.number}番</span> <span class="payout-value" data-astro-cid-55ukacgc>${result.parsedData.races[0].payouts.tansho.payout.toLocaleString()}円</span> </div>`} ${result.parsedData.races[0].payouts.umatan && renderTemplate`<div class="payout-item" data-astro-cid-55ukacgc> <span class="payout-type" data-astro-cid-55ukacgc>馬単</span> <span class="payout-combo" data-astro-cid-55ukacgc>${result.parsedData.races[0].payouts.umatan.combination}</span> <span class="payout-value" data-astro-cid-55ukacgc>${result.parsedData.races[0].payouts.umatan.payout.toLocaleString()}円</span> </div>`} ${result.parsedData.races[0].payouts.sanrenpuku && renderTemplate`<div class="payout-item" data-astro-cid-55ukacgc> <span class="payout-type" data-astro-cid-55ukacgc>三連複</span> <span class="payout-combo" data-astro-cid-55ukacgc>${result.parsedData.races[0].payouts.sanrenpuku.combination}</span> <span class="payout-value" data-astro-cid-55ukacgc>${result.parsedData.races[0].payouts.sanrenpuku.payout.toLocaleString()}円</span> </div>`} ${result.parsedData.races[0].payouts.sanrentan && renderTemplate`<div class="payout-item" data-astro-cid-55ukacgc> <span class="payout-type" data-astro-cid-55ukacgc>三連単</span> <span class="payout-combo" data-astro-cid-55ukacgc>${result.parsedData.races[0].payouts.sanrentan.combination}</span> <span class="payout-value" data-astro-cid-55ukacgc>${result.parsedData.races[0].payouts.sanrentan.payout.toLocaleString()}円</span> </div>`} </div> </div> <!-- JSON出力 --> <div class="json-output" data-astro-cid-55ukacgc> <h3 data-astro-cid-55ukacgc>JSON出力</h3> <textarea readonly rows="20" class="json-textarea" data-astro-cid-55ukacgc>${result.json}</textarea> <div class="button-group" data-astro-cid-55ukacgc> <button type="button" class="btn btn-secondary" onclick="navigator.clipboard.writeText(document.querySelector('.json-textarea').value).then(() => alert('JSONをコピーしました！'))" data-astro-cid-55ukacgc>
📋 JSONをコピー
</button> <button type="button" id="saveToGitBtn" class="btn btn-primary" onclick="saveToKeibaDataShared()" data-astro-cid-55ukacgc>
🚀 保存してGit Push
</button> </div> <div id="saveStatus" class="save-status" style="display: none;" data-astro-cid-55ukacgc></div> <p class="save-hint" data-astro-cid-55ukacgc> <strong data-astro-cid-55ukacgc>「🚀 保存してGit Push」ボタンをクリックすると:</strong><br data-astro-cid-55ukacgc>
1. 自動的に keiba-data-shared リポジトリに保存<br data-astro-cid-55ukacgc>
2. Git コミット・プッシュが自動実行<br data-astro-cid-55ukacgc>
3. 全プロジェクトで即座に利用可能になります 🎉
</p> </div> </div> </div>`} <!-- 使用方法 --> <div class="card info-card" data-astro-cid-55ukacgc> <h2 data-astro-cid-55ukacgc>使用方法</h2> <ol data-astro-cid-55ukacgc> <li data-astro-cid-55ukacgc><strong data-astro-cid-55ukacgc>南関公式サイト</strong>で結果ページを開く</li> <li data-astro-cid-55ukacgc>日付行から払戻金まで<strong data-astro-cid-55ukacgc>全文選択・コピー</strong></li> <li data-astro-cid-55ukacgc>上のフォームに<strong data-astro-cid-55ukacgc>ペースト</strong></li> <li data-astro-cid-55ukacgc>「自動解析」ボタンをクリック</li> <li data-astro-cid-55ukacgc>プレビューを確認</li> <li data-astro-cid-55ukacgc>JSONをコピーして<code data-astro-cid-55ukacgc>keiba-data-shared</code>リポジトリに保存</li> <li data-astro-cid-55ukacgc>Git コミット・プッシュで全プロジェクト共有完了 🎉</li> </ol> <h3 data-astro-cid-55ukacgc>⚠️ 注意事項</h3> <ul data-astro-cid-55ukacgc> <li data-astro-cid-55ukacgc>必ず<strong data-astro-cid-55ukacgc>全文コピー</strong>してください（部分コピーはエラーになります）</li> <li data-astro-cid-55ukacgc>日付・競馬場・レース番号・着順表・払戻金がすべて含まれている必要があります</li> </ul> </div> </div> </section>  ${renderScript($$result2, "/Users/apolon/Projects/keiba-data-shared-admin/src/pages/admin/results-manager.astro?astro&type=script&index=0&lang.ts")} ` })}`;
}, "/Users/apolon/Projects/keiba-data-shared-admin/src/pages/admin/results-manager.astro", void 0);

const $$file = "/Users/apolon/Projects/keiba-data-shared-admin/src/pages/admin/results-manager.astro";
const $$url = "/admin/results-manager";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$ResultsManager,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
