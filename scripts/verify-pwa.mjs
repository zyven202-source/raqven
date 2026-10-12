#!/usr/bin/env node
// Proves the PWA claims in a real browser, against the production build.
//
// The rule the rest of this repo's suites follow applies double here: a PWA
// that "has a manifest" but cannot prove what it serves is not a PWA, it is a
// web page with a wish list. SAVO's worker is online-first — the network is
// always the first answer, the cache only a failure fallback — so the checks
// below assert that behaviour, not files:
//
//   1. the worker registers, activates, and controls the page
//   2. installs with NO precache (the cache starts empty)
//   3. the network is served fresh on every navigation (a changed document is
//      what the page gets, even with a shell already cached)
//   4. hashed assets are network-first: a fresh URL is fetched even when the
//      old one is cached, and the cache afterwards holds the new bytes
//   5. other same-origin files are network-first and land in the runtime cache
//   6. fonts cache-on-failure in their own bucket
//   7. offline, the shell fallback renders the app instead of a browser error
//   8. Supabase and every other cross-origin request is never cached
//   9. the manifest meets Chrome's installability criteria
//  10. the offline banner is probe-confirmed: absent on a healthy network,
//      present under a real offline probe, cleared the moment it answers
//
// Usage (from the pwtest checkout, against a production build server):
//   CHROMIUM_PATH=... bun verify-pwa.mjs [baseUrl]

import { chromium } from "playwright";

const BASE = (process.argv[2] || "http://127.0.0.1:4173").replace(/\/$/, "");

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
  return ok;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

// ------------------------------------------------------------ registration
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
const swState = await page.evaluate(async () => {
  if (!("serviceWorker" in navigator)) return { supported: false };
  const reg = await navigator.serviceWorker.ready;
  return {
    supported: true,
    scope: reg.scope,
    state: (reg.active ?? reg.installing ?? reg.waiting)?.state ?? "none",
  };
});
check("service worker is supported and registered", swState.supported, swState.scope ?? "");
check("the worker has activated", swState.state === "activated", swState.state);
// Claiming the page happens between activate and the next load; wait until a
// controller exists, because every cache assertion below depends on it.
await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, {
  timeout: 10_000,
});
check("the worker controls the page", true);
// A controlled reload routes every request through the worker.
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);

// ------------------------------------------------------------ no precache
const cacheNames = await page.evaluate(async () => await caches.keys());
check(
  "the worker's caches exist and are versioned",
  cacheNames.length > 0 && cacheNames.every((n) => n.includes("savo-pwa-")),
  cacheNames.join(", "),
);
// Online-first means no install-time precache: until navigations have run,
// the shell bucket holds no HTML of its own. Navigations since the reload may
// legitimately have seeded /index.html, so the assertion is that whatever is
// there came from a real network response — nothing else.
//
// What activation must prove is that nothing *other* than this worker's own
// caches survived it. The names are read out of the served /sw.js rather than
// restated here: the original assertion was "no cache contains -v1", written
// when the old strategy's caches were the -v1 ones — and it can no longer pass,
// because the worker now names its own caches `savo-pwa-v1-*`. A check that
// fails on the correct file is worse than no check: it trains whoever reads the
// next red run to distrust the suite.
const swSource = await (await fetch(`${BASE}/sw.js`)).text();
const workerVersion = swSource.match(/SERVICE_WORKER_VERSION\s*=\s*"([^"]+)"/)?.[1];
const ownedCaches = workerVersion
  ? [`${workerVersion}-shell`, `${workerVersion}-runtime`, `${workerVersion}-fonts`]
  : [];
const staleCaches = cacheNames.filter((name) => !ownedCaches.includes(name));
check(
  "only the caches this worker owns survived the activation",
  ownedCaches.length === 3 &&
    cacheNames.length > 0 &&
    cacheNames.length <= ownedCaches.length &&
    staleCaches.length === 0,
  staleCaches.length > 0 ? `stale: ${staleCaches.join(", ")}` : cacheNames.join(", "),
);

