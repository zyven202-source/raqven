#!/usr/bin/env node
/**
 * Generates the screenshots declared in `public/manifest.webmanifest`.
 *
 * PWABuilder's report card asks for screenshots, and the Play Console listing
 * needs phone shots anyway — so both are produced here from the real app
 * rather than mocked up: a shop is signed up, a product added, and the POS
 * screen photographed at exactly the dimensions the manifest declares.
 *
 * Every shot is a plain viewport capture at a device scale factor that lands
 * on the exact pixel size the manifest claims (540x960 @2x = 1080x1920,
 * 1920x1080 @1x). Nothing is resized after the fact: a screenshot whose bytes
 * disagree with its `sizes` attribute is the kind of detail that fails a
 * store review, not a rounding issue.
 *
 * Usage:
 *   CHROMIUM_PATH=... bun scripts/make-store-screenshots.mjs [baseUrl]
 *   Default base URL: the running preview or https://savo.freebuff.app
 *
 * Output: public/screenshots/{savo-landing,savo-pos,savo-wide}.png
 * Exits non-zero if a required shot could not be captured.
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = (process.argv[2] || process.env.SCREENSHOT_URL || "http://127.0.0.1:8080").replace(
  /\/$/,
  "",
);
const OUT = "public/screenshots";

const stamp = Date.now();
const EMAIL = `savo-shot-${stamp}@example.com`;
const PASSWORD = `Shot-${stamp}-savo`;
const SHOP = `Duka Shots ${stamp}`;
const ACCESS_CODE = String(100000 + (stamp % 900000));
const BARCODE = String(6000000000000 + (stamp % 9999));

mkdirSync(OUT, { recursive: true });

const shots = [];
function record(name, detail = "") {
  // A shot is recorded only after its screenshot call returned; the throws
  // above are what keeps a missing shot a failure rather than a quiet MISS.
  shots.push({ name, ok: true, detail });
  console.log(`SHOT  ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Wait for fonts and the entrance animations to settle before clicking the shutter. */
async function settle(page, ms = 1800) {
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(ms);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  // ------------------------------------------------------- portrait shots
  const phone = await browser.newContext({
    viewport: { width: 540, height: 960 }, // *2 = 1080x1920
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await phone.newPage();

  // 1 — the public landing page, which is what a store browser sees first.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" }).catch(() => {});
  await settle(page);
  await page.screenshot({ path: `${OUT}/savo-landing.png` });
  record("savo-landing.png (landing, 1080x1920)");

  // 2 — sign up a throwaway shop so the POS shot shows a real product tile.
  await page.goto(`${BASE}/auth/signup`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.fill("#signup-name", "Shot Owner");
  await page.fill("#signup-phone", "0712000000");
  await page.fill("#signup-email", EMAIL);
  await page.fill("#signup-password", PASSWORD);
  await page.check("#signup-accepted");
  await page.click('button[type="submit"]');
  await page.getByRole("heading", { name: /How will you use SAVO/i }).waitFor({ timeout: 30_000 });

  await page.getByRole("button", { name: /I own a shop/i }).click();
  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ timeout: 15_000 });
  await page.fill("#shop-name", SHOP);
  await page.fill("#shop-location", "Gikomba, Nairobi");
  await page.fill("#shop-phone", "0712345678");
  const refundSwitch = dialog.getByRole("switch", { name: /accept refunds/i });
  if (await refundSwitch.count()) await refundSwitch.click();
  await page.fill("#shop-footer", "Karibu! Asante.");
  await page.fill("#shop-prefix", "SV");
  await page.fill("#shop-code", ACCESS_CODE);
  await dialog.getByRole("button", { name: /^create shop$/i }).click();
  await page.getByRole("button", { name: /open my shop/i }).waitFor({ timeout: 40_000 });
  await page.getByRole("button", { name: /open my shop/i }).click();
  await page.waitForURL(/\/app/, { timeout: 20_000 });

  // Add one product so the POS screen has something to sell.
  await page.goto(`${BASE}/app/inventory`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  // Exact name, not a substring match: the toolbar's scanner button is
  // labelled "Scan a barcode to add a product" and opens a different sheet.
  await page
    .getByRole("button", { name: /^add a product$/i })
    .first()
    .click();
  const form = page.locator('[role="dialog"]');
  await form.waitFor({ timeout: 15_000 });
  await page.fill("#product-name", "Maziwa 500ml");
  await page.fill("#product-barcode", BARCODE);
  await page.fill("#product-buying", "80");
  await page.fill("#product-selling", "100");
  await page.fill("#product-opening", "50");
  await page.fill("#product-low", "5");
  await form.locator('button[type="submit"]').click();
  await page.waitForTimeout(4000);

  // The POS screen with the product on it — the app's actual reason to exist.
  await page.goto(`${BASE}/app/pos`, { waitUntil: "domcontentloaded" });
  const tileVisible = await page
    .getByText("Maziwa 500ml", { exact: false })
    .first()
    .waitFor({ timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (!tileVisible) throw new Error("POS did not show the product tile");
  await settle(page, 2200);
  await page.screenshot({ path: `${OUT}/savo-pos.png` });
  record("savo-pos.png (point of sale, 1080x1920)");
  await phone.close();

  // ----------------------------------------------------------- wide shot
  const desktop = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const wide = await desktop.newPage();
  await wide.goto(`${BASE}/`, { waitUntil: "networkidle" }).catch(() => {});
  await settle(wide, 2200);
  await wide.screenshot({ path: `${OUT}/savo-wide.png` });
  record("savo-wide.png (desktop landing, 1920x1080)");
  await desktop.close();
} finally {
  await browser.close();
}

// Best-effort cleanup of the throwaway account — same management-API delete
// the acceptance suite uses, and the same behaviour when the token is absent.
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const URL_BASE = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
if (ACCESS_TOKEN && URL_BASE) {
  try {
    const projectRef = new URL(URL_BASE).hostname.split(".")[0];
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/auth/users?page=1&per_page=200`,
      { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } },
    );
    const list = await res.json().catch(() => ({}));
    const target = (list?.users ?? list?.data ?? []).find((u) => u.email === EMAIL);
    if (target) {
      await fetch(`https://api.supabase.com/v1/projects/${projectRef}/auth/users/${target.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
      });
      console.log(`cleaned up ${EMAIL}`);
    }
  } catch (error) {
    console.warn(`cleanup skipped: ${error.message}`);
  }
}

const failed = shots.filter((s) => !s.ok);
console.log(`\n${shots.length - failed.length}/${shots.length} screenshots captured`);
process.exit(failed.length ? 1 : 0);
