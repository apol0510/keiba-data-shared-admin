import { c as createComponent, i as renderComponent, r as renderTemplate, m as maybeRenderHead } from '../chunks/astro/server_BJGX2PJG.mjs';
import 'piccolore';
import { $ as $$BaseLayout } from '../chunks/BaseLayout_D6_g2f6W.mjs';
/* empty css                                 */
export { renderers } from '../renderers.mjs';

const $$Index = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "\u7BA1\u7406\u753B\u9762", "data-astro-cid-j7pv25f6": true }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<section class="hero" data-astro-cid-j7pv25f6> <div class="container" data-astro-cid-j7pv25f6> <h1 data-astro-cid-j7pv25f6>📊 KEIBA Data Shared Admin</h1> <p class="lead" data-astro-cid-j7pv25f6>競馬データ共有管理画面</p> <div class="card-grid" data-astro-cid-j7pv25f6> <a href="/admin/results-manager" class="feature-card" data-astro-cid-j7pv25f6> <div class="card-icon" data-astro-cid-j7pv25f6>🏇</div> <h2 data-astro-cid-j7pv25f6>結果管理</h2> <p data-astro-cid-j7pv25f6>南関公式サイトの結果を自動解析・保存</p> <span class="badge" data-astro-cid-j7pv25f6>主機能</span> </a> <a href="https://github.com/apol0510/keiba-data-shared" target="_blank" class="feature-card" data-astro-cid-j7pv25f6> <div class="card-icon" data-astro-cid-j7pv25f6>📂</div> <h2 data-astro-cid-j7pv25f6>Data Repository</h2> <p data-astro-cid-j7pv25f6>データリポジトリを確認</p> </a> <a href="https://github.com/apol0510/keiba-data-shared-admin" target="_blank" class="feature-card" data-astro-cid-j7pv25f6> <div class="card-icon" data-astro-cid-j7pv25f6>⚙️</div> <h2 data-astro-cid-j7pv25f6>Admin Repository</h2> <p data-astro-cid-j7pv25f6>管理画面リポジトリを確認</p> </a> </div> <div class="info-section" data-astro-cid-j7pv25f6> <h2 data-astro-cid-j7pv25f6>🎯 役割分担</h2> <div class="roles" data-astro-cid-j7pv25f6> <div class="role-card" data-astro-cid-j7pv25f6> <h3 data-astro-cid-j7pv25f6>📊 keiba-data-shared</h3> <p data-astro-cid-j7pv25f6>データ専用リポジトリ</p> <ul data-astro-cid-j7pv25f6> <li data-astro-cid-j7pv25f6>nankan/results/ - 結果データ</li> <li data-astro-cid-j7pv25f6>nankan/predictions/ - 予想データ</li> <li data-astro-cid-j7pv25f6>parser/ - パーサーライブラリ</li> </ul> </div> <div class="role-card" data-astro-cid-j7pv25f6> <h3 data-astro-cid-j7pv25f6>⚙️ keiba-data-shared-admin</h3> <p data-astro-cid-j7pv25f6>管理画面専用リポジトリ</p> <ul data-astro-cid-j7pv25f6> <li data-astro-cid-j7pv25f6>results-manager - 結果入力画面</li> <li data-astro-cid-j7pv25f6>GitHub API - データ保存</li> <li data-astro-cid-j7pv25f6>Netlify Functions - バックエンド</li> </ul> </div> </div> </div> </div> </section>  ` })}`;
}, "/Users/apolon/Projects/keiba-data-shared-admin/src/pages/index.astro", void 0);

const $$file = "/Users/apolon/Projects/keiba-data-shared-admin/src/pages/index.astro";
const $$url = "";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
