#!/usr/bin/env node
/**
 * Mobile QA sweep (readiness Part 23).
 *
 * Drives the real app in Chromium at small (360), medium (412) and tablet
 * widths, and asserts on every app route:
 *
 *   - no horizontal overflow at the document level
 *   - no visible element pokes past the viewport unless it sits inside a
 *     deliberate scroll container
 *   - the floating nav is fully inside the viewport (never clipped)
 *   - tabs respond to touch (tap -> aria-current) and the More sheet opens
 *     and closes without overflowing
 *
 * plus one landscape pass. A throwaway owner account and shop are created for
 * the run and removed at the end (account via the management API, shop via
 * scripts/cleanup-test-shops.mjs, whose "Duka%" pattern matches it).
 *
 * Credentials for cleanup come from /tmp/qa-env.json, written by
 * scripts/qa-env.mjs from the workspace environment. Without it the run still
 * works; only the account deletion is skipped.
 *
 * Run from /tmp/pwtest (which has playwright installed):
 *   bun /tmp/pwtest/verify-mobile-qa.mjs [baseUrl]
 */

import { chromium } from "playwright";
import { existsSync, readFileSync } from "node:fs";

const BASE = (process.argv[2] || "http://127.0.0.1:4173").replace(/\/$/, "");

let ACCESS_TOKEN = null;
let URL_BASE = null;
try {
  const qa = JSON.parse(readFileSync("/tmp/qa-env.json", "utf8"));
  ACCESS_TOKEN = qa.access;
  URL_BASE = qa.url;
} catch {
  console.log("note: /tmp/qa-env.json missing — throwaway account deletion will be skipped");
}

const stamp = Date.now();
const EMAIL = `savo-mq-${stamp}@example.com`;
const PASSWORD = `Mq-${stamp}-savo`;
const SHOP = `Duka QA ${stamp}`;
const ACCESS_CODE = String(100000 + (stamp % 900000));

const ROUTES = [
  "/app/overview",
  "/app/pos",
  "/app/inventory",
  "/app/expenses",
  "/app/debtors",
  "/app/transactions",
  "/app/restock",
  "/app/stock",
  "/app/reports",
  "/app/employees",
  "/app/settings",
];

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

/**
 * "Does this screen fit?" — document-level overflow, then every visible
 * element against the viewport, allowing anything clipped by a real scroll
 * container (long product names are *meant* to scroll inside their box).
 */
async function overflowVerdict(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    if (de.scrollWidth > de.clientWidth + 1) {
      return `document ${de.scrollWidth}px > ${de.clientWidth}px`;
    }
    const vw = de.clientWidth;
    // An element may hang off the right edge only if it lives inside a
    // horizontal scroll container (an edge-to-edge chip rail is meant to be
    // swiped) whose own box still fits the viewport. Anything else poking out
    // is unreachable content.
    const inScrollContainer = (el) => {
      for (let a = el.parentElement; a; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (["auto", "scroll", "hidden", "clip"].includes(cs.overflowX)) {
          const ar = a.getBoundingClientRect();
          if (ar.left >= -1 && ar.right <= vw + 1) return true;
        }
      }
      return false;
    };
    const bad = [];
    document.querySelectorAll("body *").forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return;
      if (cs.position === "fixed") return;
      // Visually-hidden but present controls (e.g. a switch's native checkbox
      // bubble) are clipped on purpose; they are not layout overflow.
      if (el.closest('[aria-hidden="true"]')) return;
      if (cs.clipPath !== "none" || cs.opacity === "0") return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > vw + 1 || r.left < -1) && !inScrollContainer(el)) {
        const id = el.id ? `#${el.id}` : "";
        bad.push(
          `${el.tagName.toLowerCase()}${id}.${String(el.className).slice(0, 30)} right=${Math.round(r.right)} left=${Math.round(r.left)}`,
        );
      }
    });
    return bad.length ? bad.slice(0, 3).join(" | ") : "ok";
  });
}

/** The floating nav slab's box, so it can be checked against the viewport. */
async function navBox(page) {
  /*
   * Wait for the shell rather than reading it on a fixed clock. A full page
   * load re-runs the session gate, and for a moment the document is on the way
   * back from the sign-in redirect — reading the box at that instant returns
   * "nav not found" and blames a viewport for a race. The timeout is long and
   * the failure is unchanged: if the nav genuinely never renders, this still
   * returns null and the check still fails.
   */
  await page.waitForSelector('nav[aria-label="Main"]', { timeout: 15000 }).catch(() => {});
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Main"]');
    if (!nav) return null;
    const inner = nav.querySelector("div") ?? nav;
    const r = inner.getBoundingClientRect();
    return {
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      left: Math.round(r.left),
      right: Math.round(r.right),
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  });
}