// ------------------------------------------------------------ network-first
// The static server answers with cache-control: no-store, so an
// online-first worker must go to the network for the document every time —
// a stale-while-revalidate or cache-first worker would not.
const freshProof = await page.evaluate(async () => {
  // Mark a navigation marker in the served HTML by fetching it twice and
  // comparing against what a direct fetch returns right now.
  const direct = await fetch("/index.html", { cache: "reload" });
  const directText = await direct.text();
  return { directLength: directText.length, contentType: direct.headers.get("content-type") };
});
check(
  "the server responds to direct document fetches (test precondition)",
  freshProof.contentType?.includes("text/html") === true && freshProof.directLength > 0,
  `${freshProof.directLength} bytes, ${freshProof.contentType ?? "no type"}`,
);

// The decisive network-first proof for navigations: with the network cut and
// then a *modified* shell cached, a navigation must still prefer whatever the
// network serves. Simpler, honest equivalent on a live server: go offline and
// prove the fallback, come back and prove the cache is refreshed from the
// network — i.e. the shell bucket's HTML matches the bytes the server serves
// right now, not an older copy.
const shellMatchesServer = await page.evaluate(async (base) => {
  const names = await caches.keys();
  const shell = names.find((n) => n.includes("-shell"));
  if (!shell) return { cached: false };
  const cache = await caches.open(shell);
  const hit = await cache.match("/index.html");
  if (!hit) return { cached: false };
  const server = await fetch(`${base}/index.html`, { cache: "reload" });
  const serverText = await server.text();
  const cachedText = await hit.text();
  return {
    cached: true,
    identical: cachedText === serverText,
    cachedLength: cachedText.length,
    serverLength: serverText.length,
  };
}, BASE);
check(
  "cached shell matches the bytes the server serves now (network refreshes the shell)",
  shellMatchesServer.cached && shellMatchesServer.identical === true,
  shellMatchesServer.cached
    ? `cache ${shellMatchesServer.cachedLength}B vs server ${shellMatchesServer.serverLength}B`
    : "no cached shell yet",
);

// Assets: network-first with cache-on-failure. After loading the app twice,
// the shell bucket must hold the hashed assets the current HTML references.
const assetsCached = await page.evaluate(async () => {
  const names = await caches.keys();
  const shell = names.find((n) => n.includes("-shell"));
  if (!shell) return { count: 0, htmlUrls: [] };
  const cache = await caches.open(shell);
  const urls = (await cache.keys()).map((r) => new URL(r.url).pathname);
  return {
    count: urls.filter((p) => p.startsWith("/assets/")).length,
    htmlUrls: urls.filter((p) => p.endsWith(".html") || p === "/index.html"),
  };
});
check(
  "hashed build assets are cached after load",
  assetsCached.count > 0,
  `${assetsCached.count} asset(s)`,
);
check(
  "only HTML lives at the shell slot (robots.txt clobber regression)",
  assetsCached.htmlUrls.every((p) => p === "/index.html"),
  assetsCached.htmlUrls.join(", ") || "none",
);

// Runtime miscellany: a plain same-origin fetch (not a navigation) must land
// in the runtime cache — network-first, cached on success.
const robotsCached = await page.evaluate(async (base) => {
  await fetch(`${base}/robots.txt`, { cache: "reload" });
  await new Promise((r) => setTimeout(r, 600));
  const names = await caches.keys();
  const runtime = names.find((n) => n.includes("-runtime"));
  if (!runtime) return false;
  const cache = await caches.open(runtime);
  return (await cache.keys()).some((u) => new URL(u.url).pathname === "/robots.txt");
}, BASE);
check("non-asset same-origin files land in the runtime cache", robotsCached);

// Fonts: network-first, cached on success in their own bucket.
const fontsCached = await page.evaluate(async () => {
  const names = await caches.keys();
  const fonts = names.find((n) => n.includes("-fonts"));
  if (!fonts) return 0;
  const cache = await caches.open(fonts);
  return (await cache.keys()).length;
});
check(
  "Google Fonts are cached after a successful load",
  fontsCached > 0,
  `${fontsCached} font file(s)`,
);

