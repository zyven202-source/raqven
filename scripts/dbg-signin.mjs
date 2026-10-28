#!/usr/bin/env bun
// Reproduces the sign-in flow in a real browser and reports exactly where it
// fails: every Supabase request, its status, console errors, and the message
// the form and toast show the user.
import { chromium } from "playwright";

const base = process.argv[2] || "http://127.0.0.1:8080";
const email = process.argv[3] || "probe.invalid@example.com";
const password = process.argv[4] || "definitely-wrong-1";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();

const consoleLines = [];
const supaReqs = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning")
    consoleLines.push(`[${m.type()}] ${m.text().slice(0, 300)}`);
});
page.on("pageerror", (e) => consoleLines.push(`[pageerror] ${String(e).slice(0, 300)}`));
page.on("request", (r) => {
  if (/supabase|auth\/v1/.test(r.url()))
    supaReqs.push(`REQ  ${r.method()} ${r.url().slice(0, 140)}`);
});
page.on("response", async (res) => {
  if (/supabase|auth\/v1/.test(res.url())) {
    let body = "";
    try {
      body = (await res.text()).slice(0, 200);
    } catch {}
    supaReqs.push(`RESP ${res.status()} ${res.url().slice(0, 140)} :: ${body}`);
  }
});
page.on("requestfailed", (r) => {
  if (!/supabase|auth\/v1/.test(r.url())) return;
  supaReqs.push(`FAIL ${r.url().slice(0, 140)} :: ${r.failure()?.errorText}`);
});
page.on("requestfailed", (r) => {
  if (!/supabase/.test(r.url()))
    consoleLines.push(`[netfail] ${r.url().slice(0, 120)} :: ${r.failure()?.errorText}`);
});

await page.goto(`${base}/auth/login`, { waitUntil: "networkidle" });
await page.fill("#login-email", email);
await page.fill("#login-password", password);
await Promise.all([page.click('button[type="submit"]'), page.waitForTimeout(6000)]);

const formError = await page
  .locator('[role="alert"], .text-destructive, [id*="form"], p[data-slot]')
  .allInnerTexts()
  .catch(() => []);
const toasts = await page
  .locator("[data-sonner-toast]")
  .allInnerTexts()
  .catch(() => []);
const url = page.url();

console.log("=== Supabase traffic ===");
console.log(supaReqs.join("\n") || "(none)");
console.log("\n=== form/alert texts ===");
console.log(JSON.stringify(formError.filter(Boolean), null, 1));
console.log("\n=== toasts ===");
console.log(JSON.stringify(toasts, null, 1));
console.log("\n=== console errors ===");
console.log(consoleLines.join("\n") || "(none)");
console.log("\nfinal url:", url);
await browser.close();
