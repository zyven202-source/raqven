import { chromium } from "playwright";

/**
 * The glass system, in a real browser.
 *
 * `verify-glass.mjs` proves the markup is shaped correctly. This proves the
 * thing that actually matters: that the blur is *running* (a raw
 * `backdrop-filter` in a hand-written utility has already silently vanished in
 * this project's production CSS once), that the three levels are visually
 * distinct from one another, and — the one that matters most — that text on
 * glass is still readable.
 *
 *   CHROMIUM_PATH=... bun scripts/verify-glass-ui.mjs https://ravqen.freebuff.app
 */

const BASE = process.argv[2] ?? "https://ravqen.freebuff.app";
const stamp = Date.now();
const EMAIL = `glass${stamp}@example.com`;
const PASSWORD = "Sup3rSecret!23";
const SHOP = `Glass ${stamp}`;

let passed = 0;
const failures = [];

/** The material of every glass level currently painted on the page. */
async function readLevels(target) {
  return target.evaluate(() => {
    const found = {};
    for (const el of document.querySelectorAll("*")) {
      for (const level of ["glass-1", "glass-2", "glass-3", "glass-bar"]) {
        if (found[level] || !el.classList.contains(level)) continue;
        const s = getComputedStyle(el);
        found[level] = {
          bg: s.backgroundColor,
          blur: s.backdropFilter,
          radius: parseFloat(s.borderRadius),
          shadow: s.boxShadow === "none" ? "none" : "set",
          border: s.borderTopWidth,
        };
      }
    }
    return found;
  });
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

try {
  await page.goto(`${BASE}/auth/signup`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.fill("#signup-name", "Glass Trader");
  await page.fill("#signup-phone", "0712000011");
  await page.fill("#signup-email", EMAIL);
  await page.fill("#signup-password", PASSWORD);
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

  // The till is built from its own markup and carries no glass, so the material
  // is checked where each level actually lives:
  //   L1 on the dashboard (the hero cards), L2 on settings (fields and groups),
  //   L3 on anything that opens a menu or a sheet.
  await page.goto(`${BASE}/app/overview`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4500);
  const overviewLevels = await readLevels(page);
  await page.goto(`${BASE}/app/settings`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4500);

  // --- the symbol is the identity, and it is an SVG the app drew
  const mark = await page.evaluate(() => {
    const svgs = [...document.querySelectorAll('nav[aria-label="Main"] svg')];
    return svgs.length;
  });
  check("the navigation renders vector icons", mark > 0, `${mark} svg(s)`);

  const favicon = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="icon"]');
    if (!link) return null;
    const res = await fetch(link.getAttribute("href"));
    const buf = new Uint8Array(await res.arrayBuffer());
    return { href: link.getAttribute("href"), bytes: buf.length, ok: res.ok };
  });
  check(
    "the favicon is served and non-empty",
    favicon !== null && favicon.ok && favicon.bytes > 0,
    favicon ? `${favicon.href} (${favicon.bytes} bytes)` : "no icon link",
  );

  // --- glass levels: sample the real computed material of each one present
  const levels = { ...(await readLevels(page)), ...overviewLevels };
  console.log("levels:", JSON.stringify(levels, null, 2), "\n");

  for (const level of ["glass-1", "glass-2"]) {
    const found = levels[level];
    check(
      `${level} is rendered`,
      Boolean(found),
      found ? `${found.bg} blur=${found.blur}` : "not found on either screen",
    );
    if (!found) continue;
    check(`${level} is actually blurred`, found.blur !== "none" && found.blur !== "");
    check(`${level} is translucent`, /rgba\(|oklch|color\(/.test(found.bg), found.bg);
    check(`${level} has depth`, found.shadow === "set");
  }

  // --- Level 3 lives on temporary UI, so it only exists once one is open.
  // The paper-width select on this screen is a menu; open it.
  const trigger = page.locator('button[role="combobox"]').first();
  if (await trigger.count()) {
    await trigger.click();
    await page.waitForTimeout(1200);
  } else {
    await page.getByRole("button", { name: /^More$/ }).click();
    await page.waitForTimeout(1200);
  }
  const openLevels = await readLevels(page);
  const l3 = openLevels["glass-3"];
  check("glass-3 is rendered on temporary UI", Boolean(l3), l3 ? l3.bg : "no menu found");
  if (l3) {
    check("glass-3 is actually blurred", l3.blur !== "none" && l3.blur !== "");
    check("glass-3 has depth", l3.shadow === "set");
  }

  // The three levels must be *different*, or the system is one effect with
  // three names and the hierarchy is a fiction.
  const alpha = (bg) => {
    // Chrome serialises translucent colours as `oklch(1 0 0 / 0.72)` — with a
    // space after the slash, which a `\s*` before the digits has to allow for.
    const m = /\/\s*([\d.]+)\s*\)/.exec(bg);
    return m ? Number(m[1]) : 1;
  };
  if (levels["glass-1"] && levels["glass-2"] && l3) {
    const a1 = alpha(levels["glass-1"].bg);
    const a2 = alpha(levels["glass-2"].bg);
    const a3 = alpha(l3.bg);
    check(
      "the three levels are visually distinct",
      a2 < a1 && a3 > a1,
      `opacity L2 ${a2} < L1 ${a1} < L3 ${a3}`,
    );
  }

  // Close the menu again so the readability pass measures the page, not a menu
  // stacked on top of it.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);

  // --- readability: text over glass must clear the WCAG AA threshold.
  // This is the check that keeps the glass from eating the product.
  const contrast = await page.evaluate(() => {
    // Computed colours come back in whatever space they were authored in, so
    // `oklch(1 0 0 / 0.58)` has to be normalised before its channels can be read
    // as sRGB. Parsing the numbers out of the string would read that as the
    // near-black rgb(1,0,0) and invent a contrast failure for every text node
    // on the page. Let the browser do the conversion: paint the colour on a
    // canvas and read the pixel back.
    const probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    const ctx = probe.getContext("2d", { willReadFrequently: true });

    const toRgba = (css) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = css;
      // Any colour the browser cannot parse leaves fillStyle black, which is
      // how a genuinely invalid colour shows up rather than silently skewing.
      const filled = ctx.fillStyle;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = filled;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    };

    const lum = ([r, g, b]) => {
      const f = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const over = (fg, bg) => [
      fg[0] * fg[3] + bg[0] * (1 - fg[3]),
      fg[1] * fg[3] + bg[1] * (1 - fg[3]),
      fg[2] * fg[3] + bg[2] * (1 - fg[3]),
    ];

    const page_ = over(toRgba(getComputedStyle(document.body).backgroundColor), [255, 255, 255]);
    const results = [];

    for (const el of document.querySelectorAll("p, span, h1, h2, h3, button, a, td, li, label")) {
      const text = el.textContent?.trim();
      if (!text || el.children.length > 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;

      // Composite every translucent background from the page up to the text,
      // because that is what the eye actually sees through the glass. The
      // element's OWN background counts: a solid button paints the surface its
      // label sits on, and starting at the parent measures that white label
      // against the page instead of against the button.
      let bg = page_;
      const stack = [];
      for (let node = el; node; node = node.parentElement) {
        const c = toRgba(getComputedStyle(node).backgroundColor);
        if (c[3] > 0.004) stack.push(c);
      }
      for (let i = stack.length - 1; i >= 0; i -= 1) bg = over(stack[i], bg);

      const fg = over(toRgba(cs.color), bg);
      const L1 = lum(fg);
      const L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const size = parseFloat(cs.fontSize);
      const bold = Number(cs.fontWeight) >= 700;
      const min = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      results.push({ ratio, min, ok: ratio >= min, text: text.slice(0, 30), size });
    }
    return results;
  });

  const failing = contrast.filter((c) => !c.ok);
  check(
    "text on glass is readable",
    failing.length === 0,
    failing.length
      ? `${failing.length} of ${contrast.length} below AA, e.g. "${failing[0].text}" ${failing[0].ratio.toFixed(2)}:1 (need ${failing[0].min})`
      : `${contrast.length} text nodes, all above AA`,
  );

  // --- interaction states exist and are not exaggerated.
  // Look for a control that actually carries the interaction utilities, rather
  // than the first button on the page — the shop switcher in the header is a
  // plain button and would give a false failure.
  const interaction = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button, a")].find(
      (el) =>
        (el.classList.contains("press") || el.classList.contains("hover-glass")) &&
        el.getBoundingClientRect().width > 40,
    );
    if (!btn) return null;
    const s = getComputedStyle(btn);
    return { transition: s.transitionProperty, duration: s.transitionDuration };
  });
  check(
    "controls animate rather than snapping",
    interaction !== null && /transform|filter/.test(interaction.transition),
    interaction ? `${interaction.transition}` : "no interactive control found",
  );
} catch (error) {
  failures.push("harness");
  console.log(`FAIL  harness — ${String(error).split("\n")[0].slice(0, 200)}`);
  await page.screenshot({ path: "/tmp/glass-failure.png" }).catch(() => {});
} finally {
  await browser.close();
}

console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (failures.length) {
  console.log(`failed: ${failures.join(" | ")}`);
  process.exit(1);
}
