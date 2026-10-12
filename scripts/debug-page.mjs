#!/usr/bin/env bun
// Loads a page and prints console errors, page errors and the body text —
// the quickest way to see why a route renders nothing.
import { chromium } from "playwright";

const url = process.argv[2];
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
page.on("console", (m) => console.log(`[console.${m.type()}]`, m.text().slice(0, 300)));
page.on("response", (res) => {
  const u = res.url();
  if (res.status() >= 400 || /\/_serverFn|\/api|supabase/.test(u))
    console.log("[http]", res.status(), u.slice(0, 200));
});
page.on("request", (req) => console.log("[req]", req.method(), req.url().slice(0, 200)));
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 600)));
page.on("requestfailed", (r) =>
  console.log("[netfail]", r.url().slice(0, 160), r.failure()?.errorText),
);
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
console.log("URL:", page.url());
console.log("H1 count:", await page.locator("h1").count());
console.log("HTML:", (await page.evaluate(() => document.body.innerHTML)).slice(0, 600));
await page.screenshot({ path: "/tmp/debug-page.png" }).catch(() => {});
console.log(
  "BODY:",
  (
    await page
      .locator("body")
      .innerText()
      .catch(() => "(none)")
  )
    .replace(/\s+/g, " ")
    .slice(0, 500),
);
await browser.close();
