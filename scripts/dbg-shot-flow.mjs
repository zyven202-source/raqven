#!/usr/bin/env node
/**
 * Walks exactly the flow `make-store-screenshots.mjs` walks, and at each step
 * prints the URL, the open dialogs and their text — so a step that silently
 * lands on the wrong screen can be told apart from one that never arrived.
 * Ends with a screenshot of whatever state it failed in (/tmp/dbg-shot.png).
 */
import { chromium } from "playwright";

const BASE = (process.argv[2] || "http://127.0.0.1:8080").replace(/\/$/, "");
const stamp = Date.now();
const EMAIL = `savo-dbg-${stamp}@example.com`;
const PASSWORD = `Dbg-${stamp}-savo`;
const SHOP = `Duka Dbg ${stamp}`;
const ACCESS_CODE = String(100000 + (stamp % 900000));

async function state(page, label) {
  const url = page.url();
  const dialogs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="dialog"]')).map((d) =>
      (d.innerText || "").replace(/\s+/g, " ").slice(0, 200),
    ),
  );
  const body = await page
    .locator("body")
    .innerText()
    .then((t) => t.replace(/\s+/g, " ").slice(0, 260))
    .catch(() => "(none)");
  console.log(
    `\n--- ${label}\nURL: ${url}\nDIALOGS(${dialogs.length}): ${JSON.stringify(dialogs)}\nBODY: ${body}`,
  );
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport: { width: 540, height: 960 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
page.on("console", (m) => {
  if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 200));
});

try {
  await page.goto(`${BASE}/auth/signup`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.fill("#signup-name", "Shot Owner");
  await page.fill("#signup-phone", "0712000000");
  await page.fill("#signup-email", EMAIL);
  await page.fill("#signup-password", PASSWORD);
  await page.check("#signup-accepted");
  await page.click('button[type="submit"]');
  await page.getByRole("heading", { name: /How will you use SAVO/i }).waitFor({ timeout: 30_000 });
  await state(page, "after signup");

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
  await state(page, "shop created (confirmation)");
  await page.getByRole("button", { name: /open my shop/i }).click();
  await page
    .waitForURL(/\/app/, { timeout: 20_000 })
    .catch((e) => console.log("waitForURL:", e.message));
  await page.waitForTimeout(3000);
  await state(page, "entered workspace");

  await page.goto(`${BASE}/app/inventory`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await state(page, "inventory before click");
  const addBtn = page.getByRole("button", { name: /add a product/i }).first();
  console.log(
    "add-button count:",
    await page.getByRole("button", { name: /add a product/i }).count(),
  );
  await addBtn.click({ timeout: 15_000 });
  await page.waitForTimeout(4000);
  await state(page, "after add click");
  console.log("has #product-name:", await page.locator("#product-name").count());
  await page.screenshot({ path: "/tmp/dbg-shot.png" });
} catch (error) {
  console.log("FAILED:", error.message);
  await page.screenshot({ path: "/tmp/dbg-shot.png" }).catch(() => {});
} finally {
  await browser.close();
}
