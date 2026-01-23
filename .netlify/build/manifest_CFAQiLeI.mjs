import '@astrojs/internal-helpers/path';
import '@astrojs/internal-helpers/remote';
import 'piccolore';
import { n as NOOP_MIDDLEWARE_HEADER, o as decodeKey } from './chunks/astro/server_BJGX2PJG.mjs';
import 'clsx';
import 'es-module-lexer';
import 'html-escaper';

const NOOP_MIDDLEWARE_FN = async (_ctx, next) => {
  const response = await next();
  response.headers.set(NOOP_MIDDLEWARE_HEADER, "true");
  return response;
};

const codeToStatusMap = {
  // Implemented from IANA HTTP Status Code Registry
  // https://www.iana.org/assignments/http-status-codes/http-status-codes.xhtml
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  NOT_ACCEPTABLE: 406,
  PROXY_AUTHENTICATION_REQUIRED: 407,
  REQUEST_TIMEOUT: 408,
  CONFLICT: 409,
  GONE: 410,
  LENGTH_REQUIRED: 411,
  PRECONDITION_FAILED: 412,
  CONTENT_TOO_LARGE: 413,
  URI_TOO_LONG: 414,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RANGE_NOT_SATISFIABLE: 416,
  EXPECTATION_FAILED: 417,
  MISDIRECTED_REQUEST: 421,
  UNPROCESSABLE_CONTENT: 422,
  LOCKED: 423,
  FAILED_DEPENDENCY: 424,
  TOO_EARLY: 425,
  UPGRADE_REQUIRED: 426,
  PRECONDITION_REQUIRED: 428,
  TOO_MANY_REQUESTS: 429,
  REQUEST_HEADER_FIELDS_TOO_LARGE: 431,
  UNAVAILABLE_FOR_LEGAL_REASONS: 451,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
  HTTP_VERSION_NOT_SUPPORTED: 505,
  VARIANT_ALSO_NEGOTIATES: 506,
  INSUFFICIENT_STORAGE: 507,
  LOOP_DETECTED: 508,
  NETWORK_AUTHENTICATION_REQUIRED: 511
};
Object.entries(codeToStatusMap).reduce(
  // reverse the key-value pairs
  (acc, [key, value]) => ({ ...acc, [value]: key }),
  {}
);

