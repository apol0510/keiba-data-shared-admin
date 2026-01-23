import { c as createComponent, e as addAttribute, k as renderHead, l as renderSlot, r as renderTemplate, f as createAstro } from './astro/server_BJGX2PJG.mjs';
import 'piccolore';
import 'clsx';
/* empty css                                   */

const $$Astro = createAstro();
const $$BaseLayout = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$BaseLayout;
  const {
    title,
    description = "KEIBA Data Shared Admin - \u7AF6\u99AC\u30C7\u30FC\u30BF\u5171\u6709\u7BA1\u7406\u753B\u9762"
  } = Astro2.props;
  const siteTitle = `${title} | KEIBA Data Shared Admin`;
  return renderTemplate`<html lang="ja"> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="generator"${addAttribute(Astro2.generator, "content")}><title>${siteTitle}</title><meta name="description"${addAttribute(description, "content")}><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&display=swap" rel="stylesheet">${renderHead()}</head> <body> <nav class="main-nav"> <div class="container"> <div class="nav-content"> <a href="/" class="logo"> <span class="logo-icon">📊</span> <span class="logo-text">KEIBA Data Shared Admin</span> </a> <div class="nav-links"> <a href="/admin/results-manager">結果管理</a> <a href="https://github.com/apol0510/keiba-data-shared" target="_blank">Data Repo</a> <a href="https://github.com/apol0510/keiba-data-shared-admin" target="_blank">Admin Repo</a> </div> </div> </div> </nav> <main> ${renderSlot($$result, $$slots["default"])} </main> <footer class="main-footer"> <div class="container"> <p>&copy; 2026 KEIBA Data Shared Admin - 全プロジェクト共有データ管理</p> </div> </footer> </body></html>`;
}, "/Users/apolon/Projects/keiba-data-shared-admin/src/layouts/BaseLayout.astro", void 0);

export { $$BaseLayout as $ };
