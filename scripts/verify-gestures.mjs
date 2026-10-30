import { chromium } from "playwright";

/**
 * The navigation gestures, end to end on a real touch device profile.
 *
 * What it proves, in the order the spec lists it:
 *
 *   1. A tap on a tab opens that destination.
 *   2. Press, hold, slide, release opens the *highlighted* tab — and the
 *      highlight is visible while the finger is down.
 *   3. Releasing on the destination already open changes nothing.
 *   4. A horizontal drag across the content area moves to the adjacent
 *      destination; a vertical drag scrolls the page instead.
 *   5. Gestures inside a sheet (dialog) do not navigate.
 *   6. A hold that drifts clear of the bar cancels: no highlight, no jump.
 *
 * Every gesture is driven with real CDP touch input — not synthetic mouse
 * events — because `touch-action`, pointercancel and native scrolling are the
 * whole point of the behaviour under test.
 *
 * Usage: CHROMIUM_PATH=... bun scripts/verify-gestures.mjs [baseUrl]
 */

const BASE = process.argv[2] ?? "http://127.0.0.1:8080";
const stamp = Date.now();
const EMAIL = `gesture${stamp}@example.com`;
const PASSWORD = "Sup3rSecret!23";
const SHOP = `Gesture ${stamp}`;

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
}

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

/** Dispatches a real touch sequence: start, N moves, end. */
async function touch(points, type) {
  await cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: points.map(({ x, y }) => ({ x, y })),
  });
}

async function touchDrag(from, to, steps = 8, holdMs = 0) {
  await touch([from], "touchStart");
  if (holdMs > 0) await page.waitForTimeout(holdMs);
  for (let i = 1; i <= steps; i += 1) {
    await touch(
      [
        {
          x: from.x + ((to.x - from.x) * i) / steps,
          y: from.y + ((to.y - from.y) * i) / steps,
        },
      ],
      "touchMove",
    );
    await page.waitForTimeout(16);
  }
  await touch([], "touchEnd");
}

