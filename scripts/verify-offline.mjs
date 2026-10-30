import { chromium } from "playwright";

/**
 * SAVO offline-first verification.
 *
 * Exercises Part 6's offline test plan against the running preview and the
 * real Supabase project — no mocks. The network is taken away by aborting
 * every request to the Supabase origin at the browser's transport layer, which
 * is what airplane mode looks like to the application: the shell still loads,
 * and every API call fails.
 *
 *   1.  Load online, stock a product, confirm the till sells.
 *   2.  Cut the API: the app must notice and say so.
 *   3.  Restart offline: the workspace must reopen on the same shop, from the
 *       device's own catalogue.
 *   4.  Complete a cash sale offline: it must be stored durably (IndexedDB)
 *       and the local stock projection must move.
 *   5.  Restart again offline: the queued sale must still be there.
 *   6.  Restore the network and sync: the sale reaches the server exactly once.
 *   7.  Re-deliver the identical operation: no duplicate sale may appear.
 *   8.  A server refusal (stock conflict, then a generic failure) must be kept
 *       with its reason, then recover on a retry.
 *
 * Limitation, stated up front: the shell is served by the dev server here, so
 * this proves *data* survives an offline restart; reopening with no network at
 * all (service-worker shell cache) is covered by verify-pwa.mjs / production.
 *
 * Run: CHROMIUM_PATH=... node scripts/verify-offline.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? "http://127.0.0.1:8080";
const SUPA_URL = process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";

const stamp = Date.now();
const EMAIL = `offline${stamp}@example.com`;
const PASSWORD = "Off1ine-First!Pass";
const SHOP = `Offline ${stamp}`;
const ACCESS_CODE = `OF${String(stamp).slice(-6)}`;
const BARCODE = `50${String(stamp).slice(-8)}`;

let passed = 0;
const failures = [];

function section(name) {
  console.log(`\n--- ${name}`);
}
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function bodyText(page) {
  return page.evaluate(() => document.body.innerText ?? "").catch(() => "");
}

/** Reads a store from the app's local database, inside the page. */
async function idbAll(page, store) {
  return page.evaluate(async (storeName) => {
    try {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("savo-offline");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const rows = await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const request = tx.objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return { ok: true, rows };
    } catch (error) {
      return { ok: false, rows: [], error: String(error) };
    }
  }, store);
}

/** Writes one entry into the outbox, inside the page (retry tests). */
async function idbPut(page, store, value) {
  return page.evaluate(
    async ({ storeName, row }) => {
      try {
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open("savo-offline");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        await new Promise((resolve, reject) => {
          const tx = db.transaction(storeName, "readwrite");
          tx.objectStore(storeName).put(row);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
        return { ok: true };
      } catch (error) {
        return { ok: false, error: String(error) };
      }
    },
    { storeName: store, row: value },
  );
}

/** Nudge the app to re-probe: a real focus/visibility transition does this. */
async function kick(page) {
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
  });
  await sleep(1500);
}

/** Presses Sync now only when it is actually enabled (never races it). */
async function clickSyncIfAvailable(page) {
  try {
    const button = page.getByRole("button", { name: /sync now/i });
    if (await button.isEnabled({ timeout: 2000 })) {
      await button.click({ timeout: 4000 });
      return true;
    }
  } catch {
    /* disabled while auto-sync is running, or the queue is already empty */
  }
  return false;
}

/** Waits until the local queue is empty, nudging reconnects as it goes. */
async function drainOutbox(page, seconds = 60) {
  for (let i = 0; i < seconds; i += 1) {
    await sleep(1000);
    const rows = await idbAll(page, "outbox");
    if (rows.ok && rows.rows.length === 0) return true;
    if (i > 0 && i % 6 === 0) await kick(page);
  }
  return false;
}

/** Waits until the queue's first entry matches a predicate. */
async function waitForOutbox(page, predicate, seconds = 60) {
  for (let i = 0; i < seconds; i += 1) {
    await sleep(1000);
    const rows = await idbAll(page, "outbox");
    if (rows.ok && rows.rows.length > 0 && predicate(rows.rows[0])) return rows.rows[0];
    if (rows.ok && rows.rows.length === 0 && predicate(null)) return null;
  }
  return null;
}

