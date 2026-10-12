#!/usr/bin/env bun
/**
 * Executes the real visitor-analytics snippet in a real browser against the
 * running preview, and proves the two things that matter:
 *
 *   1. The pipeline is live: the snippet appends the SDK script, initialises
 *      PostHog, and a navigation produces a request whose body carries that
 *      page's URL — the count a dashboard would show comes from somewhere real.
 *   2. The private workspace stays private: after a history change onto an
 *      `/app/...` path, no request body may ever contain that path, because
 *      `before_send` drops the event before it leaves the browser.
 *
 * Assertions read request bodies, not event counts, so the SDK's batching
 * interval cannot turn a leak into a passing run.
 *
 * Run from the project root (bun executes the TypeScript source directly):
 *   CHROMIUM_PATH=... bun scripts/verify-analytics.mjs <previewBaseUrl>
 */
import { chromium } from "playwright";
import { gunzipSync, inflateSync } from "node:zlib";

import { analyticsSnippet } from "../src/lib/analytics.ts";

const BASE = (process.argv[2] || "").replace(/\/$/, "");
if (!BASE) {
  console.error("usage: bun scripts/verify-analytics.mjs <previewBaseUrl>");
  process.exit(2);
}

const KEY = "phc_TESTONLY_NOT_A_REAL_KEY";
const HOST = "https://us.i.posthog.com";

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

/**
 * PostHog may gzip an event batch and base64 it into a `data=…` field, so the
 * URL of the page is not literally present in the request body. Decoding is
 * the difference between asserting about the snippet and asserting about the
 * compressor: without it these checks would fail no matter what the app did.
 */
function decodeBody(body) {
  if (!body) return "";
  const params = new URLSearchParams(body);
  const data = params.get("data");
  // An uncompressed batch arrives as `data=[{…}]` and needs no decoding.
  if (!data || data.startsWith("[") || data.startsWith("{")) return data || body;
  const buf = Buffer.from(data, "base64");
  try {
    if (buf[0] === 0x1f && buf[1] === 0x8b) return gunzipSync(buf).toString("utf8");
    if (buf[0] === 0x78 && (buf[1] & 0x20) !== 32) return inflateSync(buf).toString("utf8");
  } catch {
    /* not deflate/gzip — fall through to the raw bytes */
  }
  return buf.toString("utf8");
}

/** What the last few bodies looked like, so a failure explains itself. */
function recentBodies(limit = 2) {
  return (
    bodies
      .slice(-limit)
      .map((b) => b.replace(/\s+/g, " ").slice(0, 200))
      .join(" || ") || "(no posthog request bodies)"
  );
}

const snippet = analyticsSnippet(KEY, HOST);
check("the snippet builder emits a snippet for a configured key", snippet.length > 0);

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport: { width: 412, height: 915 },
  // PostHog drops every event from a browser whose UA matches its bot list,
  // and "HeadlessChrome" is on it (`posthog._is_bot()` returns true and
  // `capture()` returns silently before before_send or any transport runs).
  // This suite exists to test the snippet, not PostHog's headless detection,
  // so the run presents itself as the phone the product is actually used on.
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36",
});
// PostHog silently drops every event from a browser its bot filter matches:
// `capture()` returns before before_send and before any transport. Two things
// make headless Chromium match, and neither is true of a visitor's phone:
//   1. `navigator.webdriver` is true under Playwright.
//   2. Client Hints keep reporting the `HeadlessChrome` brand even after the
//      userAgent string is replaced — `navigator.userAgentData.brands` is what
//      PostHog actually reads (`Su` checks userAgent, then brands, then
//      webdriver), and `headlesschrome` is on its blocked list.
// Presenting the hints of the phone being imitated is the difference between
// testing this site's snippet and testing PostHog's headless detection.
await context.addInitScript(() => {
  const brands = [
    { brand: "Not_A Brand", version: "8" },
    { brand: "Chromium", version: "153" },
    { brand: "Google Chrome", version: "153" },
  ];
  Object.defineProperty(navigator, "webdriver", { get: () => false });
  Object.defineProperty(navigator, "userAgentData", {
    get: () => ({ brands, mobile: true, platform: "Android" }),
  });
});
const page = await context.newPage();