/** Centre point of a dock slot by its label. */
async function slotPoint(label) {
  const slot = page.locator(`nav[aria-label="Main"] [data-nav-slot]`, { hasText: label }).first();
  const box = await slot.boundingBox();
  if (!box) return null;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function path() {
  return new URL(page.url()).pathname;
}

try {
  /* ------------------------------------------------------------ sign up */

  await page.goto(`${BASE}/auth/signup`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.fill("#signup-name", "Gesture Trader");
  await page.fill("#signup-phone", "0712000011");
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
  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ timeout: 15_000 });
  await page.fill("#shop-name", SHOP);
  await dialog.getByRole("button", { name: /^create shop$/i }).click();
  await page.getByRole("button", { name: /open my shop/i }).waitFor({ timeout: 40_000 });
  await dialog.getByRole("button", { name: /open my shop/i }).click();
  await page.waitForURL(/\/app/, { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(4000);

  const bar = page.locator('nav[aria-label="Main"] .glass-bar').first();
  await bar.waitFor({ timeout: 20_000 });
  check("dock is present", (await bar.count()) > 0);

  /* ------------------------------------------------------- 1. normal tap */

  const inventory = await slotPoint("Inventory");
  check("Inventory slot found", Boolean(inventory));
  if (inventory) {
    await touch([inventory], "touchStart");
    await page.waitForTimeout(40);
    await touch([], "touchEnd");
    await page.waitForTimeout(700);
    check("tap opens Inventory", (await path()).endsWith("/app/inventory"), await path());
  }

  const dashboard = await slotPoint("Dashboard");
  check("Dashboard slot found", Boolean(dashboard));
  if (dashboard) {
    await touch([dashboard], "touchStart");
    await page.waitForTimeout(40);
    await touch([], "touchEnd");
    await page.waitForTimeout(700);
    check("tap opens Dashboard", (await path()).endsWith("/app/overview"), await path());
  }

  /* ---------------------------------- 2. press, hold, slide, release */

  const start = await slotPoint("Dashboard");
  const end = await slotPoint("Expenses");
  if (start && end) {
    // One continuous touch: down, hold still until the gesture arms, slide.
    await touch([start], "touchStart");
    await page.waitForTimeout(420); // past HOLD_MS: the gesture arms
    const armed = await page.locator("[data-nav-gesture]").count();
    check("hold arms the gesture highlight", armed > 0, `${armed} highlight(s)`);

    for (let i = 1; i <= 6; i += 1) {
      await touch(
        [
          {
            x: start.x + ((end.x - start.x) * i) / 6,
            y: start.y + ((end.y - start.y) * i) / 6,
          },
        ],
        "touchMove",
      );
      await page.waitForTimeout(30);
    }
    const highlighted = await page.locator("[data-nav-gesture]").count();
    check("slide keeps a highlight under the finger", highlighted > 0);
    await touch([], "touchEnd");
    await page.waitForTimeout(800);
    check(
      "release opens the highlighted tab",
      (await path()).endsWith("/app/expenses"),
      await path(),
    );
  }

  /* ---------------------- 3. release on the tab already open: no jump */

  if (start && end) {
    const expenses = await slotPoint("Expenses");
    if (expenses) {
      await touchDrag(expenses, expenses, 4, 420);
      await page.waitForTimeout(600);
      check(
        "releasing on the current tab stays put",
        (await path()).endsWith("/app/expenses"),
        await path(),
      );
    }
  }

  /* ------------------ 4. content swipe forward, then vertical scroll */

  // Start from the first tab so there is a "next" destination to swipe into.
  if (dashboard) {
    await touch([dashboard], "touchStart");
    await page.waitForTimeout(40);
    await touch([], "touchEnd");
    await page.waitForTimeout(700);
  }
  const before = await path();
  // Why might this gesture be ignored? Report the stack under the start point
  // when the swipe does not navigate, so a failure is diagnosable from the log.
  const stack = await page.evaluate(() => {
    const out = [];
    let node = document.elementFromPoint(330, 520);
    const boundary = document.getElementById("main");
    let depth = 0;
    while (node && node !== boundary && depth < 12) {
      const style = getComputedStyle(node);
      out.push(
        `${node.tagName.toLowerCase()}.${(node.className || "").toString().slice(0, 40)} ox=${style.overflowX}`,
      );
      node = node.parentElement;
      depth += 1;
    }
    return out;
  });
  await touch([{ x: 330, y: 520 }], "touchStart");
  await page.waitForTimeout(30);
  for (let i = 1; i <= 8; i += 1) {
    await touch([{ x: 330 - i * 22.5, y: 520 }], "touchMove");
    await page.waitForTimeout(16);
  }
  const midState = await page.locator("#main > div").first().getAttribute("data-swipe-state");
  const midPull = await page
    .locator("#main > div")
    .first()
    .evaluate((el) => el.style.transform);
  await touch([], "touchEnd");
  await page.waitForTimeout(900);
  const after = await path();
  check("content swipe moves to the next destination", before !== after, `${before} → ${after}`);
  if (before === after) {
    console.log(`  at (330,520): ${stack.join(" | ")}`);
    console.log(`  mid-gesture state=${midState} transform=${midPull}`);
  }

  // The scroll test needs a page that actually overflows: an empty shop's
  // inventory screen fits in one viewport, so go back to the overview first.
  if (dashboard) {
    await touch([dashboard], "touchStart");
    await page.waitForTimeout(40);
    await touch([], "touchEnd");
    await page.waitForTimeout(800);
  }
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await touch([{ x: 330, y: 760 }], "touchStart");
  for (let i = 1; i <= 10; i += 1) {
    await touch([{ x: 330, y: 760 - i * 38 }], "touchMove");
    await page.waitForTimeout(24);
  }
  const midScroll = await page.evaluate(() => ({
    y: window.scrollY,
    state: document.querySelector("#main > div")?.getAttribute("data-swipe-state"),
    at: (() => {
      const stack = [];
      let node = document.elementFromPoint(330, 760);
      let depth = 0;
      while (node && depth < 8) {
        stack.push(`${node.tagName.toLowerCase()}:${getComputedStyle(node).touchAction}`);
        node = node.parentElement;
        depth += 1;
      }
      return stack.join(" | ");
    })(),
  }));
  await touch([], "touchEnd");
  await page.waitForTimeout(600);
  const scrollAfter = await page.evaluate(() => window.scrollY);
  const pathAfterScroll = await path();
  check(
    "vertical drag scrolls instead of navigating",
    scrollAfter !== scrollBefore,
    `scrollY ${scrollBefore} → ${scrollAfter}`,
  );
  if (scrollAfter === scrollBefore) console.log(`  mid-drag: ${JSON.stringify(midScroll)}`);
  check(
    "vertical drag left the route alone",
    pathAfterScroll.endsWith("/app/overview"),
    pathAfterScroll,
  );

  /* --------------------------- 5. gestures inside a sheet do nothing */

  const more = page.locator('nav[aria-label="Main"] [data-nav-slot]').last();
  await more.click();
  await page.waitForTimeout(700);
  const sheet = page.locator('[role="dialog"]');
  const sheetOpen = (await sheet.count()) > 0;
  check("More sheet opens", sheetOpen);
  if (sheetOpen) {
    const sheetBox = await sheet.boundingBox();
    if (sheetBox) {
      const y = sheetBox.y + sheetBox.height / 2;
      const pathBeforeSheet = await path();
      await touchDrag({ x: 340, y }, { x: 80, y }, 8);
      await page.waitForTimeout(700);
      check(
        "swipe inside the sheet does not navigate",
        (await path()) === pathBeforeSheet,
        await path(),
      );
      check("sheet survives the swipe", (await page.locator('[role="dialog"]').count()) > 0);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
    }
  }

  /* ----------------- 6. a hold that drifts clear of the bar cancels */

  const dash2 = await slotPoint("Dashboard");
  if (dash2) {
    const pathBeforeCancel = await path();
    await touch([dash2], "touchStart");
    await page.waitForTimeout(420);
    // Drag straight down, well past the bar's tolerance.
    for (let i = 1; i <= 6; i += 1) {
      await touch([{ x: dash2.x, y: dash2.y + i * 40 }], "touchMove");
      await page.waitForTimeout(20);
    }
    const cancelled = await page.locator("[data-nav-gesture]").count();
    check("drifting off the bar cancels the highlight", cancelled === 0);
    await touch([], "touchEnd");
    await page.waitForTimeout(700);
    const pathAfterCancel = await path();
    check(
      "a cancelled gesture does not navigate",
      pathAfterCancel === pathBeforeCancel,
      pathAfterCancel,
    );
  }
} catch (error) {
  failures.push("unexpected error");
  console.log(`FAIL  unexpected error — ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await browser.close();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log(`Failures: ${failures.join(", ")}`);
  process.exit(1);
}