async function sweep(page, label, routes) {
  for (const route of routes) {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1400);
    const verdict = await overflowVerdict(page);
    check(`${route} fits at ${label}`, verdict === "ok", verdict);
  }
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
});
const context = await browser.newContext({
  viewport: { width: 360, height: 740 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

try {
  // ------------------------------------------------------------- set up shop
  await page.goto(`${BASE}/auth/signup`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.fill("#signup-name", "QA Trader");
  await page.fill("#signup-phone", "0723000000");
  await page.fill("#signup-email", EMAIL);
  await page.fill("#signup-password", PASSWORD);
  await page.check("#signup-accepted");
  await page.click('button[type="submit"]');
  await page.waitForURL(/onboarding|dashboard/, { timeout: 40_000 }).catch(() => {});
  await page
    .getByRole("heading", { name: /How will you use SAVO/i })
    .waitFor({ timeout: 30_000 })
    .catch(() => {});
  await page.getByRole("button", { name: /I own a shop/i }).click();
  await page.waitForTimeout(1500);
  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ timeout: 15_000 });
  await page.fill("#shop-name", SHOP);
  await page.fill("#shop-location", "Nairobi");
  await page.fill("#shop-phone", "0723000001");
  await page.fill("#shop-footer", "Karibu!");
  await page.fill("#shop-prefix", "MQ");
  await page.fill("#shop-code", ACCESS_CODE);
  await dialog.getByRole("button", { name: /^create shop$/i }).click();
  await page
    .getByRole("button", { name: /open my shop/i })
    .waitFor({ timeout: 40_000 })
    .catch(() => {});
  await page.waitForTimeout(1500);
  await dialog.getByRole("button", { name: /open my shop/i }).click();
  await page.waitForTimeout(3000);
  check("shop created and app opened at 360px", /\/app/.test(page.url()), page.url());

  // --------------------------------------------------- small phone, all routes
  await sweep(page, "360px", ROUTES);

  // ------------------------------------------- nav geometry and touch at 360px
  let nav = await navBox(page);
  check(
    "floating nav sits fully inside the 360px viewport",
    nav !== null &&
      nav.bottom <= nav.vh + 1 &&
      nav.right <= nav.vw + 1 &&
      nav.left >= -1 &&
      nav.top >= -1,
    nav ? `bottom ${nav.bottom}/${nav.vh}, right ${nav.right}/${nav.vw}` : "nav not found",
  );

  const posTab = page.locator('nav[aria-label="Main"] a', { hasText: "POS" }).first();
  await posTab.click();
  await page.waitForTimeout(1200);
  check("tapping POS selects it", (await posTab.getAttribute("aria-current")) === "page");

  const expensesTab = page.locator('nav[aria-label="Main"] a', { hasText: "Expenses" }).first();
  await expensesTab.click();
  await page.waitForTimeout(1200);
  check("tapping Expenses selects it", (await expensesTab.getAttribute("aria-current")) === "page");

  const moreBtn = page.locator('nav[aria-label="Main"] button', { hasText: /more/i }).first();
  await moreBtn.click();
  await page.waitForTimeout(900);
  const moreState = await page.evaluate(() => {
    const de = document.documentElement;
    const drawer = document.querySelector('[data-vaul-drawer-direction], [role="dialog"]');
    return {
      overflow: de.scrollWidth > de.clientWidth + 1 ? "overflow" : "ok",
      drawerOpen: Boolean(drawer),
    };
  });
  check(
    "More sheet opens without horizontal overflow",
    moreState.drawerOpen && moreState.overflow === "ok",
    JSON.stringify(moreState),
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);

  // -------------------------------------------- medium phone: the heavy routes
  await page.setViewportSize({ width: 412, height: 915 });
  await sweep(page, "412px", ["/app/overview", "/app/pos", "/app/transactions"]);

  // -------------------------------------------------------- tablet + landscape
  await page.setViewportSize({ width: 768, height: 1024 });
  await sweep(page, "768px", ["/app/overview", "/app/pos", "/app/transactions", "/app/settings"]);
  nav = await navBox(page);
  check(
    "floating nav sits fully inside the 768px viewport",
    nav !== null &&
      nav.bottom <= nav.vh + 1 &&
      nav.right <= nav.vw + 1 &&
      nav.left >= -1 &&
      nav.top >= -1,
    nav ? `bottom ${nav.bottom}/${nav.vh}, right ${nav.right}/${nav.vw}` : "nav not found",
  );

  await page.setViewportSize({ width: 740, height: 360 });
  await page.goto(`${BASE}/app/overview`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1400);
  const landscape = await overflowVerdict(page);
  check("landscape overview fits without horizontal overflow", landscape === "ok", landscape);

  check("no page errors during the sweep", errors.length === 0, errors.slice(0, 2).join(" ; "));
} finally {
  await browser.close();
  await deleteUser(EMAIL);
}

console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