function sanitizeParams(params) {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      if (typeof value === "string") {
        return [key, value.normalize().replace(/#/g, "%23").replace(/\?/g, "%3F")];
      }
      return [key, value];
    })
  );
}
function getParameter(part, params) {
  if (part.spread) {
    return params[part.content.slice(3)] || "";
  }
  if (part.dynamic) {
    if (!params[part.content]) {
      throw new TypeError(`Missing parameter: ${part.content}`);
    }
    return params[part.content];
  }
  return part.content.normalize().replace(/\?/g, "%3F").replace(/#/g, "%23").replace(/%5B/g, "[").replace(/%5D/g, "]");
}
function getSegment(segment, params) {
  const segmentPath = segment.map((part) => getParameter(part, params)).join("");
  return segmentPath ? "/" + segmentPath : "";
}
function getRouteGenerator(segments, addTrailingSlash) {
  return (params) => {
    const sanitizedParams = sanitizeParams(params);
    let trailing = "";
    if (addTrailingSlash === "always" && segments.length) {
      trailing = "/";
    }
    const path = segments.map((segment) => getSegment(segment, sanitizedParams)).join("") + trailing;
    return path || "/";
  };
}

function deserializeRouteData(rawRouteData) {
  return {
    route: rawRouteData.route,
    type: rawRouteData.type,
    pattern: new RegExp(rawRouteData.pattern),
    params: rawRouteData.params,
    component: rawRouteData.component,
    generate: getRouteGenerator(rawRouteData.segments, rawRouteData._meta.trailingSlash),
    pathname: rawRouteData.pathname || void 0,
    segments: rawRouteData.segments,
    prerender: rawRouteData.prerender,
    redirect: rawRouteData.redirect,
    redirectRoute: rawRouteData.redirectRoute ? deserializeRouteData(rawRouteData.redirectRoute) : void 0,
    fallbackRoutes: rawRouteData.fallbackRoutes.map((fallback) => {
      return deserializeRouteData(fallback);
    }),
    isIndex: rawRouteData.isIndex,
    origin: rawRouteData.origin
  };
}

function deserializeManifest(serializedManifest) {
  const routes = [];
  for (const serializedRoute of serializedManifest.routes) {
    routes.push({
      ...serializedRoute,
      routeData: deserializeRouteData(serializedRoute.routeData)
    });
    const route = serializedRoute;
    route.routeData = deserializeRouteData(serializedRoute.routeData);
  }
  const assets = new Set(serializedManifest.assets);
  const componentMetadata = new Map(serializedManifest.componentMetadata);
  const inlinedScripts = new Map(serializedManifest.inlinedScripts);
  const clientDirectives = new Map(serializedManifest.clientDirectives);
  const serverIslandNameMap = new Map(serializedManifest.serverIslandNameMap);
  const key = decodeKey(serializedManifest.key);
  return {
    // in case user middleware exists, this no-op middleware will be reassigned (see plugin-ssr.ts)
    middleware() {
      return { onRequest: NOOP_MIDDLEWARE_FN };
    },
    ...serializedManifest,
    assets,
    componentMetadata,
    inlinedScripts,
    clientDirectives,
    routes,
    serverIslandNameMap,
    key
  };
}

const manifest = deserializeManifest({"hrefRoot":"file:///Users/apolon/Projects/keiba-data-shared-admin/","cacheDir":"file:///Users/apolon/Projects/keiba-data-shared-admin/node_modules/.astro/","outDir":"file:///Users/apolon/Projects/keiba-data-shared-admin/dist/","srcDir":"file:///Users/apolon/Projects/keiba-data-shared-admin/src/","publicDir":"file:///Users/apolon/Projects/keiba-data-shared-admin/public/","buildClientDir":"file:///Users/apolon/Projects/keiba-data-shared-admin/dist/","buildServerDir":"file:///Users/apolon/Projects/keiba-data-shared-admin/.netlify/build/","adapterName":"@astrojs/netlify","routes":[{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"type":"page","component":"_server-islands.astro","params":["name"],"segments":[[{"content":"_server-islands","dynamic":false,"spread":false}],[{"content":"name","dynamic":true,"spread":false}]],"pattern":"^\\/_server-islands\\/([^/]+?)\\/?$","prerender":false,"isIndex":false,"fallbackRoutes":[],"route":"/_server-islands/[name]","origin":"internal","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"type":"endpoint","isIndex":false,"route":"/_image","pattern":"^\\/_image\\/?$","segments":[[{"content":"_image","dynamic":false,"spread":false}]],"params":[],"component":"node_modules/astro/dist/assets/endpoint/generic.js","pathname":"/_image","prerender":false,"fallbackRoutes":[],"origin":"internal","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[{"type":"external","src":"/_astro/results-manager.lyse1Qrk.css"},{"type":"external","src":"/_astro/results-manager.CumdNd1e.css"}],"routeData":{"route":"/admin/results-manager","isIndex":false,"type":"page","pattern":"^\\/admin\\/results-manager\\/?$","segments":[[{"content":"admin","dynamic":false,"spread":false}],[{"content":"results-manager","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/admin/results-manager.astro","pathname":"/admin/results-manager","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[{"type":"external","src":"/_astro/results-manager.lyse1Qrk.css"},{"type":"inline","content":".hero[data-astro-cid-j7pv25f6]{padding:var(--spacing-2xl) 0;min-height:80vh;text-align:center}h1[data-astro-cid-j7pv25f6]{font-size:3rem;margin-bottom:var(--spacing-md)}.lead[data-astro-cid-j7pv25f6]{font-size:1.5rem;color:var(--text-secondary);margin-bottom:var(--spacing-2xl)}.card-grid[data-astro-cid-j7pv25f6]{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:var(--spacing-xl);margin-top:var(--spacing-2xl)}.feature-card[data-astro-cid-j7pv25f6]{padding:var(--spacing-xl);background:var(--bg-secondary);border-radius:var(--radius-lg);text-decoration:none;color:inherit;transition:all .3s ease;border:2px solid transparent;position:relative}.feature-card[data-astro-cid-j7pv25f6]:hover{transform:translateY(-4px);border-color:var(--primary-end);background:var(--bg-tertiary)}.card-icon[data-astro-cid-j7pv25f6]{font-size:3rem;margin-bottom:var(--spacing-md)}.feature-card[data-astro-cid-j7pv25f6] h2[data-astro-cid-j7pv25f6]{font-size:1.5rem;margin-bottom:var(--spacing-sm)}.feature-card[data-astro-cid-j7pv25f6] p[data-astro-cid-j7pv25f6]{color:var(--text-secondary)}.badge[data-astro-cid-j7pv25f6]{display:inline-block;padding:var(--spacing-xs) var(--spacing-sm);background:var(--primary-end);color:#fff;border-radius:var(--radius-sm);font-size:.875rem;margin-top:var(--spacing-sm)}.info-section[data-astro-cid-j7pv25f6]{margin-top:var(--spacing-3xl);padding:var(--spacing-2xl);background:var(--bg-secondary);border-radius:var(--radius-lg)}.info-section[data-astro-cid-j7pv25f6] h2[data-astro-cid-j7pv25f6]{margin-bottom:var(--spacing-xl)}.roles[data-astro-cid-j7pv25f6]{display:grid;grid-template-columns:repeat(auto-fit,minmax(350px,1fr));gap:var(--spacing-xl);text-align:left}.role-card[data-astro-cid-j7pv25f6]{padding:var(--spacing-lg);background:var(--bg-tertiary);border-radius:var(--radius-md)}.role-card[data-astro-cid-j7pv25f6] h3[data-astro-cid-j7pv25f6]{font-size:1.25rem;margin-bottom:var(--spacing-sm)}.role-card[data-astro-cid-j7pv25f6] p[data-astro-cid-j7pv25f6]{color:var(--text-secondary);margin-bottom:var(--spacing-md)}.role-card[data-astro-cid-j7pv25f6] ul[data-astro-cid-j7pv25f6]{list-style:none;padding:0}.role-card[data-astro-cid-j7pv25f6] li[data-astro-cid-j7pv25f6]{padding:var(--spacing-xs) 0;color:var(--text-secondary)}.role-card[data-astro-cid-j7pv25f6] li[data-astro-cid-j7pv25f6]:before{content:\"✓ \";color:var(--primary-end);font-weight:700}\n"}],"routeData":{"route":"/","isIndex":true,"type":"page","pattern":"^\\/$","segments":[],"params":[],"component":"src/pages/index.astro","pathname":"/","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}}],"base":"/","trailingSlash":"ignore","compressHTML":true,"componentMetadata":[["/Users/apolon/Projects/keiba-data-shared-admin/src/pages/admin/results-manager.astro",{"propagation":"none","containsHead":true}],["/Users/apolon/Projects/keiba-data-shared-admin/src/pages/index.astro",{"propagation":"none","containsHead":true}]],"renderers":[],"clientDirectives":[["idle","(()=>{var l=(n,t)=>{let i=async()=>{await(await n())()},e=typeof t.value==\"object\"?t.value:void 0,s={timeout:e==null?void 0:e.timeout};\"requestIdleCallback\"in window?window.requestIdleCallback(i,s):setTimeout(i,s.timeout||200)};(self.Astro||(self.Astro={})).idle=l;window.dispatchEvent(new Event(\"astro:idle\"));})();"],["load","(()=>{var e=async t=>{await(await t())()};(self.Astro||(self.Astro={})).load=e;window.dispatchEvent(new Event(\"astro:load\"));})();"],["media","(()=>{var n=(a,t)=>{let i=async()=>{await(await a())()};if(t.value){let e=matchMedia(t.value);e.matches?i():e.addEventListener(\"change\",i,{once:!0})}};(self.Astro||(self.Astro={})).media=n;window.dispatchEvent(new Event(\"astro:media\"));})();"],["only","(()=>{var e=async t=>{await(await t())()};(self.Astro||(self.Astro={})).only=e;window.dispatchEvent(new Event(\"astro:only\"));})();"],["visible","(()=>{var a=(s,i,o)=>{let r=async()=>{await(await s())()},t=typeof i.value==\"object\"?i.value:void 0,c={rootMargin:t==null?void 0:t.rootMargin},n=new IntersectionObserver(e=>{for(let l of e)if(l.isIntersecting){n.disconnect(),r();break}},c);for(let e of o.children)n.observe(e)};(self.Astro||(self.Astro={})).visible=a;window.dispatchEvent(new Event(\"astro:visible\"));})();"]],"entryModules":{"\u0000noop-middleware":"_noop-middleware.mjs","\u0000virtual:astro:actions/noop-entrypoint":"noop-entrypoint.mjs","\u0000@astro-page:node_modules/astro/dist/assets/endpoint/generic@_@js":"pages/_image.astro.mjs","\u0000@astro-page:src/pages/admin/results-manager@_@astro":"pages/admin/results-manager.astro.mjs","\u0000@astro-page:src/pages/index@_@astro":"pages/index.astro.mjs","\u0000@astrojs-ssr-virtual-entry":"entry.mjs","\u0000@astro-renderers":"renderers.mjs","\u0000@astrojs-ssr-adapter":"_@astrojs-ssr-adapter.mjs","\u0000@astrojs-manifest":"manifest_CFAQiLeI.mjs","/Users/apolon/Projects/keiba-data-shared-admin/node_modules/unstorage/drivers/netlify-blobs.mjs":"chunks/netlify-blobs_DM36vZAS.mjs","/Users/apolon/Projects/keiba-data-shared-admin/src/pages/admin/results-manager.astro?astro&type=script&index=0&lang.ts":"_astro/results-manager.astro_astro_type_script_index_0_lang.l0sNRNKZ.js","astro:scripts/before-hydration.js":""},"inlinedScripts":[["/Users/apolon/Projects/keiba-data-shared-admin/src/pages/admin/results-manager.astro?astro&type=script&index=0&lang.ts",""]],"assets":["/_astro/results-manager.lyse1Qrk.css","/_astro/results-manager.CumdNd1e.css"],"buildFormat":"directory","checkOrigin":true,"allowedDomains":[],"serverIslandNameMap":[],"key":"uqMlVXJJaPezKe3m4CHgyjt4BZukM0Y/vdCc6NFakxw=","sessionConfig":{"driver":"netlify-blobs","options":{"name":"astro-sessions","consistency":"strong"}}});
if (manifest.sessionConfig) manifest.sessionConfig.driverModule = () => import('./chunks/netlify-blobs_DM36vZAS.mjs');

export { manifest };
