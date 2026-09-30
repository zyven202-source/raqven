import { chromium } from "playwright";

/**
 * Focused check on the two claims about the floating bar that are easy to get
 * wrong and easy to assert without measuring:
 *
 *   1. It floats above the content.
 *   2. It never covers the last row of a screen.
 *
 * Everything else about it (role-based tabs, the More sheet, the desktop rail)
 * is covered by verify-ui-acceptance.mjs.
 */

const BASE = process.argv[2] ?? "https://ravqen.freebuff.app";
const stamp = Date.now();
const EMAIL = `float${stamp}@example.com`;
const PASSWORD = "Sup3rSecret!23";
const SHOP = `Float ${stamp}`;

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

// A Pixel-class phone, which is the case that matters: gesture bar inset,
// touch targets, and a short viewport that forces scrolling.
const context = await browser.newContext({
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

try {
  await page.goto(`${BASE}/auth/signup`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.fill("#signup-name", "Float Trader");
  await page.fill("#signup-phone", "0712000009");
  await page.fill("#signup-email", EMAIL);
  await page.fill("#signup-password", PASSWORD);
  await page.check("#signup-accepted");
  await page.click('button[type="submit"]');
  await page.waitForURL(/onboarding|dashboard/, { timeout: 40_000 }).catch(() => {});

  await page
    .getByRole("heading", { name: /How will you use RAVQEN/i })
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
  await page.waitForTimeout(5000);

  const bar = page.locator('nav[aria-label="Main"] .glass-bar').first();
  await bar.waitFor({ timeout: 20_000 });
  const box = await bar.boundingBox();
  const viewport = page.viewportSize();
  const style = await bar.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      blur: s.backdropFilter,
      bg: s.backgroundColor,
      border: s.borderTopWidth,
      borderColor: s.borderTopColor,
      shadow: s.boxShadow,
      radius: s.borderRadius,
    };
  });

  console.log("bar:", JSON.stringify(box), "\nstyle:", JSON.stringify(style), "\n");

  // --- the aesthetic, measured rather than eyeballed
  check("the bar is translucent", /rgba?\(|oklch|color\(/.test(style.bg), style.bg);
  check("the bar is blurred", style.blur !== "none" && style.blur !== "", style.blur);
  check("the bar has a soft border", parseFloat(style.border) >= 1, style.border);
  check("the bar has depth", style.shadow !== "none" && style.shadow.length > 10);
  check(
    "the bar is a pill, not a square-cornered bar",
    parseFloat(style.radius) >= 16,
    style.radius,
  );

  // --- it floats: pinned to the bottom, above the content, not in the flow
  const position = await page
    .locator('nav[aria-label="Main"]')
    .first()
    .evaluate((el) => getComputedStyle(el).position);
  check("the bar is fixed to the viewport", position === "fixed", position);
  check(
    "the bar sits above the fold",
    box.y > 100 && box.y + box.height <= viewport.height + 1,
    `y=${Math.round(box.y)} h=${Math.round(box.height)} vh=${viewport.height}`,
  );
  check(
    "the bar is z-raised over the content",
    await (async () => {
      const nav = await page
        .locator('nav[aria-label="Main"]')
        .first()
        .evaluate((el) => ({
          z: getComputedStyle(el).zIndex,
        }));
      return Number(nav.z) >= 40;
    })(),
  );

  // --- safe area: the phone's gesture bar must not sit under the pill.
  // A headless browser reports `env(safe-area-inset-bottom)` as 0px, so the
  // computed value cannot prove the rule exists. Read the *declared* value off
  // the inline class list instead, which is what ships.
  const navClass = await page.locator('nav[aria-label="Main"]').first().getAttribute("class");
  check(
    "the bar reserves the gesture-bar inset",
    /safe-area-inset-bottom/.test(navClass ?? ""),
    (navClass ?? "").match(/[^ ]*safe-area[^ ]*/)?.[0] ?? "not declared",
  );
  const containerClass = await page
    .locator('nav[aria-label="Main"] .glass-bar')
    .first()
    .getAttribute("class");
  check(
    "the bar's height is a shared token, not a guess",
    /--glass-bar-height/.test(containerClass ?? ""),
    (containerClass ?? "").match(/[^ ]*glass-bar-height[^ ]*/)?.[0] ?? "not declared",
  );
  check(
    "the bar clears the bottom edge of the screen",
    box.y + box.height <= viewport.height,
    `${Math.round(box.y + box.height)} <= ${viewport.height}`,
  );

  // --- and the claim that matters: it must not cover the last row.
  // Walk every real screen, scroll to the very bottom, and compare the lowest
  // piece of content against the top of the bar.
  const screens = [
    ["/app/pos", "the till"],
    ["/app/inventory", "inventory"],
    ["/app/expenses", "expenses"],
    ["/app/overview", "the dashboard"],
  ];

  for (const [path, name] of screens) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    // Scroll to the very end so the last row is against the bottom.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1200);

    const clearance = await page.evaluate(() => {
      const bar = document.querySelector('nav[aria-label="Main"] .glass-bar');
      if (!bar) return null;
      const barTop = bar.getBoundingClientRect().top;
      const measuredNavPad =
        parseFloat(getComputedStyle(bar.closest('nav[aria-label="Main"]')).paddingBottom) || 0;

      // The last visible leaf in the page's own scroll flow. Ignore the bar
      // itself, the toaster, and anything the browser pinned.
      const barBottomGuard = barTop;
      const nodes = Array.from(document.querySelectorAll("main *, body > div *"));
      let lowest = null;
      for (const el of nodes) {
        if (el.closest('nav[aria-label="Main"]')) continue;
        if (el.getAttribute("aria-hidden") === "true") continue;
        const style = getComputedStyle(el);
        if (style.position === "fixed" || style.position === "sticky") continue;
        if (style.visibility === "hidden" || style.display === "none") continue;
        if (!el.textContent?.trim()) continue;
        // A leaf: no element children holding text.
        const hasTextChild = Array.from(el.children).some(
          (c) => c.textContent?.trim() && getComputedStyle(c).display !== "contents",
        );
        if (hasTextChild) continue;
        const rect = el.getBoundingClientRect();
        if (rect.height === 0 || rect.width === 0) continue;
        if (rect.top >= barBottomGuard) continue;
        if (!lowest || rect.bottom > lowest.bottom) {
          lowest = {
            bottom: rect.bottom,
            tag: el.tagName,
            text: el.textContent.trim().slice(0, 40),
          };
        }
      }
      return { barTop, lowest, measuredNavPad };
    });

    if (!clearance) {
      check(`${name}: the last row clears the bar`, false, "no bar found");
      continue;
    }
    const gap = Math.round(clearance.barTop - (clearance.lowest?.bottom ?? clearance.barTop));
    check(
      `${name}: the last row clears the floating bar`,
      gap >= 0,
      gap >= 0
        ? `${gap}px of clearance (last: "${clearance.lowest?.text}")`
        : `last row is ${-gap}px UNDER the bar ("${clearance.lowest?.text}")`,
    );
    // A screen that pins its own control to the bottom (the till's basket bar)
    // has to clear the bar too, not just the ordinary scrolling content.
    const pinned = await page.evaluate(() => {
      const bar = document.querySelector('nav[aria-label="Main"] .glass-bar');
      if (!bar) return null;
      const barTop = bar.getBoundingClientRect().top;
      const pinnedEls = Array.from(document.querySelectorAll("body *")).filter((el) => {
        const s = getComputedStyle(el);
        if (s.position !== "fixed") return false;
        if (el.closest('nav[aria-label="Main"]')) return false;
        if (el.getAttribute("aria-hidden") === "true") return false;
        if (!el.textContent?.trim()) return false;
        const r = el.getBoundingClientRect();
        return r.height > 0 && r.bottom > barTop + 4;
      });
      return pinnedEls.map((el) => el.textContent.trim().slice(0, 30));
    });
    if (pinned) {
      check(
        `${name}: nothing pinned to the bottom hides under the bar`,
        pinned.length === 0,
        pinned.join(" | ") || "none",
      );
    }
  }

  // --- role awareness: the owner's five tabs
  await page.goto(`${BASE}/app/overview`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const ownerTabs = await page
    .locator('nav[aria-label="Main"] a, nav[aria-label="Main"] button')
    .allInnerTexts();
  console.log("owner tabs:", JSON.stringify(ownerTabs));
  for (const label of ["Dashboard", "POS", "Inventory", "Expenses", "More"]) {
    check(
      `owner sees the ${label} tab`,
      ownerTabs.some((t) => t.trim() === label),
      ownerTabs.join(" | "),
    );
  }

  // Touch targets: a shop counter is used with a thumb, in the sun, in a hurry.
  const small = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll(
      'nav[aria-label="Main"] a, nav[aria-label="Main"] button',
    )) {
      const r = el.getBoundingClientRect();
      if (r.height < 44 || r.width < 44) {
        bad.push(
          `${el.textContent.trim().slice(0, 12)} ${Math.round(r.width)}x${Math.round(r.height)}`,
        );
      }
    }
    return bad;
  });
  check("every tab is at least a 44px touch target", small.length === 0, small.join(" | "));

  // --- the active destination: highlight, elevation, indicator, and exactly one
  const active = await page.evaluate(() => {
    const current = document.querySelector('nav[aria-label="Main"] [aria-current="page"]');
    if (!current) return null;
    const tile = current.querySelector(".glass-tile");
    const dot = current.querySelector('[aria-hidden="true"] > span');
    const tab = current.getBoundingClientRect();
    const tileStyle = tile ? getComputedStyle(tile) : null;
    return {
      label: current.textContent.trim(),
      marked: document.querySelectorAll('nav[aria-label="Main"] [aria-current="page"]').length,
      hasTile: Boolean(tile),
      shadow: tileStyle?.boxShadow ?? "none",
      radius: tileStyle?.borderRadius ?? "",
      // The highlight must sit inside the tab, not balloon out from it: a
      // "highlight" larger than its own target is the colourful slab the brief
      // rules out.
      tileFills: tile ? tile.getBoundingClientRect().width >= tab.width * 0.9 : false,
      bg: tileStyle?.backgroundColor ?? "",
      dotOpacity: dot ? Number(getComputedStyle(dot).opacity) : 0,
    };
  });
  check("exactly one destination is marked current", active?.marked === 1, `${active?.marked}`);
  check("the active destination has a glass highlight", active?.hasTile === true);
  check(
    "the active highlight is raised above the bar",
    active?.shadow !== "none" && active.shadow.length > 10,
    active?.shadow ?? "no shadow",
  );
  check("the active highlight tracks its tab, it does not balloon out", active?.tileFills === true);
  check(
    "the active highlight is a pale tint, not a colour slab",
    /rgba\([^)]*,\s*0?\.\d+\)/.test(active?.bg ?? "") || /oklch/.test(active?.bg ?? ""),
    active?.bg ?? "",
  );
  check(
    "the active destination shows its indicator",
    (active?.dotOpacity ?? 0) > 0.9,
    `indicator at opacity ${active?.dotOpacity}`,
  );

  // --- the More sheet: material, contents, entrance, and dismissal
  const moreTab = page.locator('nav[aria-label="Main"] button[aria-haspopup="dialog"]');

  /*
    Record the entrance from inside the page, and open it from inside the page
    too. Driving the click from Node would put a protocol round trip between
    starting the recorder and the entrance beginning, and on a loaded machine
    that round trip is long enough to miss the whole animation — which is how a
    test ends up reporting "no stagger" on a sheet that has one.
  */
  await page.evaluate(() => {
    window.__stagger = [];
    const t0 = performance.now();
    const tick = () => {
      const rows = document.querySelectorAll('[role="dialog"] li');
      if (rows.length > 1) {
        window.__stagger.push([
          Number(getComputedStyle(rows[0]).opacity),
          Number(getComputedStyle(rows[rows.length - 1]).opacity),
          Math.round(performance.now() - t0),
        ]);
      }
      if (performance.now() - t0 < 1600) requestAnimationFrame(tick);
    };
    const tab = document.querySelector('nav[aria-label="Main"] button[aria-haspopup="dialog"]');
    tab?.click();
    requestAnimationFrame(tick);
  });

  const sheet = page.locator('[role="dialog"]');
  await sheet.waitFor({ timeout: 10_000 });
  await page.waitForTimeout(1200);

  const sheetStyle = await sheet.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      blur: s.backdropFilter,
      bg: s.backgroundColor,
      radius: s.borderTopLeftRadius,
      border: s.borderTopWidth,
      shadow: s.boxShadow,
    };
  });
  check(
    "the More sheet is a glass surface",
    /rgba?\(|oklch|color\(/.test(sheetStyle.bg),
    sheetStyle.bg,
  );
  check(
    "the More sheet is blurred",
    sheetStyle.blur !== "none" && sheetStyle.blur !== "",
    sheetStyle.blur,
  );
  check(
    "the More sheet has large rounded top corners",
    parseFloat(sheetStyle.radius) >= 24,
    sheetStyle.radius,
  );
  check(
    "the More sheet has a hairline edge",
    parseFloat(sheetStyle.border) >= 1,
    sheetStyle.border,
  );
  check(
    "the More sheet is raised off the page",
    sheetStyle.shadow !== "none" && sheetStyle.shadow.length > 10,
  );

  // Every destination the brief names, for the owner.
  const sheetText = (await sheet.innerText()).replace(/\s+/g, " ");
  console.log("more sheet:", sheetText.slice(0, 300), "\n");
  for (const [label, alias] of [
    ["Debtors", /Debtors/i],
    ["Sales History", /Sales history/i],
    ["Reports", /Reports/i],
    ["Employees", /Employees/i],
    ["Shop Settings", /Shop settings/i],
    ["Receipt Settings", /Receipt settings/i],
    ["Refund Settings", /Refund settings/i],
    ["Activity / Logs", /Activity log/i],
  ]) {
    check(`More offers ${label}`, alias.test(sheetText), sheetText.slice(0, 120));
  }

  // Rows are read with a thumb, at a counter, in a hurry.
  const rowTargets = await sheet.evaluate((el) => {
    const bad = [];
    for (const row of el.querySelectorAll("a[href], button")) {
      const r = row.getBoundingClientRect();
      if (r.height > 0 && r.height < 44)
        bad.push(`${row.textContent.trim().slice(0, 18)} ${Math.round(r.height)}px`);
    }
    return bad;
  });
  check(
    "every row in More is at least a 44px touch target",
    rowTargets.length === 0,
    rowTargets.join(" | "),
  );

  // --- the staggered entrance, measured rather than asserted
  const samples = await page.evaluate(() => window.__stagger ?? []);
  const lead = samples.length ? Math.max(...samples.map(([first, last]) => first - last)) : -1;
  const crossed = (i) => {
    const at = samples.find(([a, b]) => (i === 0 ? a : b) >= 0.9);
    return at ? at[2] : Infinity;
  };
  check(
    "More opens with a staggered entrance, not all at once",
    lead > 0.15,
    samples.length
      ? `${samples.length} frames, the first row led the last by up to ${lead.toFixed(2)} opacity`
      : "no frames captured",
  );
  check(
    "the first destination settles before the last",
    crossed(0) < crossed(1),
    `first at ${crossed(0)}ms, last at ${crossed(1)}ms`,
  );
  check(
    "the whole entrance finishes inside 700ms",
    crossed(1) < 700,
    `last row settled at ${crossed(1)}ms`,
  );

  // --- dismissal: outside tap, Escape, and a swipe down
  await page.mouse.click(20, 30);
  await page.waitForTimeout(700);
  check(
    "tapping outside dismisses More",
    (await sheet.count()) === 0 || !(await sheet.isVisible()),
  );

  await moreTab.click();
  await sheet.waitFor({ timeout: 10_000 });
  await page.waitForTimeout(700);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  check("Escape dismisses More", (await sheet.count()) === 0 || !(await sheet.isVisible()));

  await moreTab.click();
  await sheet.waitFor({ timeout: 10_000 });
  await page.waitForTimeout(900);
  const sheetBox = await sheet.boundingBox();
  if (sheetBox) {
    // Vaul drags from wherever the pointer lands on the panel, so the grab has
    // to start on the sheet itself rather than on the drag handle's pixel.
    const startX = sheetBox.x + sheetBox.width / 2;
    const startY = sheetBox.y + 24;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    for (let i = 1; i <= 8; i += 1) {
      await page.mouse.move(startX, startY + i * 30);
      await page.waitForTimeout(30);
    }
    await page.mouse.up();
    await page.waitForTimeout(800);
  }
  check(
    "swiping More down dismisses it",
    (await sheet.count()) === 0 || !(await sheet.isVisible()),
  );

  // --- hover, on a device that actually has a pointer.
  // A phone that reports `hover` reports it for the tap already over the
  // element, so this has to be checked somewhere `hover: hover` is true — and
  // it is the one state the phone context above cannot see at all.
  const deskContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const desk = await deskContext.newPage();
  try {
    await desk.goto(`${BASE}/auth/login`, { waitUntil: "domcontentloaded" });
    await desk.waitForTimeout(2500);
    await desk.fill("#login-email", EMAIL);
    await desk.fill("#login-password", PASSWORD);
    await desk.click('button[type="submit"]');
    await desk.waitForURL(/dashboard|\/app/, { timeout: 40_000 }).catch(() => {});
    await desk.waitForTimeout(4000);
    await desk.goto(`${BASE}/app/overview`, { waitUntil: "domcontentloaded" });
    await desk.locator('nav[aria-label="Main"] .glass-bar').first().waitFor({ timeout: 20_000 });

    const idle = await desk
      .locator('nav[aria-label="Main"] a[href*="/app/pos"]')
      .first()
      .evaluate((el) => getComputedStyle(el).transform);
    await desk.locator('nav[aria-label="Main"] a[href*="/app/pos"]').first().hover();
    await desk.waitForTimeout(400);
    const hovered = await desk
      .locator('nav[aria-label="Main"] a[href*="/app/pos"]')
      .first()
      .evaluate((el) => getComputedStyle(el).transform);
    check(
      "hovering a tab lifts it on a desktop pointer",
      idle !== hovered && /matrix/.test(hovered) && !/matrix\(1, 0, 0, 1, 0, 0\)/.test(hovered),
      `idle ${idle} → hover ${hovered}`,
    );

    await desk.locator('nav[aria-label="Main"] button[aria-haspopup="dialog"]').click();
    const deskSheet = desk.locator('[role="dialog"]');
    await deskSheet.waitFor({ timeout: 10_000 });
    await desk.waitForTimeout(900);
    const row = deskSheet.locator("li a").first();
    const rowIdle = await row.evaluate((el) => ({
      bg: getComputedStyle(el).backgroundColor,
      shadow: getComputedStyle(el).boxShadow,
    }));
    await row.hover();
    await desk.waitForTimeout(400);
    const rowHover = await row.evaluate((el) => ({
      bg: getComputedStyle(el).backgroundColor,
      shadow: getComputedStyle(el).boxShadow,
    }));
    check(
      "hovering a More row gives it a glass highlight",
      rowIdle.bg !== rowHover.bg,
      `${rowIdle.bg} → ${rowHover.bg}`,
    );
    check("hovering a More row raises it", rowIdle.shadow !== rowHover.shadow, rowHover.shadow);
  } catch (error) {
    failures.push("desktop hover");
    console.log(`FAIL  desktop hover — ${String(error).split("\n")[0].slice(0, 160)}`);
  } finally {
    await deskContext.close();
  }
} catch (error) {
  failures.push("harness");
  console.log(`FAIL  harness — ${String(error).split("\n")[0].slice(0, 200)}`);
  await page.screenshot({ path: "/tmp/float-bar-failure.png" }).catch(() => {});
} finally {
  await browser.close();
}

console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (failures.length) {
  console.log(`failed: ${failures.join(" | ")}`);
  process.exit(1);
}