// Every request whose body mentions a URL — the leak detector.
const bodies = [];
page.on("request", (req) => {
  try {
    if (/posthog/.test(new URL(req.url()).host)) {
      bodies.push(decodeBody(req.postData() || ""));
    }
  } catch {
    /* non-URL request */
  }
});

const rawHome = await fetch(`${BASE}/`).then((r) => r.text());
check(
  "the served HTML carries no snippet while no key is configured",
  !rawHome.includes("savo-analytics"),
);

await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("h1", { timeout: 20_000 });

// Execute the exact string that would be in the document if a key were set.
await page.evaluate(snippet);
const injected = await page.evaluate(() => ({
  flag: Boolean(window.__savoAnalytics),
  script: Boolean(document.getElementById("savo-analytics")),
}));
check("the snippet marks itself as injected", injected.flag);
check("the snippet appends its script tag to the document head", injected.script);

const sdkReady = await page
  .waitForFunction(() => Boolean(window.posthog && window.posthog.__savoInit), null, {
    timeout: 30_000,
  })
  .then(() => true)
  .catch(() => false);
check("the SDK loads from the analytics host and initialises", sdkReady);

// Positive control: a navigation onto a public path must reach the wire.
await page.evaluate(() => history.pushState({}, "", "/verify-analytics-public"));
const sawPublic = await page
  .waitForRequest(
    (req) =>
      /posthog/.test(new URL(req.url()).host) &&
      /verify-analytics-public/.test(decodeBody(req.postData() || "")),
    { timeout: 20_000 },
  )
  .then(() => true)
  .catch(() => false);
if (!sawPublic) await page.waitForTimeout(3000);
check("a public navigation is sent with its URL", sawPublic, sawPublic ? "" : recentBodies());

// Without this, the privacy check below could pass on a pipeline that sends
// nothing at all — an empty wire is not privacy, it is a broken integration.
check(
  "events are actually reaching the wire",
  bodies.length > 0,
  `${bodies.length} posthog request(s)`,
);

// The guarantee: onto an /app path, nothing may leave with that path in it.
const mark = bodies.length;
await page.evaluate(() => history.pushState({}, "", "/app/verify-analytics-private"));
await page.waitForTimeout(8000);
const leaked = bodies.slice(mark).filter((b) => b.includes("/app/verify-analytics-private"));
// Name the event and the property, not just the body: "a body contains the
// path" is not actionable, and the fix differs for $current_url vs $prev_*..
const leakDetails = leaked.map((b) => {
  try {
    const parsed = JSON.parse(b);
    return (parsed.batch ?? [parsed]).map((e) => ({
      event: e.event,
      url: e.properties?.$current_url,
      prev: e.properties?.$prev_pageview_pathname,
      navigation_type: e.properties?.navigation_type,
    }));
  } catch {
    return "unparsable body";
  }
});
check(
  "no request body ever carries an /app path",
  leaked.length === 0,
  leaked.length ? JSON.stringify(leakDetails) : "",
);

// Control again: after leaving /app, sending resumes (drop is per-event, not sticky).
await page.evaluate(() => history.pushState({}, "", "/verify-analytics-resumed"));
const resumed = await page
  .waitForRequest(
    (req) =>
      /posthog/.test(new URL(req.url()).host) &&
      /verify-analytics-resumed/.test(decodeBody(req.postData() || "")),
    { timeout: 20_000 },
  )
  .then(() => true)
  .catch(() => false);
if (!resumed) await page.waitForTimeout(3000);
check("sending resumes once the path is public again", resumed, resumed ? "" : recentBodies());

await browser.close();
console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (failures.length) {
  console.log(`failed: ${failures.join(" | ")}`);
  process.exit(1);
}
