import { chromium } from "playwright";

// Minimal repro for the React #418 hydration error: load a route, report any
// uncaught error. The full acceptance run takes three minutes to reach the
// health check; this takes fifteen seconds to reach the same signal.

const BASE =
  process.argv[2] ?? "https://savo.freebuff.page";
const ROUTES = process.argv.slice(3).length
  ? process.argv.slice(3)
  : ["/", "/auth/login", "/auth/signup", "/dashboard"];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox"],
});

for (const route of ROUTES) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).split("\n")[0].slice(0, 150)));
  page.on("console", (m) => {
    if (m.type() === "error") errs.push("console: " + m.text().slice(0, 150));
  });
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    console.log(`${errs.length ? "ERROR" : "ok   "}  ${route}  ${errs[0] ?? ""}`);
  } catch (e) {
    console.log(`THROW  ${route}  ${String(e).split("\n")[0].slice(0, 120)}`);
  }
  await ctx.close();
}

await browser.close();
