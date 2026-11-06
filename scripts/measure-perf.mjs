#!/usr/bin/env node
/**
 * Startup and repeat-visit measurement, against the production build.
 *
 * What it numbers, and why these:
 *
 *   1. Cold visit — a device that has never seen SAVO: everything comes from
 *      the network, so this is the honest floor for startup.
 *   2. Warm visit — the same browser, service worker active, hashed assets
 *      now cache-first: this is the number the strategy change was for.
 *   3. Offline visit — network gone entirely: does the shell still come up,
 *      and how fast.
 *
 * Each visit reports time to first byte, DOMContentLoaded, load, and how many
 * `/assets/` requests the browser actually made (the cache's whole job is
 * driving that number down). Timings come from the browser's own
 * PerformanceResourceTiming entries, not from a stopwatch in the harness.
 *
 * Usage: CHROMIUM_PATH=... node scripts/measure-perf.mjs [baseUrl]
 */
import { chromium } from "playwright";

const BASE = (process.argv[2] ?? "http://127.0.0.1:4173").replace(/\/$/, "");

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox"],
});

/**
 * Per-navigation network accounting.
 *
 * `fromServiceWorker()` is the only honest way to split a response into
 * "came from the wire" and "the worker answered it": a cache hit and a
 * network fetch look identical from resource timing.
 */
let net = { assetsNet: 0, assetsSw: 0, net: 0 };
function snapshot() {
  net = { assetsNet: 0, assetsSw: 0, net: 0 };
  return () => ({ ...net });
}

function watch(page) {
  page.on("response", (response) => {
    const url = response.url();
    if (!url.startsWith(BASE)) return;
    const isAsset = new URL(url).pathname.startsWith("/assets/");
    if (response.fromServiceWorker()) {
      if (isAsset) net.assetsSw += 1;
    } else {
      net.net += 1;
      if (isAsset) net.assetsNet += 1;
    }
  });
}

async function read(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const paint = performance.getEntriesByName("first-contentful-paint")[0];
    const resources = performance.getEntriesByType("resource");
    const assets = resources.filter((r) => new URL(r.name).pathname.startsWith("/assets/"));
    return {
      ttfb: Math.round(nav ? nav.responseStart - nav.startTime : -1),
      dcl: Math.round(nav ? nav.domContentLoadedEventEnd - nav.startTime : -1),
      load: Math.round(nav ? nav.loadEventEnd - nav.startTime : -1),
      fcp: paint ? Math.round(paint.startTime) : -1,
      assetRequests: assets.length,
      assetBytes: assets.reduce((sum, r) => sum + (r.encodedBodySize || 0), 0),
      rendered: (document.body?.innerText ?? "").length,
    };
  });
}

function line(label, m) {
  return [
    `${label}`.padEnd(22),
    `TTFB ${String(m.ttfb).padStart(4)}ms`,
    `FCP ${String(m.fcp).padStart(5)}ms`,
    `DCL ${String(m.dcl).padStart(5)}ms`,
    `load ${String(m.load).padStart(5)}ms`,
    `assets ${String(m.assetRequests).padStart(3)} req / ${Math.round(m.assetBytes / 1024)}KB`,
  ].join("  ");
}

const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
const page = await context.newPage();
watch(page);

// --------------------------------------------------------------- cold visit
let done = snapshot();
await page.goto(`${BASE}/`, { waitUntil: "load" });
await page.waitForTimeout(1500);
const cold = await read(page);
const coldNet = done();
console.log(line("cold visit", cold));
console.log(
  `  network: ${coldNet.net} same-origin responses, ${coldNet.assetsNet} hashed assets from the wire`,
);

// -------------------------------------------------------------- warm visit
// The worker has had a load to install and claim; this navigation is the one
// its cache-first asset strategy exists for.
await page.reload({ waitUntil: "load" });
await page
  .waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, {
    timeout: 10_000,
  })
  .catch(() => {});
done = snapshot();
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(800);
const warm = await read(page);
const warmNet = done();
console.log(line("warm visit (cached)", warm));
console.log(
  `  network: ${warmNet.net} same-origin responses, ${warmNet.assetsNet} hashed assets from the wire, ` +
    `${warmNet.assetsSw} served by the worker`,
);

// ----------------------------------------------------------- offline visit
await context.setOffline(true);
done = snapshot();
await page.goto(`${BASE}/`, { waitUntil: "load" }).catch(() => {});
await page.waitForTimeout(1200);
const offline = await read(page);
const offlineNet = done();
console.log(line("offline visit", offline));
console.log(`  network: ${offlineNet.net} same-origin responses with the wire down`);
await context.setOffline(false);

await browser.close();

const pct = (after, before) =>
  before > 0 && after > 0 ? `${(((before - after) / before) * 100).toFixed(0)}%` : "n/a";
console.log(
  `\nrepeat-visit asset requests: ${cold.assetRequests} → ${warm.assetRequests}; ` +
    `load ${cold.load}ms → ${warm.load}ms (${pct(warm.load, cold.load)}); ` +
    `FCP ${cold.fcp}ms → ${warm.fcp}ms (${pct(warm.fcp, cold.fcp)})`,
);
console.log(
  `repeat visit: ${coldNet.assetsNet} hashed assets from the wire → ${warmNet.assetsNet} ` +
    `(${warmNet.assetsSw} served by the worker from cache)`,
);
console.log(
  `offline: shell rendered ${offline.rendered} chars with the network gone ` +
    `(load ${offline.load}ms)`,
);