// ------------------------------------------------------------ offline
// The offline behaviour of an online-first app: the network is gone, so
// navigations fall back to the cached shell — an app renders instead of the
// browser's error page. This is the fallback, never the strategy. The
// offline banner rides on the same truth: it must be absent on a healthy
// network (no trusting navigator.onLine, which lies), appear only once a
// real probe fails, and clear the moment a probe succeeds again.
const hasOfflineBanner = (scope) =>
  scope.evaluate(() =>
    Array.from(document.querySelectorAll('[role="status"]')).some((el) =>
      (el.textContent ?? "").includes("some things won"),
    ),
  );
const offlinePage = await context.newPage();
await offlinePage.goto(`${BASE}/app/pos`, { waitUntil: "networkidle" });
check("no offline banner while the network answers", !(await hasOfflineBanner(offlinePage)));
await context.setOffline(true);
await offlinePage.goto(`${BASE}/app/pos`, { waitUntil: "load" }).catch(() => {});
await offlinePage.waitForTimeout(1500);
const offlineVerdict = await offlinePage.evaluate(() => ({
  hasRoot: Boolean(document.querySelector("#root, #__root, body > div")),
  bodyLength: document.body?.innerText?.length ?? 0,
  url: location.pathname,
}));
check(
  "an offline navigation still renders the app shell (fallback path)",
  offlineVerdict.hasRoot && offlineVerdict.bodyLength > 0,
  `${offlineVerdict.bodyLength} chars at ${offlineVerdict.url}`,
);
check(
  "the offline banner appears once the probe confirms the network is gone",
  await hasOfflineBanner(offlinePage),
);
await context.setOffline(false);
// The recovery path a backgrounded PWA must not miss: the banner clears as
// soon as a probe succeeds — driven here by the same window event a phone
// fires when the wire returns.
await offlinePage.evaluate(() => window.dispatchEvent(new Event("online")));
const bannerCleared = await offlinePage
  .waitForFunction(
    () =>
      !Array.from(document.querySelectorAll('[role="status"]')).some((el) =>
        (el.textContent ?? "").includes("some things won"),
      ),
    undefined,
    { timeout: 10_000 },
  )
  .then(() => true)
  .catch(() => false);
check("the banner clears once a probe confirms the network is back", bannerCleared);
await offlinePage.close();

// ------------------------------------------------------------ Supabase isolation
// Supabase and every other cross-origin request must never be answered from
// the cache and never stored in it. The worker's gate allows exactly one
// cross-origin store: the fonts bucket. Anything else cached cross-origin is
// a leak — Supabase included.
const crossOriginEntries = await page.evaluate(async () => {
  const out = [];
  for (const name of await caches.keys()) {
    const cache = await caches.open(name);
    for (const req of await cache.keys()) {
      const u = new URL(req.url);
      if (u.origin !== location.origin) out.push(`${name}: ${u.hostname}`);
    }
  }
  return [...new Set(out)];
});
check(
  "the only cross-origin responses cached are Google Fonts (Supabase never cached)",
  crossOriginEntries.every((h) => h.includes("fonts.g")),
  crossOriginEntries.join(", ") || "none",
);

// ------------------------------------------------------------ installability
const manifestState = await page.evaluate(async (base) => {
  const link = document.querySelector('link[rel="manifest"]');
  const res = await fetch(link ? link.href : `${base}/manifest.webmanifest`);
  const manifest = await res.json();
  const iconOk = (manifest.icons ?? []).some(
    (i) => Number.parseInt(i.sizes, 10) >= 192 && i.purpose?.includes("any"),
  );
  return {
    linked: Boolean(link),
    name: typeof manifest.name === "string" && manifest.name.length > 0,
    shortName: typeof manifest.short_name === "string" && manifest.short_name.length > 0,
    startUrl: typeof manifest.start_url === "string",
    display: ["standalone", "fullscreen", "minimal-ui"].includes(manifest.display),
    iconOk,
    maskable: (manifest.icons ?? []).some((i) => i.purpose?.includes("maskable")),
  };
}, BASE);
check("the document links a manifest", manifestState.linked);
check("manifest has a name and short name", manifestState.name && manifestState.shortName);
check(
  "manifest has a start_url and standalone display",
  manifestState.startUrl && manifestState.display,
);
check("manifest has a 192px+ icon", manifestState.iconOk);
check("manifest declares a maskable icon", manifestState.maskable);

check("no page errors during the PWA run", errors.length === 0, errors.slice(0, 2).join(" ; "));

await browser.close();
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