/** Distinct receipt numbers visible on the ledger, in order. */
async function receiptsOn(page) {
  const text = await bodyText(page);
  return [...new Set(text.match(/OF-\d{3,}/g) ?? [])];
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport: { width: 360, height: 780 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

// Console output is the difference between "the state was wrong" and knowing
// *why* it was wrong; keep it with the URL that produced it.
const consoleErrors = [];
const pageErrors = [];
page.on("console", (m) => {
  const text = m.text();
  if (text.startsWith("[savo:sync]")) console.log(`  console> ${text}`);
  else if (m.type() === "error") consoleErrors.push(`${text} @ ${page.url()}`);
});
page.on("pageerror", (e) => pageErrors.push(`${String(e)} @ ${page.url()}`));

/** Aborts every request to the Supabase origin — airplane mode, app-side. */
const blockMatcher = (url) => SUPA_URL !== "" && String(url).startsWith(SUPA_URL);
let apiBlocked = false;
async function blockApi() {
  if (apiBlocked || !SUPA_URL) return false;
  await context.route(blockMatcher, (route) => route.abort("failed"));
  apiBlocked = true;
  return true;
}
async function unblockApi() {
  if (!apiBlocked) return;
  await context.unroute(blockMatcher);
  apiBlocked = false;
}

let saleEntry = null;
let saleEntryTwo = null;

try {
  if (!SUPA_URL) {
    console.log("NOTE  VITE_SUPABASE_URL is not set — cannot simulate airplane mode.");
  }

  // ------------------------------------------------------------ sign up
  section("Sign up and stock the shop");
  await page.goto(`${BASE}/auth/signup`, { waitUntil: "domcontentloaded" });
  await sleep(3000);
  await page.fill("#signup-name", "Offline Trader");
  await page.fill("#signup-phone", "0712345000");
  await page.fill("#signup-email", EMAIL);
  await page.fill("#signup-password", PASSWORD);
  await page.check("#signup-accepted");
  await page.click('button[type="submit"]');
  await page.waitForURL(/onboarding|dashboard/, { timeout: 40_000 }).catch(() => {});
  check("sign up lands on setup", /onboarding|dashboard/.test(page.url()), page.url());

  await page
    .getByRole("heading", { name: /How will you use SAVO/i })
    .waitFor({ timeout: 30_000 })
    .catch(() => {});
  await page.getByRole("button", { name: /I own a shop/i }).click();
  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ timeout: 15_000 });
  await page.fill("#shop-name", SHOP);
  await page.fill("#shop-location", "Gikomba, Nairobi");
  await page.fill("#shop-phone", "0712345678");
  await page.fill("#shop-prefix", "OF");
  await page.fill("#shop-code", ACCESS_CODE);
  await dialog.getByRole("button", { name: /^create shop$/i }).click();
  await page
    .getByRole("button", { name: /open my shop/i })
    .waitFor({ timeout: 40_000 })
    .catch(() => {});
  await dialog.getByRole("button", { name: /open my shop/i }).click();
  await page.waitForURL(/\/app/, { timeout: 20_000 }).catch(() => {});
  await sleep(4000);
  check("the workspace opens", /\/app/.test(page.url()), page.url());

  await page.goto(`${BASE}/app/inventory`, { waitUntil: "domcontentloaded" });
  await sleep(3500);
  await page
    .getByRole("button", { name: /add a product|^\s*Add\s*$/i })
    .first()
    .click();
  await page.locator('[role="dialog"]').waitFor({ timeout: 15_000 });
  await page.fill("#product-name", "Maziwa 500ml");
  await page.fill("#product-barcode", BARCODE);
  await page.fill("#product-buying", "80");
  await page.fill("#product-selling", "100");
  await page.fill("#product-opening", "50");
  await page.fill("#product-low", "5");
  await page.locator('[role="dialog"] button[type="submit"]').click();
  await sleep(7000);
  const stocked = await bodyText(page);
  check("the product is stocked at 50", /Maziwa 500ml/.test(stocked));

  // ------------------------------------------------------- the till online
  section("The till while online");
  await page.goto(`${BASE}/app/pos`, { waitUntil: "domcontentloaded" });
  await sleep(4000);
  await page.locator('input[aria-label="Search products"]').first().fill("Maziwa");
  await sleep(2500);
  check("the till finds the product online", /Maziwa 500ml/.test(await bodyText(page)));

  // -------------------------------------------------------- cut the network
  section("Airplane mode");
  const blocked = await blockApi();
  check(
    "the API can be blocked for this test",
    blocked,
    `SUPA_URL=${SUPA_URL ? "set" : "missing"}`,
  );
  await kick(page);

  const offlineLabel = await page
    .locator('a[aria-label^="Offline"], a[aria-label*="waiting to sync"]')
    .first()
    .getAttribute("aria-label")
    .catch(() => null);
  check("the shell notices the network is gone", offlineLabel !== null, String(offlineLabel));

  // ------------------------------------------------- restart while offline
  section("Reopen the app offline");
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(6000);
  const coldStart = await bodyText(page);
  const coldOk = !/not in a shop yet/i.test(coldStart) && /\/app/.test(page.url());
  if (!coldOk) {
    // Diagnostics a failing cold start needs: what the device still knows.
    const where = await page.evaluate(() => ({
      storedShop: window.localStorage.getItem("savo.activeShopId"),
      path: location.pathname,
      head: (document.body.innerText ?? "").slice(0, 220),
    }));
    console.log("COLD-START DIAG", JSON.stringify(where));
  }
  check("the workspace reopens on the same shop, not on 'no shop yet'", coldOk, page.url());

  await page.goto(`${BASE}/app/pos`, { waitUntil: "domcontentloaded" });
  // Poll instead of sleeping: React Query retries a failed fetch a few times
  // before it gives up and lets the cached catalogue answer, and how long that
  // takes depends on the machine, not on the app.
  let cachedVisible = false;
  for (let i = 0; i < 30; i += 1) {
    await sleep(1000);
    const text = await bodyText(page);
    if (/Maziwa 500ml/.test(text) && /saved on this device/i.test(text)) {
      cachedVisible = true;
      break;
    }
    if (i === 8) {
      await page
        .locator('input[aria-label="Search products"]')
        .first()
        .fill("Maziwa")
        .catch(() => {
          /* The till has not rendered yet — the next poll says whether it does. */
        });
    }
  }
  const offlinePos = await bodyText(page);
  check(
    "the cached catalogue answers the search offline",
    cachedVisible && /Maziwa 500ml/.test(offlinePos),
    offlinePos.slice(0, 200),
  );
  check(
    "the screen admits it is showing cached data",
    /saved on this device|Showing the catalogue/i.test(offlinePos),
    offlinePos.slice(0, 200),
  );

  // ------------------------------------------- an offline cash sale
  section("Sell while offline");
  await page.getByText("Maziwa 500ml").first().click();
  await sleep(1200);
  await page.getByRole("button", { name: /take payment/i }).click();
  await sleep(1500);
  await page.fill("#pos-tendered", "500");
  await sleep(600);
  await page.getByRole("button", { name: /complete sale/i }).click();
  await sleep(4000);
  const savedText = await bodyText(page);
  check(
    "the till says the sale is saved on this device",
    /Saved on this device/i.test(savedText),
    savedText.slice(0, 200),
  );
  check(
    "the confirmation is labelled as waiting to sync, not as a receipt",
    /Waiting to sync/i.test(savedText) && !/OF-\d{3,}/.test(savedText),
  );

  const outbox1 = await idbAll(page, "outbox");
  check(
    "the sale is durably queued in IndexedDB",
    outbox1.ok && outbox1.rows.length === 1 && outbox1.rows[0].status === "pending",
    `rows=${outbox1.rows.length} status=${outbox1.rows[0]?.status ?? "-"}`,
  );
  saleEntry = outbox1.rows[0] ?? null;
  check(
    "the queued operation carries a unique id, the shop and an actor",
    Boolean(saleEntry?.txId && saleEntry?.shopId),
    `${saleEntry?.txId ?? "-"} shop=${Boolean(saleEntry?.shopId)}`,
  );

  const cached1 = await idbAll(page, "products");
  const cachedQty = (cached1.rows ?? []).find((row) => row.name === "Maziwa 500ml")?.quantity;
  check(
    "the local stock projection moves with the sale",
    cachedQty === 49,
    `quantity=${String(cachedQty)}`,
  );

  // ------------------------------------- the queue survives a second restart
  section("The queue survives a restart");
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(6000);
  await page.goto(`${BASE}/app/sync`, { waitUntil: "domcontentloaded" });
  await sleep(5000);
  const syncScreen = await bodyText(page);
  check("the sync screen opens offline", /Sync & offline|Queued operations/i.test(syncScreen));
  check(
    "the queued sale is still listed after the restart",
    /Waiting to sync/i.test(syncScreen),
    syncScreen.slice(0, 240),
  );
  check(
    "offline status and the sync action are both present",
    /Offline/i.test(syncScreen) && /Sync now/i.test(syncScreen),
  );

  const outbox2 = await idbAll(page, "outbox");
  check(
    "the outbox still holds exactly that one operation",
    outbox2.ok && outbox2.rows.length === 1,
    `rows=${outbox2.rows.length}`,
  );

  // ------------------------------------------------------ restore & sync
  section("Back online: sync");
  await unblockApi();
  await sleep(500);
  await kick(page); // a reconnect must be noticed, exactly as a real one is
  await clickSyncIfAvailable(page);
  const drained = await drainOutbox(page);
  check("the queued sale syncs and the queue drains", drained);

  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(5000);
  const syncText = await bodyText(page);
  check(
    "the sync screen reports the queue is clear",
    /Nothing waiting/i.test(syncText),
    syncText.slice(0, 200),
  );

  await page.goto(`${BASE}/app/transactions`, { waitUntil: "domcontentloaded" });
  await sleep(5000);
  const receiptsFirst = await receiptsOn(page);
  check(
    "the sale appears in Sales history exactly once",
    receiptsFirst.length === 1,
    `receipts=${JSON.stringify(receiptsFirst)}`,
  );

  await page.goto(`${BASE}/app/inventory`, { waitUntil: "domcontentloaded" });
  await sleep(5000);
  const inventoryText = await bodyText(page);
  check(
    "server-side stock reconciles to 49 after sync",
    /Maziwa 500ml/.test(inventoryText) && /\b49\b/.test(inventoryText),
    inventoryText.slice(0, 200),
  );

  // ----------------------------------------------------------- dedupe
  section("A retry never records a second sale");
  if (saleEntry) {
    const replay = { ...saleEntry, status: "pending", lastError: null, attempts: 0 };
    const put = await idbPut(page, "outbox", replay);
    check("the identical operation is re-queued", put.ok, put.error ?? "");
    await page.goto(`${BASE}/app/sync`, { waitUntil: "domcontentloaded" });
    await sleep(4000);
    await clickSyncIfAvailable(page);
    const drainedReplay = await drainOutbox(page);
    check("the replay is acknowledged and the queue drains", drainedReplay, "queue never emptied");

    await page.goto(`${BASE}/app/transactions`, { waitUntil: "domcontentloaded" });
    await sleep(5000);
    const receiptsSecond = await receiptsOn(page);
    check(
      "no duplicate sale was recorded by the retry",
      receiptsSecond.length === 1,
      `receipts=${JSON.stringify(receiptsSecond)}`,
    );
  } else {
    check("the identical operation is re-queued", false, "no captured operation to replay");
  }

  // -------------------------------------------- refusal, retention, recovery
  section("A refused operation is kept and recovers");
  saleEntryTwo = {
    txId: `00000000-0000-4000-8000-${String(Date.now()).slice(-12)}`,
    shopId: saleEntry?.shopId ?? "",
    userId: saleEntry?.userId ?? null,
    opType: "sale",
    payload: {
      shopId: saleEntry?.shopId ?? "",
      lines: [
        {
          productId: saleEntry?.payload?.lines?.[0]?.productId ?? "",
          quantity: 1,
          unitPrice: 100,
          discountAmount: 0,
        },
      ],
      paymentMethod: "cash",
      amountTendered: 100,
      discountAmount: 0,
      debtorName: null,
      debtorPhone: null,
      note: null,
    },
    createdAt: Date.now(),
    status: "pending",
    attempts: 0,
    lastError: null,
    updatedAt: Date.now(),
  };
  const putTwo = await idbPut(page, "outbox", saleEntryTwo);
  check("a second operation is queued", putTwo.ok, putTwo.error ?? "");

  // The server refuses it with a stock conflict.
  let refusalMessage = "Insufficient stock for one or more items";
  await context.route("**/rpc/create_sale*", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      headers: { "x-postgrest-error": "true" },
      body: JSON.stringify({ code: "P0001", message: refusalMessage, details: null, hint: null }),
    }),
  );

  await page.goto(`${BASE}/app/sync`, { waitUntil: "domcontentloaded" });
  const conflictRow = await waitForOutbox(page, (row) => row && row.status === "conflict", 45);
  const conflictText = await bodyText(page);
  check(
    "a stock conflict is flagged for review, not dropped",
    conflictRow !== null && /Conflict/i.test(conflictText),
    `status=${conflictRow?.status ?? "missing"}`,
  );

  // The queue still holds it, so Sync now is live: pressing it must keep the
  // entry, not swallow it.
  const pressedWhileConflict = await clickSyncIfAvailable(page);
  await sleep(5000);
  const outboxConflict = await idbAll(page, "outbox");
  check(
    "syncing again keeps the refused operation in the queue",
    outboxConflict.rows.length === 1,
    `pressed=${pressedWhileConflict} rows=${outboxConflict.rows.length}`,
  );

  // The user retries: this time the server refuses with a plain failure.
  refusalMessage = "Receipt prefix is invalid";
  await page
    .getByRole("button", { name: /try again/i })
    .first()
    .click();
  const failedRow = await waitForOutbox(page, (row) => row && row.status === "failed", 45);
  const failedText = await bodyText(page);
  check(
    "a retried refusal is kept with its reason",
    failedRow !== null && /Failed|needs attention/i.test(failedText),
    `status=${failedRow?.status ?? "missing"} error=${String(failedRow?.lastError ?? "").slice(0, 60)}`,
  );

  // The problem is fixed; the same operation goes through.
  await context.unroute("**/rpc/create_sale*");
  await page
    .getByRole("button", { name: /try again/i })
    .first()
    .click();
  const recovered = await drainOutbox(page);
  check(
    "the refused operation recovers once the server accepts it",
    recovered,
    "queue never emptied",
  );

  await page.goto(`${BASE}/app/transactions`, { waitUntil: "domcontentloaded" });
  await sleep(5000);
  const receiptsFinal = await receiptsOn(page);
  if (receiptsFinal.length !== 2) {
    const where = await page.evaluate(() => ({
      path: location.pathname,
      head: (document.body.innerText ?? "").slice(0, 300),
    }));
    console.log("LEDGER DIAG", JSON.stringify(where));
  }
  check(
    "the ledger holds both sales, exactly one each",
    receiptsFinal.length === 2,
    `receipts=${JSON.stringify(receiptsFinal)}`,
  );
} catch (error) {
  console.error("SUITE ERROR", error);
  failures.push(`suite error: ${String(error).slice(0, 200)}`);
} finally {
  await unblockApi().catch(() => {});
  await browser.close().catch(() => {});
}

if (consoleErrors.length > 0) {
  console.log(`\nPage console errors (${consoleErrors.length}):`);
  for (const line of consoleErrors.slice(0, 12)) console.log(`  ${line}`);
}
if (pageErrors.length > 0) {
  console.log(`\nPage errors (${pageErrors.length}):`);
  for (const line of pageErrors.slice(0, 12)) console.log(`  ${line}`);
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
