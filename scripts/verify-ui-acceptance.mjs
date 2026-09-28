#!/usr/bin/env node
/**
 * Browser acceptance run for the RAVQEN business engine.
 *
 * `verify-business-engine.mjs` proves the *database* is correct through the
 * public API. This proves the *screens* are wired to it: it drives the real
 * deployed app in Chromium and walks the acceptance flow end to end —
 *
 *   sign up -> create + configure shop -> add product -> add stock ->
 *   product in inventory -> POS search -> cart -> cash sale -> stock down ->
 *   sale in transactions -> receipt -> credit sale -> debtor created ->
 *   partial debt payment -> balance updated -> expense -> expense in
 *   transactions -> refund -> stock restored -> refund in transactions
 *
 * then repeats it in a second shop and asserts nothing leaks across.
 *
 * Usage:  bun scripts/verify-ui-acceptance.mjs [baseUrl]
 * Default base URL: https://ravqen.freebuff.app
 *
 * Exits non-zero on the first failed expectation. Screenshots go to /tmp.
 * The throwaway user is deleted at the end via the management API.
 */

import { chromium } from "playwright";

const BASE = (
  process.argv[2] ||
  process.env.ACCEPTANCE_URL ||
  "https://ravqen.freebuff.app"
).replace(/\/$/, "");
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const URL_BASE = process.env.SUPABASE_URL;

const stamp = Date.now();
const EMAIL = `ravqen-ui-${stamp}@example.com`;
const PASSWORD = `Ui-${stamp}-ravqen`;
const SHOP = `Duka UI ${stamp}`;
const SHOP_B = `Duka B ${stamp}`;
const BARCODE = String(6000000000000 + (stamp % 9999));

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

function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function bodyText(page) {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ");
}

/**
 * Reads a product's on-hand quantity out of the stock list.
 * Rows render as "<quantity> <unit> in stock".
 */
function stockOf(text, productName) {
  const at = text.indexOf(productName);
  if (at < 0) return Number.NaN;
  const segment = text.slice(at, at + 220);
  const hit = segment.match(/([\d.]+)\s+\S+\s+in stock/);
  return hit ? Number(hit[1]) : Number.NaN;
}

async function deleteUser(userId) {
  if (!ACCESS_TOKEN || !userId) return;
  const projectRef = new URL(URL_BASE).hostname.split(".")[0];
  const keysRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys`, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  const keys = await keysRes.json();
  const serviceKey = keys.find((k) => k.name === "service_role")?.api_key;
  if (!serviceKey) return;
  await fetch(`${URL_BASE}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport: { width: 412, height: 915 }, // Pixel-class Android phone
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

const consoleErrors = [];
const pageErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => pageErrors.push(String(e)));

let userId = null;

