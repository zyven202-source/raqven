import { chromium } from "playwright";

/** One-off: what sits at a point, and why the swipe was ignored? */
const BASE = process.argv[2] ?? "http://127.0.0.1:8080";
const stamp = Date.now();

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

const IGNORE = [
  "input",
  "textarea",
  "select",
  '[contenteditable="true"]',
  "[data-swipe-ignore]",
  '[role="dialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  "[data-carousel]",
  ".recharts-wrapper",
  "[data-chart]",
].join(",");

await page.goto(`${BASE}/auth/login`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
await page.fill("#login-email", process.argv[3]);
await page.fill("#login-password", process.argv[4]);
await page.click('button[type="submit"]');
await page.waitForURL(/app|dashboard/, { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(5000);
console.log("url:", page.url());

const report = await page.evaluate(
  ([ignore]) => {
    const out = [];
    for (const [x, y] of [
      [330, 520],
      [206, 520],
      [330, 300],
      [206, 700],
    ]) {
      const stack = [];
      let node = document.elementFromPoint(x, y);
      let depth = 0;
      const boundary = document.getElementById("main");
      while (node && node !== boundary && depth < 12) {
        const style = getComputedStyle(node);
        stack.push({
          tag: node.tagName.toLowerCase(),
          cls: (node.className || "").toString().slice(0, 60),
          match: node.matches(ignore),
          ox: style.overflowX,
        });
        node = node.parentElement;
        depth += 1;
      }
      out.push({ x, y, stack });
    }
    return out;
  },
  [IGNORE],
);
console.log(JSON.stringify(report, null, 2));
await browser.close();
