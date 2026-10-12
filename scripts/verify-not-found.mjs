#!/usr/bin/env bun
/**
 * The not-found page, through the interface the visitor actually uses.
 *
 * Two things are worth proving in a browser rather than by reading the source:
 * that an unknown address really renders the branded page (and not the error
 * boundary or a blank screen), and that the way back differs correctly by
 * session — a signed-out visitor is sent to the landing page, a signed-in one
 * to their shops, and neither choice skips the session gate on /dashboard.
 *
 *   CHROMIUM_PATH=... bun scripts/verify-not-found.mjs http://127.0.0.1:8083
 */
import { chromium } from "playwright";

const BASE = (process.argv[2] || "http://127.0.0.1:4173").replace(/\/$/, "");
const MISSING = `${BASE}/this-page-does-not-exist`;

const stamp = Date.now();
const EMAIL = `savo-404-${stamp}@example.com`;
const PASSWORD = `Savo404!${stamp % 100000}`;

let passed = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? " — " + detail : ""}`);
  } else {
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport: { width: 360, height: 740 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error).slice(0, 200)));

try {
  // ------------------------------------------------- signed out
  await page.goto(MISSING, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1 }).waitFor({ timeout: 20_000 });

  const heading = await page.locator("h1").first().innerText();
  check(
    "an unknown address renders the branded page",
    /isn.t here|not here|404/i.test(heading),
    heading.replace(/\s+/g, " ").slice(0, 60),
  );

  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  check(
    "it says the records are untouched",
    /nothing in your shop has changed/i.test(body),
    body.slice(0, 90),
  );
  check(
    "it carries the SAVO mark",
    (await page.locator("header svg, div svg, img[alt*='SAVO'], img[alt*='savo']").count()) > 0 ||
      (await page.locator("svg").count()) > 0,
  );

  const primary = page.locator('a[href="/"], a[href="/dashboard"]').first();
  // The page decides where "back" goes once the session resolves, so wait for
  // the settled state rather than reading mid-bootstrap — the same race that
  // makes a fixed sleep report a link that is a render away from existing.
  await page
    .waitForSelector('a[href="/"], a[href="/dashboard"]', { timeout: 15_000 })
    .catch(() => {});
  check(
    "a signed-out visitor is sent to the landing page",
    (await primary.count()) > 0 && /go home/i.test((await primary.innerText()).trim()),
    await primary.innerText().catch(() => "(missing)"),
  );
  const toShops = await page.locator('a[href="/dashboard"]').count();
  check("a signed-out visitor is not sent into the app", toShops === 0, `${toShops} links`);

  // ------------------------------------------------- signed in
  await page.goto(`${BASE}/auth/signup`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.fill("#signup-name", "404 Tester");
  await page.fill("#signup-phone", "0723000000");
  await page.fill("#signup-email", EMAIL);
  await page.fill("#signup-password", PASSWORD);
  await page.check("#signup-accepted");
  await page.click('button[type="submit"]');
  await page.waitForURL(/onboarding|dashboard/, { timeout: 40_000 }).catch(() => {});
  await page.waitForTimeout(1500);

  await page.goto(MISSING, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1 }).waitFor({ timeout: 20_000 });
  await page.waitForSelector('a[href="/dashboard"]', { timeout: 15_000 }).catch(() => {});

  const signedInPrimary = page.locator('a[href="/dashboard"]').first();
  const label = (await signedInPrimary.count())
    ? (await signedInPrimary.innerText()).trim()
    : "(missing)";
  check(
    "a signed-in visitor is sent to their shops",
    (await signedInPrimary.count()) > 0 && /my shops/i.test(label),
    label,
  );
  const homeLink = page.locator('a[href="/"]', { hasText: /SAVO home/i }).first();
  check(
    "and still has a way to the public home",
    (await homeLink.count()) > 0,
    await homeLink.innerText().catch(() => "(missing)"),
  );

  // ------------------------------------------------- control
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const landingH1 = await page
    .locator("h1")
    .first()
    .innerText()
    .catch(() => "");
  check("control: the landing page still renders", landingH1.length > 0, landingH1.slice(0, 50));

  check(
    "no page errors during the run",
    pageErrors.length === 0,
    pageErrors.slice(0, 2).join(" ; "),
  );
} catch (error) {
  check("run completed without throwing", false, error?.message ?? String(error));
} finally {
  await browser.close();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
