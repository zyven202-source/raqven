#!/usr/bin/env bun
// Counts the JSON-LD blocks the *hydrated* document holds, and prints enough
// of each to tell a duplicate apart from a second, different block.
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8080";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
await page.goto(url, { waitUntil: "networkidle" }).catch(() => {});
await page.waitForTimeout(2500);

const blocks = await page.evaluate(() =>
  Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((el, i) => ({
    i,
    len: (el.textContent || "").length,
    head: (el.textContent || "").slice(0, 90),
    sameOriginId: el.id || "(no id)",
    inHead: Boolean(el.closest("head")),
  })),
);

console.log("count:", blocks.length);
for (const b of blocks) console.log(JSON.stringify(b));
console.log(
  "canonical:",
  await page.evaluate(() => document.querySelector('link[rel="canonical"]')?.href),
);
console.log("title:", await page.title());
await browser.close();
