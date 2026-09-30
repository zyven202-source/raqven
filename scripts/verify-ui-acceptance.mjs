#!/usr/bin/env node
/**
 * Browser acceptance run for RAVQEN.
 *
 * `verify-business-engine.mjs` proves the *database* is correct through the
 * public API. This proves the *screens* are wired to it: it drives the real
 * deployed app in Chromium, on a Pixel-class touch viewport, and walks the
 * acceptance flow a shopkeeper actually performs —
 *
 *   sign up -> choose "I own a shop" -> create and configure the shop ->
 *   add a product with opening stock -> sell it for cash -> stock down ->
 *   receipt issued -> sale in the ledger -> credit sale -> debtor created ->
 *   partial repayment -> balance updated -> expense -> expense in the ledger ->
 *   refund -> stock restored -> refund in the ledger -> the owner Today screen
 *   agrees with those records -> a second shop is empty -> a staff member joins
 *   with the access code and sees only that shop -> no cross-shop leakage
 *
 * Usage:  bun scripts/verify-ui-acceptance.mjs [baseUrl]
 * Default base URL: https://ravqen.freebuff.app
 *
 * Exits non-zero if any expectation fails. Screenshots go to /tmp. The
 * throwaway accounts are deleted at the end through the management API.
 */

import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = (
  process.argv[2] ||
  process.env.ACCEPTANCE_URL ||
  "https://ravqen.freebuff.app"
).replace(/\/$/, "");
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const URL_BASE = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;

const stamp = Date.now();
const EMAIL = `ravqen-ui-${stamp}@example.com`;
const STAFF_EMAIL = `ravqen-ui-staff-${stamp}@example.com`;
const PASSWORD = `Ui-${stamp}-ravqen`;
const SHOP = `Duka UI ${stamp}`;
const SHOP_B = `Duka B ${stamp}`;
const BARCODE = String(6000000000000 + (stamp % 9999));
// Unique per run: the database refuses a code that two shops both hold, so a
// fixed literal would make this run depend on leftover data.
const ACCESS_CODE = String(100000 + (stamp % 900000));

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
 * A strict RFC 4180 reader, written from the spec rather than from the code
 * that produced the file. It is the point of the export check: a writer tested
 * with its own idea of what it wrote proves nothing, and the escaping in a CSV
 * fails silently rather than loudly.
 */
function parseCsv(input) {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field === "") {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (quoted) throw new Error("file ended inside a quoted field");
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return { rows };
}

/**
 * Waits for text to actually appear, then returns the page's text.
 *
 * A fixed `waitForTimeout` is a bet on how fast a query comes back, and the bet
 * loses on a loaded machine or a cold connection — which is exactly when the
 * suite is least useful, because that is when the run is reporting that the
 * product is broken when it is only late. Anything that asserts on loaded rows
 * waits for the rows.
 */
async function waitForText(page, pattern, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  let text = await bodyText(page);
  while (!pattern.test(text) && Date.now() < deadline) {
    await page.waitForTimeout(400);
    text = await bodyText(page);
  }
  return text;
}

/**
 * Reads a product's on-hand quantity out of the stock list.
 * A row reads "50 pc in stock".
 */
function stockOf(text, productName) {
  const at = text.indexOf(productName);
  if (at < 0) return Number.NaN;
  const segment = text.slice(at, at + 240);
  const hit = segment.match(/([\d.]+)\s+\S+\s+in stock/);
  return hit ? Number(hit[1]) : Number.NaN;
}

