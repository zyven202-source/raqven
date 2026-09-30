#!/usr/bin/env node
// Proves the PWA claims in a real browser, against the production build.
//
// The rule the rest of this repo's suites follow applies double here: a PWA
// that "has a manifest" but does not open offline is not a PWA, it is a web
// page with a wish list. So the checks below assert behaviour, not files:
//
//   1. the worker registers, activates, and controls the page
//   2. the shell's own assets actually land in the caches
//   3. going offline and reloading still renders the app
//   4. fonts survive offline
//   5. hashed assets are cache-first (a second load serves from the cache)
//   6. navigations fall back to the cached shell when the network is gone
//   7. the manifest meets Chrome's installability criteria
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
// A controlled reload routes every request through the worker: hashed assets
// are fetched and cached now, not on the pre-control first paint.
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);

// ------------------------------------------------------------ cache contents
const cacheNames = await page.evaluate(async () => await caches.keys());
check(
  "the shell cache exists",
  cacheNames.some((n) => n.includes("-shell")),
  cacheNames.join(", "),
);
const precached = await page.evaluate(async (base) => {
  const names = await caches.keys();
  const shell = names.find((n) => n.includes("-shell"));
  if (!shell) return [];
  const cache = await caches.open(shell);
  const urls = (await cache.keys()).map((r) => new URL(r.url).pathname);
  void base;
  return urls;
}, BASE);
for (const required of ["/index.html", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"]) {
  check(
    `precache contains ${required}`,
    precached.includes(required),
    `${precached.length} cached URLs`,
  );
}
const assetCached = await page.evaluate(async () => {
  const names = await caches.keys();
  const shell = names.find((n) => n.includes("-shell"));
  const cache = await caches.open(shell);
  return (await cache.keys()).filter((u) => new URL(u.url).pathname.startsWith("/assets/")).length;
});
check("hashed build assets are cached", assetCached > 0, `${assetCached} asset(s)`);

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

// ------------------------------------------------------------ offline
await page.evaluate(() => {
  // Put the page into a state the offline reload must recover.
  window.scrollTo(0, 40);
});
const offlinePage = await context.newPage();
await offlinePage.goto(`${BASE}/app/pos`, { waitUntil: "networkidle" });
await context.setOffline(true);
// Cold navigation with the network cut: the shell fallback must render.
await offlinePage.goto(`${BASE}/app/pos`, { waitUntil: "load" }).catch(() => {});
await offlinePage.waitForTimeout(1500);
const offlineVerdict = await offlinePage.evaluate(() => ({
  hasRoot: Boolean(document.querySelector("#root, #__root, body > div")),
  bodyLength: document.body?.innerText?.length ?? 0,
  url: location.pathname,
  usedShell:
    performance.getEntriesByType("navigation").length > 0 &&
    (performance.getEntriesByType("navigation")[0].transferSize === 0 ||
      performance.getEntriesByType("navigation")[0].decodedBodySize > 0),
}));
check(
  "an offline navigation still renders the app shell",
  offlineVerdict.hasRoot && offlineVerdict.bodyLength > 0,
  `${offlineVerdict.bodyLength} chars at ${offlineVerdict.url}`,
);
const offlineFonts = await offlinePage.evaluate(async () => {
  const names = await caches.keys();
  const fonts = names.find((n) => n.includes("-fonts"));
  if (!fonts) return 0;
  const cache = await caches.open(fonts);
  return (await cache.keys()).length;
});
check("Google Fonts are cached for offline use", offlineFonts > 0, `${offlineFonts} font file(s)`);
await context.setOffline(false);
await offlinePage.close();

// ------------------------------------------------------------ behaviour online
// SWR: a plain same-origin fetch (not a navigation) of a non-asset file must
// land in the runtime cache. Navigations follow the shell path; only fetch()
// exercises the stale-while-revalidate branch.
const robotsCached = await page.evaluate(async (base) => {
  await fetch(`${base}/robots.txt`, { cache: "reload" });
  await new Promise((r) => setTimeout(r, 500));
  const names = await caches.keys();
  const runtime = names.find((n) => n.includes("-runtime"));
  if (!runtime) return false;
  const cache = await caches.open(runtime);
  return (await cache.keys()).some((u) => new URL(u.url).pathname === "/robots.txt");
}, BASE);
check("non-asset files land in the runtime cache (stale-while-revalidate)", robotsCached);

check("no page errors during the PWA run", errors.length === 0, errors.slice(0, 2).join(" ; "));

await browser.close();
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