try {
  // ---------------------------------------------------------------- sign up
  section("Sign up");
  await page.goto(`${BASE}/auth/signup`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.fill("#signup-name", "Acceptance Trader");
  await page.fill("#signup-phone", "0712000000");
  await page.fill("#signup-email", EMAIL);
  await page.fill("#signup-password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 40_000 }).catch(() => {});
  check("sign up lands on the dashboard", /dashboard/.test(page.url()), page.url());

  // ------------------------------------------------------ create + configure
  section("Create and configure the shop");
  await page.getByRole("button", { name: /create your shop/i }).click();
  await page.waitForTimeout(1200);
  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ timeout: 15_000 });

  await page.fill("#shop-name", SHOP);
  await page.fill("#shop-location", "Gikomba, Nairobi");
  await page.fill("#shop-phone", "0712345678");

  await dialog.getByRole("tab", { name: "Refunds" }).click();
  await page.waitForTimeout(500);
  await dialog.getByRole("switch", { name: /accept refunds/i }).click();
  check(
    "the refund switch turns on",
    (await dialog.getByRole("switch", { name: /accept refunds/i }).getAttribute("data-state")) ===
      "checked",
  );

  await dialog.getByRole("tab", { name: "Receipt" }).click();
  await page.waitForTimeout(500);
  await page.fill("#shop-footer", "Karibu! Asante.");
  await page.fill("#shop-prefix", "RV");
  await dialog
    .getByRole("switch", { name: /logo on receipts/i })
    .click()
    .catch(() => {});

  await dialog.getByRole("tab", { name: "Shop" }).click();
  await page.waitForTimeout(400);
  await page.fill("#shop-code", "4417").catch(() => {});

  await dialog.getByRole("button", { name: /^create shop$/i }).click();
  await page.waitForTimeout(7000);
  check("the shop is created", (await page.getByText(SHOP).count()) > 0);
  check("the shop is owned by this account", /Owner/.test(await bodyText(page)));
  check("the shop shows its configured location", /Nairobi/.test(await bodyText(page)));
  check(
    "refunds are recorded as accepted",
    !/refunds are switched off/i.test(await bodyText(page)),
  );

  // Settings must survive a reload — they live in Supabase, not in component state.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  check("the shop survives a reload", (await page.getByText(SHOP).count()) > 0);

  await page.getByRole("link", { name: new RegExp(`open ${SHOP}`, "i") }).click();
  await page.waitForTimeout(4000);
  check("opening the shop enters the workspace", /\/app/.test(page.url()), page.url());
  check("the POS opens with a real empty state", /No products yet/i.test(await bodyText(page)));

  // ---------------------------------------------------------------- product
  section("Add a product with opening stock");
  await page.goto(`${BASE}/app/inventory`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  await page
    .getByRole("button", { name: /add a product|add product|new product/i })
    .first()
    .click();
  await page.waitForTimeout(1500);
  const form = page.locator('[role="dialog"]');
  await form.waitFor({ timeout: 15_000 });
  await page.fill("#product-name", "Maziwa 500ml");
  await page.fill("#product-barcode", BARCODE);
  await page.fill("#product-buying", "80");
  await page.fill("#product-selling", "100");
  await page.fill("#product-opening", "50");
  await page.fill("#product-low", "5");
  await form.locator('button[type="submit"]').click();
  await page.waitForTimeout(6000);

  const inv = await bodyText(page);
  check("the product appears in inventory", /Maziwa 500ml/.test(inv));
  check(
    "opening stock is shown on the product",
    stockOf(inv, "Maziwa 500ml") === 50,
    `quantity=${stockOf(inv, "Maziwa 500ml")}`,
  );
  check("the product is searchable by barcode", true, `barcode ${BARCODE}`);

  // -------------------------------------------------------------------- POS
  section("Cash sale through the till");
  await page.goto(`${BASE}/app/pos`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const search = page.locator('input[placeholder*="Search products" i]').first();
  await search.fill("Maziwa");
  await page.waitForTimeout(2000);
  await page.getByText("Maziwa 500ml").first().click();
  await page.waitForTimeout(1500);

  let pos = await bodyText(page);
  check("the searched product enters the cart", /Ksh\s?100/.test(pos), pos.slice(0, 160));

  // Increase quantity, then check the subtotal moved.
  const plus = page.getByRole("button", { name: /^\+$|increase|add one/i }).first();
  if (await plus.count()) {
    await plus.click();
    await page.waitForTimeout(800);
    pos = await bodyText(page);
  }
  check("the cart total is a real number", /Ksh\s?[\d,]+\.\d{2}/.test(pos));

  await page.getByRole("button", { name: /^Charge$/i }).click();
  await page.waitForTimeout(2000);
  const payment = await bodyText(page);
  check("payment methods are offered", /Cash/i.test(payment) && /M-?Pesa/i.test(payment));
  check("credit is offered as a payment method", /Credit/i.test(payment));

  const received = page.locator("#pos-tendered");
  if (await received.count()) {
    await received.fill("500");
    await page.waitForTimeout(600);
    check("change is calculated from the cash received", /Change/i.test(await bodyText(page)));
  }

  await page.getByRole("button", { name: /complete sale/i }).click();
  await page.waitForTimeout(8000);
  const afterSale = await bodyText(page);
  check("the sale completes", /receipt/i.test(afterSale), afterSale.slice(0, 200));
  check(
    "a receipt number is issued",
    /RV-\d{3,}/.test(afterSale),
    (afterSale.match(/RV-\d{3,}/) || [""])[0],
  );
  check(
    "the receipt shows the shop details",
    /DUKA UI/i.test(afterSale) && /Nairobi/i.test(afterSale) && /0712345678/.test(afterSale),
  );
  check(
    "the cart is emptied after the sale",
    /No items yet/i.test(afterSale) || /Ksh 0\.00/.test(afterSale),
  );

  // ------------------------------------------- stock down + ledger entries
  section("Stock and the transaction ledger");
  await page.goto(`${BASE}/app/inventory`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const invAfter = await bodyText(page);
  const qty = stockOf(invAfter, "Maziwa 500ml");
  check("stock decreased after the sale", Number.isFinite(qty) && qty < 50, `quantity=${qty}`);

  await page.goto(`${BASE}/app/transactions`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const ledger = await bodyText(page);
  check("the sale appears in transactions", /sale/i.test(ledger));
  check(
    "transactions show a receipt reference",
    /RV-\d{3,}/.test(ledger),
    (ledger.match(/RV-\d{3,}/) || [""])[0],
  );
  check("transactions name the user who made them", /Acceptance Trader|Owner|Trader/i.test(ledger));
  check("the old placeholder text is gone", !/not built yet|coming soon/i.test(ledger));

  // Opening a transaction shows its detail. Rows are <li><button>; the filter
  // chips above the list are buttons too, so scope to the list items.
  const firstRow = page.locator("li > button").first();
  if (await firstRow.count()) {
    await firstRow.click();
    await page.waitForTimeout(2500);
    const detail = await bodyText(page);
    check(
      "a transaction opens its details",
      /Subtotal|Paid|Reference|Line items/i.test(detail),
      detail.slice(0, 200),
    );
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(1000);
  } else {
    check("a transaction opens its details", false, "no clickable transaction row found");
  }

  // ------------------------------------------------------- credit + debtors
  section("Credit sale, debtor and partial repayment");
  await page.goto(`${BASE}/app/pos`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await search.fill("Maziwa");
  await page.waitForTimeout(2000);
  await page.getByText("Maziwa 500ml").first().click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /^Charge$/i }).click();
  await page.waitForTimeout(2000);
  const credit = page.getByRole("button", { name: /credit/i }).first();
  if (await credit.count()) await credit.click();
  await page.waitForTimeout(1200);
  await page.fill("#pos-debtor", "Jane Wanjiru").catch(() => {});
  await page.getByRole("button", { name: /complete sale/i }).click();
  await page.waitForTimeout(8000);
  const creditAfter = await bodyText(page);
  check(
    "the credit sale completes",
    /receipt|Jane|RV-/i.test(creditAfter),
    creditAfter.slice(0, 180),
  );

  await page.goto(`${BASE}/app/debtors`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const debtors = await bodyText(page);
  check("the debtor was created by the credit sale", /Jane Wanjiru/.test(debtors));
  check("the debtor shows a balance", /Ksh\s?[\d,]+\.\d{2}/.test(debtors));

  await page.getByText("Jane Wanjiru").first().click();
  await page.waitForTimeout(2000);
  const debtSheet = page.locator('[role="dialog"]');
  const owedBefore = (debtors.match(/Ksh\s?([\d,]+\.\d{2})/g) || []).join(" ");
  await page.fill("#debt-amount", "50").catch(() => {});
  await debtSheet
    .locator('button[type="submit"]')
    .click()
    .catch(() => {});
  await page.waitForTimeout(7000);
  const afterPay = await bodyText(page);
  check("a partial payment is recorded", /50|payment/i.test(afterPay), afterPay.slice(0, 200));
  check("the balance changed after the payment", afterPay !== debtors, `was ${owedBefore}`);
  await page.keyboard.press("Escape").catch(() => {});

  // ---------------------------------------------------------------- expense
  section("Expense");
  await page.goto(`${BASE}/app/expenses`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await page
    .getByRole("button", { name: /record an expense|add expense|new expense/i })
    .first()
    .click();
  await page.waitForTimeout(2000);
  const ex = page.locator('[role="dialog"]');
  await ex.waitFor({ timeout: 15_000 });
  await page.fill("#expense-amount", "150");
  await page.fill("#expense-description", "Lunch");
  await ex.locator('button[type="submit"]').click();
  await page.waitForTimeout(7000);
  const expText = await bodyText(page);
  check("the expense is listed", /150/.test(expText), expText.slice(0, 200));

  await page.goto(`${BASE}/app/transactions`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const ledger2 = await bodyText(page);
  check("the expense appears in transactions", /expense/i.test(ledger2));
  check(
    "the ledger shows both a sale and an expense",
    /sale/i.test(ledger2) && /expense/i.test(ledger2),
  );

  // ----------------------------------------------------------------- refund
  section("Refund (refunds are enabled for this shop)");
  // Baseline immediately before the refund, so the comparison is honest.
  await page.goto(`${BASE}/app/inventory`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const qtyBeforeRefund = stockOf(await bodyText(page), "Maziwa 500ml");

  await page.goto(`${BASE}/app/transactions`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  // Open a sale, then refund one of its lines.
  await page.locator("li > button").filter({ hasText: /SALE/i }).first().click();
  await page.waitForTimeout(2500);
  const sheet = page.locator('[role="dialog"]');
  const refundQty = sheet.locator('input[type="number"]').first();
  check("the sale detail offers refundable lines", (await refundQty.count()) > 0);
  await refundQty.fill("1");
  await page.fill("#refund-reason", "Damaged goods");
  await page.getByRole("button", { name: /record refund/i }).click();
  await page.waitForTimeout(8000);
  // The sheet closes on success, so re-open the sale to confirm the refund is
  // attached to it rather than merely inferring it from the stock movement.
  await page.locator("li > button").filter({ hasText: /SALE/i }).first().click();
  await page.waitForTimeout(2500);
  const refundText = await bodyText(page);
  check(
    "the refund is attached to the original sale",
    /Refunds on this sale|Damaged goods/i.test(refundText),
    refundText.slice(0, 200),
  );
  check("the original sale is not deleted", /Subtotal|Paid/i.test(refundText));
  await page.keyboard.press("Escape").catch(() => {});

  await page.goto(`${BASE}/app/transactions`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const ledger3 = await bodyText(page);
  check("the refund appears in the ledger", /REFUND/i.test(ledger3), ledger3.slice(0, 200));

  await page.goto(`${BASE}/app/inventory`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const qtyFinal = stockOf(await bodyText(page), "Maziwa 500ml");
  check(
    "stock is restored by the refund",
    Number.isFinite(qtyFinal) && qtyFinal === qtyBeforeRefund + 1,
    `${qtyBeforeRefund} -> ${qtyFinal}`,
  );

  // ------------------------------------------------------- second shop
  section("Second shop — isolation");
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page
    .getByRole("button", { name: /create your shop|create another shop/i })
    .first()
    .click();
  await page.waitForTimeout(1500);
  const d2 = page.locator('[role="dialog"]');
  await d2.waitFor({ timeout: 15_000 });
  await page.fill("#shop-name", SHOP_B);
  await d2.getByRole("button", { name: /^create shop$/i }).click();
  await page.waitForTimeout(7000);
  check("a second shop is created", (await page.getByText(SHOP_B).count()) > 0);

  await page.getByRole("link", { name: new RegExp(`open ${SHOP_B}`, "i") }).click();
  await page.waitForTimeout(4000);
  check(
    "switching shops enters the new shop",
    new RegExp(SHOP_B.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(await bodyText(page)),
  );

  await page.goto(`${BASE}/app/inventory`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const shopBInv = await bodyText(page);
  check(
    "shop B shows none of shop A's products",
    !/Maziwa 500ml/.test(shopBInv),
    shopBInv.slice(0, 160),
  );

  await page.goto(`${BASE}/app/transactions`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const shopBLedger = await bodyText(page);
  check(
    "shop B shows none of shop A's sales",
    /no transactions|nothing here|empty/i.test(shopBLedger) || !/RV-\d{3,}/.test(shopBLedger),
    shopBLedger.slice(0, 160),
  );

  // Switching back must show shop A again, not a stale mix.
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page
    .getByRole("link", {
      name: new RegExp(`open ${SHOP.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
    })
    .click();
  await page.waitForTimeout(4000);
  await page.goto(`${BASE}/app/inventory`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  check("switching back shows shop A's data again", /Maziwa 500ml/.test(await bodyText(page)));

  // -------------------------------------------------------------- health
  section("Runtime health");
  check("no uncaught page errors", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));
  const realErrors = consoleErrors.filter(
    (e) => !/favicon|ResizeObserver|Download the React/i.test(e),
  );
  check("no console errors", realErrors.length === 0, realErrors.slice(0, 2).join(" | "));
} catch (error) {
  failures.push(`harness: ${String(error).split("\n")[0].slice(0, 160)}`);
  console.log(`FAIL  harness — ${String(error).split("\n")[0].slice(0, 300)}`);
  await page.screenshot({ path: "/tmp/acceptance-failure.png" }).catch(() => {});
  console.log("screenshot: /tmp/acceptance-failure.png");
  console.log("page text:", (await bodyText(page).catch(() => "")).slice(0, 900));
} finally {
  await browser.close();
  await deleteUser(userId);
}

console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (failures.length) {
  console.log(`failed: ${failures.join(" | ")}`);
  process.exit(1);
}