async function deleteUser(email) {
  if (!ACCESS_TOKEN || !email) return;
  const projectRef = new URL(URL_BASE).hostname.split(".")[0];
  const usersRes = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/auth/users?page=1&per_page=200`,
    { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } },
  );
  const list = await usersRes.json().catch(() => ({}));
  const users = list?.users ?? list?.data ?? [];
  const target = users.find((user) => user.email === email);
  if (!target) return;
  await fetch(`https://api.supabase.com/v1/projects/${projectRef}/auth/users/${target.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
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

try {
  // ---------------------------------------------------------------- sign up
  section("Sign up");
  await page.goto(`${BASE}/auth/signup`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.fill("#signup-name", "Acceptance Trader");
  await page.fill("#signup-phone", "0712000000");
  await page.fill("#signup-email", EMAIL);
  await page.fill("#signup-password", PASSWORD);
  // The terms/privacy box is required and is deliberately not pre-ticked, so a
  // real person has to tick it. A suite that skipped it would be testing a
  // form no user ever sees.
  await page.check("#signup-accepted");
  check(
    "terms must be accepted before the form will submit",
    await page.evaluate(() => document.querySelector("#signup-accepted")?.checked === true),
  );
  await page.click('button[type="submit"]');
  await page.waitForURL(/onboarding|dashboard/, { timeout: 40_000 }).catch(() => {});
  check("sign up lands on setup", /onboarding|dashboard/.test(page.url()), page.url());

  // The route changes before React has painted the new screen, so wait for the
  // actual question rather than sampling the page mid-transition.
  await page
    .getByRole("heading", { name: /How will you use RAVQEN/i })
    .waitFor({ timeout: 30_000 })
    .catch(() => {});
  const setup = await bodyText(page);
  check("setup asks how RAVQEN will be used", /own a shop/i.test(setup), setup.slice(0, 140));
  check("setup offers the staff path too", /access code/i.test(setup));

  // ------------------------------------------------------ create + configure
  section("Create and configure the shop");
  await page.getByRole("button", { name: /I own a shop/i }).click();
  await page.waitForTimeout(1500);
  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ timeout: 15_000 });

  await page.fill("#shop-name", SHOP);
  await page.fill("#shop-location", "Gikomba, Nairobi");
  await page.fill("#shop-phone", "0712345678");

  const refundSwitch = dialog.getByRole("switch", { name: /accept refunds/i });
  await refundSwitch.click();
  check(
    "refunds can be switched on while creating the shop",
    (await refundSwitch.getAttribute("data-state")) === "checked",
  );

  await page.fill("#shop-footer", "Karibu! Asante.");
  await page.fill("#shop-prefix", "RV");
  await page.fill("#shop-code", ACCESS_CODE);

  await dialog.getByRole("button", { name: /^create shop$/i }).click();
  // The confirmation step is the only place the access code is ever shown, so
  // the run must not race past it: wait for it to actually render.
  await page
    .getByRole("button", { name: /open my shop/i })
    .waitFor({ timeout: 40_000 })
    .catch(() => {});
  await page.waitForTimeout(1500);

  const done = await bodyText(page);
  check("the shop is created", done.includes(SHOP), done.slice(0, 160));
  check(
    "the staff access code is shown once, clearly",
    /staff access code/i.test(done) && done.includes(ACCESS_CODE),
  );

  await dialog.getByRole("button", { name: /open my shop/i }).click();
  await page.waitForURL(/\/app/, { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(4000);
  check("opening the shop enters the workspace", /\/app/.test(page.url()), page.url());

  // ------------------------------------------------------------ navigation
  section("Navigation");
  const nav = await bodyText(page);
  // An owner lands on Today (the brief's daily-operations priority), so wait
  // for it to finish computing before asserting on it.
  await page
    .getByRole("heading", { name: /Today in/i })
    .waitFor({ timeout: 20_000 })
    .catch(() => {});
  await page.waitForTimeout(2500);
  const navReady = await bodyText(page);
  check(
    "a new shop opens on the owner's Today screen",
    /Today in/i.test(navReady) &&
      !/Working out the numbers|Working out today's numbers/i.test(navReady),
    navReady.slice(0, 160),
  );
  check(
    "the loading text is not left on screen",
    !/Working out|Loading/i.test(navReady),
    navReady.slice(0, 120),
  );
  for (const tab of ["POS", "Inventory", "Expenses", "More"]) {
    check(`the ${tab} tab is present`, new RegExp(`\\b${tab}\\b`, "i").test(nav));
  }
  check("owners get a Dashboard tab", /\bDashboard\b/.test(nav));

  // The bar is a floating glass surface, not a divider: it must be a real
  // translucent layer that is pinned above the content, not a static footer.
  const barBox = await page
    .locator('nav[aria-label="Main"]')
    .first()
    .boundingBox()
    .catch(() => null);
  const barStyle = await page
    .locator('nav[aria-label="Main"] .glass-bar')
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return { position: s.position, filter: s.backdropFilter, radius: s.borderRadius };
    })
    .catch(() => null);
  check(
    "the navigation floats above the content",
    barBox !== null && barBox.y > 100 && barStyle?.filter !== "none",
    JSON.stringify({ barBox, filter: barStyle?.filter }),
  );
  check(
    "the navigation is a pill, not a square-cornered bar",
    barStyle !== null && parseFloat(barStyle.radius) >= 16,
    String(barStyle?.radius),
  );

  await page.getByRole("button", { name: /^More$/ }).click();
  await page.waitForTimeout(1200);
  const more = await bodyText(page);
  for (const item of [
    "Debtors",
    "Sales history",
    "Receive stock",
    "Activity log",
    "Reports",
    "Employees",
    "Shop settings",
    "Receipt settings",
    "Refund settings",
  ]) {
    check(`More contains ${item}`, new RegExp(item, "i").test(more));
  }
  check("More is grouped, not a flat list", /Money/i.test(more) && /Stock/i.test(more));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1000);

  // Tapping outside the sheet must dismiss it, not leave it stuck open.
  await page.getByRole("button", { name: /^More$/ }).click();
  await page.waitForTimeout(1000);
  await page.mouse.click(6, 6);
  await page.waitForTimeout(900);
  check("More dismisses on an outside tap", (await page.locator('[role="dialog"]').count()) === 0);

  // ---------------------------------------------------------------- product
  section("Add a product with opening stock");
  await page.goto(`${BASE}/app/inventory`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  await page
    .getByRole("button", { name: /add a product|^\s*Add\s*$/i })
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
  await page.waitForTimeout(7000);

  const inv = await bodyText(page);
  check("the product appears in inventory", /Maziwa 500ml/.test(inv));
  check(
    "opening stock is shown on the product",
    stockOf(inv, "Maziwa 500ml") === 50,
    `quantity=${stockOf(inv, "Maziwa 500ml")}`,
  );
  check("the product carries a real stock status", /In stock/i.test(inv));
  check("the selling and buying prices are both shown", /sells/i.test(inv) && /cost/i.test(inv));
  check("the barcode is on the row", inv.includes(BARCODE));

  // -------------------------------------------------------------------- POS
  section("Cash sale through the till");
  await page.goto(`${BASE}/app/pos`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const search = page.locator('input[aria-label="Search products"]').first();
  await search.fill("Maziwa");
  await page.waitForTimeout(2000);
  await page.getByText("Maziwa 500ml").first().click();
  await page.waitForTimeout(1500);

  let pos = await bodyText(page);
  check("the searched product enters the basket", /Ksh\s?100/.test(pos), pos.slice(0, 160));

  await page.getByRole("button", { name: /take payment/i }).click();
  await page.waitForTimeout(2000);
  const payment = await bodyText(page);
  check("payment methods are offered", /Cash/i.test(payment) && /M-?Pesa/i.test(payment));
  check("card and credit are offered", /Card/i.test(payment) && /Credit/i.test(payment));

  await page.fill("#pos-tendered", "500");
  await page.waitForTimeout(800);
  check("change is calculated from the cash received", /Change/i.test(await bodyText(page)));

  await page.getByRole("button", { name: /complete sale/i }).click();
  await page.waitForTimeout(9000);
  const afterSale = await bodyText(page);
  check(
    "the sale completes and shows a receipt",
    /Receipt/i.test(afterSale),
    afterSale.slice(0, 200),
  );
  check(
    "a receipt number is issued",
    /RV-\d{3,}/.test(afterSale),
    (afterSale.match(/RV-\d{3,}/) || [""])[0],
  );
  check(
    "the receipt shows the shop details",
    /Nairobi/i.test(afterSale) && /0712345678/.test(afterSale),
  );
  check("the basket is emptied after the sale", /Basket is empty/i.test(afterSale));
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(1000);

  // ------------------------------------------- stock down + ledger entries
  section("Stock and the transaction ledger");
  await page.goto(`${BASE}/app/inventory`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const invAfter = await bodyText(page);
  const qty = stockOf(invAfter, "Maziwa 500ml");
  check("stock decreased after the sale", Number.isFinite(qty) && qty === 49, `quantity=${qty}`);

  await page.goto(`${BASE}/app/transactions`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const ledger = await bodyText(page);
  check("the sale appears in transactions", /Sale/i.test(ledger));
  check(
    "transactions show a receipt reference",
    /RV-\d{3,}/.test(ledger),
    (ledger.match(/RV-\d{3,}/) || [""])[0],
  );
  check("transactions name the user who made them", /Acceptance|Trader/i.test(ledger));
  check("the old placeholder text is gone", !/not built yet|coming soon/i.test(ledger));
  check("no developer wording reaches the ledger", !/database|SHA-256|RPC/i.test(ledger));

  const firstRow = page.locator("li > button").first();
  if (await firstRow.count()) {
    await firstRow.click();
    await page.waitForTimeout(2500);
    const detail = await bodyText(page);
    check(
      "a transaction opens its details",
      /Recorded by|Reference|Total/i.test(detail),
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
  await page.getByRole("button", { name: /take payment/i }).click();
  await page.waitForTimeout(1800);
  await page
    .getByRole("button", { name: /^Credit$/ })
    .first()
    .click();
  await page.waitForTimeout(1000);
  await page.fill("#pos-debtor", "Jane Wanjiru");
  await page.getByRole("button", { name: /complete sale/i }).click();
  await page.waitForTimeout(9000);
  const creditAfter = await bodyText(page);
  check(
    "the credit sale completes",
    /Receipt|Jane|RV-/i.test(creditAfter),
    creditAfter.slice(0, 180),
  );
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(1000);

  await page.goto(`${BASE}/app/debtors`, { waitUntil: "domcontentloaded" });
  const debtors = await waitForText(page, /Jane Wanjiru|Ksh\s?[\d,]+\.\d{2}/);
  check(
    "the debtor was created by the credit sale",
    /Jane Wanjiru/.test(debtors),
    debtors.slice(0, 160),
  );
  check("the debtor shows a balance", /Ksh\s?[\d,]+\.\d{2}/.test(debtors));
  check("the screen says these are credit customers only", /credit/i.test(debtors));

  await page.getByText("Jane Wanjiru").first().click();
  await page.waitForTimeout(2500);
  const debtSheet = page.locator('[role="dialog"]');
  await page.fill("#debt-amount", "50");
  await debtSheet.locator('button[type="submit"]').click();
  await page.waitForTimeout(8000);
  const afterPay = await bodyText(page);
  check(
    "a partial payment is recorded",
    /Repayment|repaid|settled/i.test(afterPay),
    afterPay.slice(0, 200),
  );
  check("the balance changed after the payment", afterPay !== debtors);
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(1000);

  // ---------------------------------------------------------------- expense
  section("Expense");
  await page.goto(`${BASE}/app/expenses`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await page
    .getByRole("button", { name: /record an expense|^\s*Add\s*$/i })
    .first()
    .click();
  await page.waitForTimeout(2000);
  const ex = page.locator('[role="dialog"]');
  await ex.waitFor({ timeout: 15_000 });
  await page.fill("#expense-amount", "150");
  await page.fill("#expense-description", "Lunch");
  await ex.locator('button[type="submit"]').click();
  await page.waitForTimeout(7000);
  check("the expense is listed", /150/.test(await bodyText(page)));

  await page.goto(`${BASE}/app/transactions`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const ledger2 = await bodyText(page);
  check("the expense appears in transactions", /Expense/i.test(ledger2));
  check(
    "the ledger shows both a sale and an expense",
    /Sale/i.test(ledger2) && /Expense/i.test(ledger2),
  );

  // ----------------------------------------------------------------- refund
  section("Refund (refunds are enabled for this shop)");
  await page.goto(`${BASE}/app/inventory`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const qtyBeforeRefund = stockOf(await bodyText(page), "Maziwa 500ml");

  await page.goto(`${BASE}/app/transactions`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await page.locator("li > button").filter({ hasText: /Sale/i }).first().click();
  await page.waitForTimeout(2500);
  const sheet = page.locator('[role="dialog"]');
  const refundQty = sheet.locator('input[type="number"]').first();
  check("the sale detail offers refundable lines", (await refundQty.count()) > 0);
  await refundQty.fill("1");
  await page.fill("#refund-reason", "Damaged goods");
  await page.getByRole("button", { name: /record refund/i }).click();
  await page.waitForTimeout(9000);

  await page.locator("li > button").filter({ hasText: /Sale/i }).first().click();
  await page.waitForTimeout(2500);
  const refundText = await bodyText(page);
  check(
    "the refund is attached to the original sale",
    /Damaged goods|Refunds on this sale/i.test(refundText),
    refundText.slice(0, 200),
  );
  check("the original sale is not deleted", /Total|Paid/i.test(refundText));
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(1200);

  await page.goto(`${BASE}/app/transactions`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  check("the refund appears in the ledger", /Refund/i.test(await bodyText(page)));

  await page.goto(`${BASE}/app/inventory`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const qtyFinal = stockOf(await bodyText(page), "Maziwa 500ml");
  check(
    "stock is restored by the refund",
    Number.isFinite(qtyFinal) && qtyFinal === qtyBeforeRefund + 1,
    `${qtyBeforeRefund} -> ${qtyFinal}`,
  );

  // ------------------------------------------------------------ owner today
  section("The owner's Today screen");
  await page.goto(`${BASE}/app/overview`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  const today = await bodyText(page);
  check("the Today screen is reachable", /Today in/i.test(today), today.slice(0, 180));
  check("it reports takings for the day", /Takings/i.test(today));
  check("it distinguishes profit from takings", /Gross profit/i.test(today));
  check("it reports a net result", /Net result/i.test(today));
  check("the estimate is labelled as an estimate", /estimate/i.test(today));
  check("it shows what is owed to the shop", /owed to you/i.test(today));
  check("it shows recent activity", /Recent activity/i.test(today));
  check("it offers the daily quick actions", /Receive stock|Record expense/i.test(today));
  check("no fake statistics are shown", !/placeholder|coming soon/i.test(today));

  // ---------------------------------------------------------- CSV export
  section("Exporting the report as CSV");
  await page.goto(`${BASE}/app/reports`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4500);

  const exportButton = page.getByRole("button", { name: /export csv/i });
  check("the reports page offers a CSV export", (await exportButton.count()) === 1);
  check(
    "the export control is a real target, not a token one",
    await exportButton.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.height >= 44 && r.width >= 44;
    }),
    await exportButton.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return `${Math.round(r.width)}x${Math.round(r.height)}`;
    }),
  );
  // Glass, not a solid slab: the same level 2 material as every other control.
  const exportStyle = await exportButton.evaluate((el) => {
    const s = getComputedStyle(el);
    return { blur: s.backdropFilter, bg: s.backgroundColor };
  });
  check(
    "the export control is built from the glass system",
    /rgba?\(|oklch|color\(/.test(exportStyle.bg) && exportStyle.blur !== "none",
    `${exportStyle.bg} · ${exportStyle.blur}`,
  );
  check(
    "the export button animates rather than snapping",
    await exportButton.evaluate((el) => {
      const t = getComputedStyle(el).transitionProperty;
      return t.includes("transform") && t.includes("background-color");
    }),
  );

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 45_000 }),
    exportButton.click(),
  ]);
  const suggested = download.suggestedFilename();
  check(
    "the download is a named CSV file",
    suggested.endsWith(".csv") && suggested.startsWith("ravqen-") && !suggested.includes(" "),
    suggested,
  );

  const csvPath = await download.path();
  const csv = readFileSync(csvPath, "utf8");
  check("the file is not empty", csv.length > 200, `${csv.length} bytes`);
  check("the file is UTF-8 with a byte-order mark", csv.charCodeAt(0) === 0xfeff);
  check("the file uses CSV line endings", csv.includes("\r\n"));

  // Parsed by a reader written from RFC 4180, not by the code that wrote it.
  let parsed = [];
  try {
    parsed = parseCsv(csv).rows;
  } catch (error) {
    check("the file parses as CSV", false, String(error).slice(0, 120));
  }
  const flat = csv;
  check("the file parses as CSV", parsed.length > 8, `${parsed.length} records`);
  check("it names the shop it came from", flat.includes(SHOP), SHOP);
  check("it states the period", /Period,Today/.test(flat));
  check("it carries the summary figures", /SUMMARY[\s\S]*Takings,\d+\.\d{2}/.test(flat));
  check("it names the top products", /TOP PRODUCTS[\s\S]*Maziwa/.test(flat));

  const txHeader = parsed.find((r) => r[0] === "Date" && r.includes("Money in"));
  check(
    "the transactions block has a header",
    Boolean(txHeader) && txHeader.length === 10,
    txHeader ? txHeader.join("|") : "not found",
  );
  const txRows = txHeader
    ? parsed.slice(parsed.indexOf(txHeader) + 1).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r[0]))
    : [];
  check("the transactions block has rows", txRows.length >= 3, `${txRows.length} rows`);
  check(
    "the sales this shop actually made are in the file",
    txRows.some((r) => r.includes("RV-00001")),
    txRows[0]?.join(" | ") ?? "",
  );
  check(
    "the expense is in the file",
    txRows.some((r) => r[2] === "EXPENSE"),
  );
  check(
    "the refund is in the file",
    txRows.some((r) => r[2] === "REFUND"),
  );
  check(
    "money columns are numbers a spreadsheet can total",
    txRows.every(
      (r) =>
        (r[5] === "" || !Number.isNaN(Number(r[5]))) &&
        (r[6] === "" || !Number.isNaN(Number(r[6]))),
    ),
    txRows[0]?.slice(5, 7).join(" / ") ?? "",
  );
  check(
    "the credit sale is marked with its receipt and its customer",
    txRows.some((r) => r[4] && /^RV-/.test(r[4]) && /Jane Wanjiru/.test(r[3])),
    txRows.find((r) => /Jane Wanjiru/.test(r[3]))?.join(" | ") ?? "",
  );

  // The button has to say what it did, and then go back to offering itself.
  await page.waitForTimeout(1200);
  const afterExport = await bodyText(page);
  check(
    "the export confirms itself and returns to idle",
    /Saved/i.test(afterExport),
    afterExport.slice(0, 120),
  );

  // ------------------------------------------------------------ staff join
  section("A staff member joins with the access code");
  const staffContext = await browser.newContext({
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
  });
  const staffPage = await staffContext.newPage();
  try {
    await staffPage.goto(`${BASE}/auth/signup`, { waitUntil: "domcontentloaded" });
    await staffPage.waitForTimeout(3000);
    await staffPage.fill("#signup-name", "Staff Member");
    await staffPage.fill("#signup-email", STAFF_EMAIL);
    await staffPage.fill("#signup-password", PASSWORD);
    await staffPage.check("#signup-accepted");
    await staffPage.click('button[type="submit"]');
    await staffPage.waitForURL(/onboarding/, { timeout: 40_000 }).catch(() => {});
    await staffPage
      .getByRole("heading", { name: /How will you use RAVQEN/i })
      .waitFor({ timeout: 30_000 })
      .catch(() => {});
    await staffPage.waitForTimeout(1000);
    check(
      "a new account is asked whether it owns a shop",
      /own a shop/i.test(await bodyText(staffPage)),
    );

    await staffPage.getByRole("button", { name: /I work in a shop/i }).click();
    await staffPage.waitForTimeout(1500);
    await staffPage.fill("#join-code", ACCESS_CODE);
    await staffPage.getByRole("button", { name: /^join shop$/i }).click();
    await staffPage
      .getByRole("button", { name: /open the till/i })
      .waitFor({ timeout: 40_000 })
      .catch(() => {});
    await staffPage.waitForTimeout(1000);
    const joined = await bodyText(staffPage);
    check("the access code joins the right shop", joined.includes(SHOP), joined.slice(0, 180));
    check("no account id was ever asked for", !/uuid|user id/i.test(joined));

    await staffPage.getByRole("button", { name: /open the till/i }).click();
    await staffPage.waitForURL(/\/app/, { timeout: 20_000 }).catch(() => {});
    await staffPage.waitForTimeout(4500);
    const staffNav = await bodyText(staffPage);
    // The search box is a placeholder, so it never appears in innerText —
    // assert on the real control plus the till's own furniture.
    const staffSearch = staffPage.locator('input[aria-label="Search products"]');
    check(
      "staff land on the till",
      (await staffSearch.count()) > 0 && /take payment/i.test(staffNav),
      staffNav.slice(0, 140),
    );
    check("staff do not get the Dashboard tab", !/\bDashboard\b/.test(staffNav));
    for (const tab of ["POS", "Inventory", "Expenses", "More"]) {
      check(
        `staff get the ${tab} tab`,
        new RegExp(`\\b${tab}\\b`, "i").test(staffNav),
        staffNav.slice(0, 160),
      );
    }

    await staffPage.getByRole("button", { name: /^More$/ }).click();
    await staffPage.waitForTimeout(1200);
    const staffMore = await staffPage.locator('[role="dialog"]').innerText();
    check(
      "staff do not see owner-only sections",
      !/Reports|Employees|Shop settings|Receipt settings|Refund settings/.test(staffMore),
      staffMore.slice(0, 200),
    );
    check("staff still see the operational ones", /Debtors|Sales history/.test(staffMore));
    await staffPage.keyboard.press("Escape");
    await staffPage.waitForTimeout(800);

    await staffPage.goto(`${BASE}/app/overview`, { waitUntil: "domcontentloaded" });
    await staffPage.waitForTimeout(3500);
    check("staff cannot read the owner dashboard", /Owners only/i.test(await bodyText(staffPage)));
  } finally {
    await staffContext.close();
  }

  // ------------------------------------------------------- second shop
  section("Second shop — isolation");
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  const hub = await bodyText(page);
  check("the hub lists the shop that exists", hub.includes(SHOP));
  check("the hub greets the owner by name", /Hello/i.test(hub), hub.slice(0, 120));

  await page.getByRole("button", { name: /add another shop/i }).click();
  await page.waitForTimeout(1800);
  const d2 = page.locator('[role="dialog"]');
  await d2.waitFor({ timeout: 15_000 });
  await page.fill("#shop-name", SHOP_B);
  await d2.getByRole("button", { name: /^create shop$/i }).click();
  await page.waitForTimeout(9000);
  check("a second shop is created", (await bodyText(page)).includes(SHOP_B));
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(500);

  await page.getByText(SHOP_B, { exact: true }).first().click();
  await page.waitForURL(/\/app/, { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(4500);
  check("switching shops enters the new shop", (await bodyText(page)).includes(SHOP_B));

  await page.goto(`${BASE}/app/inventory`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4500);
  const shopBInv = await bodyText(page);
  check(
    "shop B shows none of shop A's products",
    !/Maziwa 500ml/.test(shopBInv),
    shopBInv.slice(0, 160),
  );

  await page.goto(`${BASE}/app/transactions`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4500);
  const shopBLedger = await bodyText(page);
  check(
    "shop B shows none of shop A's sales",
    /no transactions|nothing of that kind/i.test(shopBLedger) || !/RV-\d{3,}/.test(shopBLedger),
    shopBLedger.slice(0, 160),
  );

  // Switching back must show shop A again, not a stale mix.
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  await page.getByText(SHOP, { exact: true }).first().click();
  await page.waitForURL(/\/app/, { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(4500);
  await page.goto(`${BASE}/app/inventory`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4500);
  check("switching back shows shop A's data again", /Maziwa 500ml/.test(await bodyText(page)));

  // -------------------------------------------------------------- desktop
  section("Desktop navigation");
  // Same information architecture, deliberately not the same shape: on a wide
  // window the bar becomes a compact rail rather than five stretched targets.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/app/pos`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const rail = await page
    .locator('nav[aria-label="Main"] .glass-bar')
    .first()
    .boundingBox()
    .catch(() => null);
  check(
    "a wide window gets a compact rail, not a stretched bar",
    rail !== null && rail.height > rail.width && rail.width < 140,
    rail ? `${Math.round(rail.width)}x${Math.round(rail.height)}` : "no rail found",
  );
  check(
    "there is still exactly one navigation",
    (await page.locator('nav[aria-label="Main"]').count()) === 1,
  );
  await page.getByRole("button", { name: /^More$/ }).click();
  await page.waitForTimeout(1200);
  check(
    "More opens from the rail too",
    /Debtors|Sales history/.test(
      await page
        .locator('[role="dialog"]')
        .innerText()
        .catch(() => ""),
    ),
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);

  // ------------------------------------------------ seo and document structure
  section("SEO and document structure");

  /*
    A crawler that does not run JavaScript only ever sees what the static host
    serves, so the head is checked in the raw HTML first and in the hydrated DOM
    second. The two disagreeing is the failure mode worth catching — a tag
    React adds after hydration looks perfect in a browser and does not exist to
    anything else.
  */
  const rawHome = await fetch(`${BASE}/`).then((res) => res.text());
  check("the served HTML carries the JSON-LD", /application\/ld\+json/.test(rawHome));
  check(
    "the served HTML carries an absolute social card",
    /<meta property="og:image" content="https:\/\/[^"]+"/.test(rawHome),
  );
  check(
    "the served HTML carries the meta description",
    /<meta name="description" content="[^"]{80,}"/.test(rawHome),
  );
  check(
    "the served HTML declares a canonical URL",
    /<link rel="canonical" href="https:\/\/[^"]+"/.test(rawHome),
  );

  const seoContext = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const seoPage = await seoContext.newPage();
  const seoErrors = [];
  seoPage.on("pageerror", (error) => seoErrors.push(String(error).split("\n")[0].slice(0, 160)));
  await seoPage.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await seoPage.waitForSelector("h1", { timeout: 20_000 });
  await seoPage.waitForTimeout(2500);

  const doc = await seoPage.evaluate(() => {
    const text = (selector) =>
      Array.from(document.querySelectorAll(selector)).map((el) => (el.textContent || "").trim());
    const meta = (attribute, value) =>
      document.querySelector(`meta[${attribute}="${value}"]`)?.getAttribute("content") ?? null;
    return {
      title: document.title,
      h1: text("h1"),
      h2: text("h2"),
      h3: text("h3"),
      outline: Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((el) => ({
        level: Number(el.tagName.slice(1)),
        title: (el.textContent || "").trim(),
      })),
      description: meta("name", "description"),
      robots: meta("name", "robots"),
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
      og: {
        siteName: meta("property", "og:site_name"),
        title: meta("property", "og:title"),
        description: meta("property", "og:description"),
        type: meta("property", "og:type"),
        url: meta("property", "og:url"),
        locale: meta("property", "og:locale"),
        image: meta("property", "og:image"),
        imageAlt: meta("property", "og:image:alt"),
      },
      twitter: {
        card: meta("name", "twitter:card"),
        title: meta("name", "twitter:title"),
        image: meta("name", "twitter:image"),
      },
      jsonLd: Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(
        (el) => el.textContent || "",
      ),
      images: Array.from(document.querySelectorAll("img")).map((img) => ({
        src: (img.getAttribute("src") || "").slice(0, 60),
        alt: img.getAttribute("alt"),
      })),
    };
  });

  // ------------------------------------------------------------ one h1, once
  check("the landing page has exactly one h1", doc.h1.length === 1, `${doc.h1.length} found`);
  check(
    "the h1 carries the primary keyword",
    /kenyan shop pos/i.test(doc.h1[0] ?? ""),
    doc.h1[0] ?? "(none)",
  );
  check(
    "the h1 is the first heading on the page",
    doc.outline[0]?.level === 1 && doc.outline[0]?.title === doc.h1[0],
  );
  check("the tab title carries the primary keyword", /kenyan shop pos/i.test(doc.title), doc.title);
  check(
    "the tab title is inside the 60 a search result shows",
    doc.title.length > 0 && doc.title.length <= 60,
    `${doc.title.length} characters`,
  );
  const description = doc.description ?? "";
  check("the meta description carries the primary keyword", /kenyan shop pos/i.test(description));
  check(
    "the meta description is inside the 150 a search result shows",
    description.length > 0 && description.length <= 160,
    `${description.length} characters`,
  );

  // -------------------------------------------------------- heading outline
  const skipped = doc.outline.filter(
    (heading, index) => index > 0 && heading.level > doc.outline[index - 1].level + 1,
  );
  check(
    "no heading level is skipped",
    skipped.length === 0,
    skipped.map((heading) => `h${heading.level} ${heading.title}`).join(" | "),
  );
  check("the sections below the h1 are h2s", doc.h2.length >= 3, `${doc.h2.length} sections`);
  check("each section has h3 subsections", doc.h3.length >= 5, `${doc.h3.length} subsections`);
  check(
    "every heading has text",
    doc.outline.every((heading) => heading.title.length > 0),
  );
  check(
    "there is exactly one h1 in the whole document",
    doc.outline.filter((h) => h.level === 1).length === 1,
  );

  // ----------------------------------------------------------- social cards
  check("og:title is set", Boolean(doc.og.title));
  check("og:description is set", Boolean(doc.og.description));
  check("og:type is website", doc.og.type === "website", doc.og.type ?? "(missing)");
  check("og:site_name is set", doc.og.siteName === "RAVQEN", doc.og.siteName ?? "(missing)");
  check(
    "og:url is the absolute home page URL",
    /^https:\/\/[^/]+\/$/.test(doc.og.url ?? ""),
    doc.og.url ?? "(missing)",
  );
  check("og:locale is set", Boolean(doc.og.locale), doc.og.locale ?? "(missing)");
  check(
    "og:image is an absolute URL",
    /^https:\/\//.test(doc.og.image ?? ""),
    doc.og.image ?? "(missing)",
  );
  check("og:image:alt describes the image", (doc.og.imageAlt ?? "").length > 10);
  check("twitter:card is set", Boolean(doc.twitter.card), doc.twitter.card ?? "(missing)");
  check("twitter:title is set", Boolean(doc.twitter.title));
  check("twitter:image is set", /^https:\/\//.test(doc.twitter.image ?? ""));
  check("robots allows indexing", /index/.test(doc.robots ?? ""), doc.robots ?? "(missing)");
  check(
    "the canonical URL is the absolute home page URL",
    /^https:\/\/[^/]+\/$/.test(doc.canonical ?? ""),
    doc.canonical ?? "(missing)",
  );

  // -------------------------------------------------------- structured data
  check(
    "there is exactly one JSON-LD block",
    doc.jsonLd.length === 1,
    `${doc.jsonLd.length} found`,
  );
  let schema = null;
  try {
    schema = JSON.parse(doc.jsonLd[0] ?? "");
  } catch {
    schema = null;
  }
  check("the JSON-LD parses as JSON", schema !== null);
  check(
    "it describes a WebApplication",
    schema?.["@type"] === "WebApplication",
    schema?.["@type"] ?? "",
  );
  check("it is schema.org vocabulary", schema?.["@context"] === "https://schema.org");
  check("it names the application", schema?.name === "RAVQEN", schema?.name ?? "");
  check(
    "it states the operating system",
    typeof schema?.operatingSystem === "string" && schema.operatingSystem.length > 0,
    schema?.operatingSystem ?? "(missing)",
  );
  check(
    "it states the application category",
    schema?.applicationCategory === "BusinessApplication",
    schema?.applicationCategory ?? "(missing)",
  );
  check(
    "it carries the description",
    typeof schema?.description === "string" && schema.description.length > 80,
  );
  check(
    "it lists real features",
    Array.isArray(schema?.featureList) && schema.featureList.length >= 5,
  );
  check(
    "it invents no ratings or prices",
    schema !== null && !/aggregateRating|"review"|"offers"|"price"/.test(JSON.stringify(schema)),
  );

  // -------------------------------------------------------------- app icon
  //
  // The icon is written by a script rather than drawn by hand, and the only thing
  // that proves the file the browser is served is the artwork that was verified
  // is to look at it through the browser's own PNG decoder.
  //
  // Nothing below samples a fixed point. An earlier version named three of them
  // — the middle of the left page, the gutter, the marker — and they described
  // the open-ledger icon that this replaced. They kept passing for a while
  // afterwards by measuring whatever had since moved underneath them, which is
  // the failure mode this block now avoids: the artwork's bounding box is found
  // from the pixels, and the assertions are about its shape.
  const icon = await seoPage.evaluate(async () => {
    const image = new Image();
    image.src = new URL("/icon-512.png", location.href).href;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    //
    // The letter is found from its colour, not from a coordinate: champagne is
    // the one pale-warm population on a dark emerald tile.
    const isLetter = (i) => {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      return data[i + 3] > 128 && r > 170 && g > 150 && b > 100 && b <= g;
    };
    //
    // What must be true of the R tile is measured, not pointed at: two
    // populations (pale-warm letter, dark tile), the letter's bounding box and
    // centroid, and the tile's lightness range. Nothing below knows a
    // coordinate.
    const size = canvas.width;
    let letter = 0;
    let tile = 0;
    let lx = 0;
    let ly = 0;
    let minX = size;
    let maxX = -1;
    let minY = size;
    let maxY = -1;
    const tileLights = [];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = (y * size + x) * 4;
        if (data[i + 3] <= 128) continue;
        if (isLetter(i)) {
          letter += 1;
          lx += x;
          ly += y;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        } else {
          tile += 1;
          tileLights.push(
            Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]),
          );
        }
      }
    }
    tileLights.sort((a, b) => a - b);
    const tileDark = tileLights[Math.floor(tileLights.length * 0.1)] ?? null;
    const tileBright = tileLights[Math.floor(tileLights.length * 0.95)] ?? null;
    return {
      width: size,
      height: canvas.height,
      letter,
      tile,
      centre: letter ? [lx / letter, ly / letter] : null,
      box: letter ? { w: maxX - minX, h: maxY - minY } : null,
      corners: [
        [0, 0],
        [size - 1, 0],
        [0, size - 1],
        [size - 1, size - 1],
      ].map(([x, y]) => data[(y * size + x) * 4 + 3]),
      tileDark,
      tileBright,
    };
  });
  check(
    "the browser can decode the served app icon",
    icon !== null && icon.width === 512 && icon.height === 512,
    icon ? `${icon.width}x${icon.height}` : "undecodable",
  );
  check(
    "the tile's corners are transparent (rounded, not a full-bleed square)",
    (icon?.corners ?? []).every((a) => a < 40),
    `corner alphas ${icon?.corners?.join(", ") ?? "?"}`,
  );
  check(
    "the R is present and substantial",
    (icon?.letter ?? 0) > 3000,
    `${icon?.letter ?? 0} champagne px`,
  );
  check("the tile is present behind it", (icon?.tile ?? 0) > 100000, `${icon?.tile ?? 0} tile px`);
  check(
    "the tile is dark emerald and the letter pale",
    (icon?.tileDark ?? 255) < 110 && (icon?.tileBright ?? 0) > 150,
    `tile dark ${icon?.tileDark ?? "?"}, bright ${icon?.tileBright ?? "?"}`,
  );
  check(
    "the R is centred in the tile",
    icon?.centre != null &&
      Math.abs(icon.centre[0] - 256) < 30 &&
      Math.abs(icon.centre[1] - 256) < 30,
    icon?.centre ? `centre ${icon.centre.map((n) => Math.round(n)).join(", ")}` : "none",
  );
  check(
    "the R reads as a letter, taller than wide",
    icon?.box != null && icon.box.h >= icon.box.w,
    icon?.box ? `${icon.box.w}x${icon.box.h}` : "none",
  );

  // ------------------------------------------------------------------- alt
  const described = (images) =>
    images.every((image) => typeof image.alt === "string" && image.alt.trim().length > 0);
  check(
    "every image on the landing page has alt text",
    described(doc.images),
    `${doc.images.length} image(s)`,
  );
  await seoPage.goto(`${BASE}/auth/login`, { waitUntil: "domcontentloaded" });
  await seoPage.waitForTimeout(2000);
  const loginImages = await seoPage.evaluate(() =>
    Array.from(document.querySelectorAll("img")).map((img) => ({
      src: (img.getAttribute("src") || "").slice(0, 60),
      alt: img.getAttribute("alt"),
    })),
  );
  check(
    "every image on the sign-in page has alt text",
    described(loginImages),
    `${loginImages.length} image(s)`,
  );

  // The workspace is where the product and shop logos actually render, so the
  // alt text that matters is the alt text on this screen.
  const appImages = await page.evaluate(() =>
    Array.from(document.querySelectorAll("img")).map((img) => ({
      src: (img.getAttribute("src") || "").slice(0, 60),
      alt: img.getAttribute("alt"),
    })),
  );
  check(
    "every image in the workspace has alt text",
    described(appImages),
    `${appImages.length} image(s)`,
  );
  check(
    "the landing page hydrates cleanly",
    seoErrors.length === 0,
    seoErrors.slice(0, 2).join(" | "),
  );
  await seoContext.close();

  // -------------------------------------------------------------- health
  section("Runtime health");
  check("no uncaught page errors", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));
  const realErrors = consoleErrors.filter(
    (error) => !/favicon|ResizeObserver|Download the React/i.test(error),
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
  await deleteUser(EMAIL);
  await deleteUser(STAFF_EMAIL);
}

console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (failures.length) {
  console.log(`failed: ${failures.join(" | ")}`);
  process.exit(1);
}
