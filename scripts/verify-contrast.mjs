import { chromium } from "playwright";

/**
 * Contrast, measured on pixels that were actually rendered.
 *
 * Why this exists rather than a table of numbers in a design document: SAVO's
 * UI is liquid glass. A token's contrast against `--background` is not the
 * contrast a reader gets, because the glass puts a translucent fill and a
 * `backdrop-filter` between the glyphs and the page. "Muted foreground is 5.2:1
 * on the background" and "muted foreground on a glass card is 3.4:1" are both
 * true and only the second one reaches somebody's eyes.
 *
 * So every number here comes from a screenshot of the rendered page. Each text
 * node is tagged, screenshotted individually with Playwright's element
 * screenshot, and the PNG is decoded in the browser (this project has no image
 * library, and the browser owns the decoder). Pixels are split into ink and
 * surface by luminance order, which survives antialiasing, subpixel rendering
 * and the glass gradient.
 *
 * Two things this file got wrong first, kept here as comments because both
 * failure modes look like a passing or failing result:
 *
 *  - A viewport `clip` is in *page* coordinates. It produced blank crops, and
 *    a blank crop measures exactly 1.00:1, which reads as a catastrophic
 *    contrast failure rather than as a broken measurement.
 *  - Deciding which end of the histogram holds the glyphs from an "is the page
 *    dark?" flag is backwards: on a light page the ink is the *darkest* pixels.
 *    That version reported 1.00:1 for every node on every page.
 *
 * A ratio of exactly 1.00:1 is therefore reported as a broken measurement and
 * never as a pass or a fail. A contrast suite that cannot tell "unreadable"
 * from "measured nothing" is worse than no suite.
 *
 * Thresholds are WCAG 2.2: 4.5:1 body, 3:1 for large text (>= 24px, or
 * >= 18.66px bold) and for non-text boundaries. Disabled controls are measured
 * and reported but not failed — WCAG exempts them, and a till screen is not
 * where to lean on an exemption without saying so.
 *
 *   CHROMIUM_PATH=... bun scripts/verify-contrast.mjs https://site-823f0103f2d4410b881fabc7521ebbbc.freebuff.page
 */

const BASE =
  process.argv[2] ?? "https://site-823f0103f2d4410b881fabc7521ebbbc.freebuff.page";

/*
 * Optional third argument: a comma-separated list of page names to measure.
 * Measuring every screen composites every text node against its real
 * background in a real browser, which on a small machine runs past a single
 * unattended terminal slot — so the suite is skippable by page rather than
 * truncated by a timeout. A page left out is printed as SKIP and is measured
 * by the complementary run: nothing here is silently passed.
 */
const ONLY = process.argv[3]
  ? new Set(
      process.argv[3]
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean),
    )
  : null;

function selected(name) {
  if (!ONLY) return true;
  if (ONLY.has(name)) return true;
  console.log(`SKIP  ${name} — outside the requested subset`);
  return false;
}
const MARK = "data-contrast-id";

let passed = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? " — " + detail : ""}`);
  } else {
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

/* ------------------------------------------------------------------ in page */

/**
 * Playwright scrolls a locator into view before screenshotting it, and it does
 * not know that this app has a sticky glass header. An element that lands under
 * that header is *covered*: the crop then measures the header's own surface and
 * whatever text bleeds through the blur, which is how two real, high-contrast
 * labels on the Settings page came out at 1.32:1 and 2.37:1.
 *
 * `scroll-margin-top` keeps the browser's own scrollIntoView honest, and the
 * occlusion test below is the backstop: a covered element is reported as a
 * broken measurement, never as a contrast failure.
 */
const HIDE_STICKY_CSS =
  "*,*::before,*::after{scroll-margin-top:96px !important}" +
  "[class*='fixed'],[class*='sticky']{visibility:hidden !important}";

/**
 * Is the tagged element actually the topmost thing at its own position *right
 * now*? Called immediately after Playwright has scrolled the element into
 * view and captured it — probing earlier over-reports, because a chip sitting
 * near the bottom of the viewport at collection time is under the floating
 * navigation, and is not under it once Playwright has scrolled it up.
 */
function probeOcclusion(mark, id) {
  const el = document.querySelector("[" + mark + '="' + id + '"]');
  if (!el) return true;
  const r = el.getBoundingClientRect();
  const x = Math.min(window.innerWidth - 1, Math.max(0, r.left + Math.min(r.width - 1, 10)));
  const y = Math.max(0, Math.min(window.innerHeight - 1, r.top + r.height / 2));
  const hit = document.elementFromPoint(x, y);
  if (!hit) return true;
  if (hit === el || el.contains(hit) || hit.contains(el)) return false;
  // The app's own fixed chrome is not a measurement failure — it is the app.
  return !hit.closest("nav, header, [role='dialog'], [data-slot]");
}

/** Tags every element that directly owns a text node and is on screen. */
function collect(mark) {
  const stale = document.querySelectorAll("[" + mark + "]");
  for (let i = 0; i < stale.length; i += 1) stale[i].removeAttribute(mark);

  const out = [];
  let id = 0;
  const all = document.querySelectorAll("body *");

  for (let i = 0; i < all.length; i += 1) {
    const el = all[i];

    const own = [];
    for (let c = 0; c < el.childNodes.length; c += 1) {
      if (el.childNodes[c].nodeType === 3) own.push(el.childNodes[c].textContent.trim());
    }
    const text = own.join(" ").trim();
    if (text.length < 2) continue;

    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none") continue;
    if (Number(s.opacity) < 0.05) continue;

    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 6) continue;
    if (r.bottom < 0 || r.top > window.innerHeight) continue;

    el.setAttribute(mark, String(id));

    const size = Number.parseFloat(s.fontSize);
    const weight = Number(s.fontWeight) || 400;
    let onGlass = false;
    for (const c of el.classList) if (c.indexOf("glass-") === 0) onGlass = true;

    out.push({
      id: id,
      text: text.slice(0, 44),
      tag: el.tagName.toLowerCase(),
      classes: typeof el.className === "string" ? el.className : "",
      size: size,
      weight: weight,
      color: s.color,
      large: size >= 24 || (size >= 18.66 && weight >= 700),
      onGlass: onGlass,
      disabled: el.closest("[disabled], [aria-disabled='true']") !== null,
    });
    id += 1;
  }
  return out;
}

/** Decodes a base64 PNG crop and returns the ink-to-surface contrast ratio. */
async function measure(payload) {
  const lum = function (rgb) {
    const f = function (c) {
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(rgb[0] / 255) + 0.7152 * f(rgb[1] / 255) + 0.0722 * f(rgb[2] / 255);
  };
  const median = function (arr) {
    if (arr.length === 0) return 0;
    const s = arr.slice().sort(function (a, b) {
      return a - b;
    });
    return s[Math.floor(s.length / 2)];
  };

  const img = new Image();
  img.src = "data:image/png;base64," + payload.b64;
  await img.decode();

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  const pixels = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 16) continue;
    const rgb = [data[i], data[i + 1], data[i + 2]];
    pixels.push({ rgb: rgb, l: lum(rgb) });
  }
  if (pixels.length < 40) return { ratio: null, reason: "too few opaque pixels" };

  pixels.sort(function (a, b) {
    return a.l - b.l;
  });
  const spread = pixels[pixels.length - 1].l - pixels[0].l;
  if (spread < 0.02) return { ratio: null, reason: "crop is a single flat colour" };

  const mid = pixels[Math.floor(pixels.length / 2)];
  const band = [];
  const all = [];
  for (const p of pixels) {
    all.push(p.rgb);
    if (Math.abs(p.l - mid.l) < 0.02) band.push(p.rgb);
  }
  const pool = band.length > 30 ? band : all;
  const surface = [0, 1, 2].map(function (k) {
    return median(
      pool.map(function (p) {
        return p[k];
      }),
    );
  });

  // Ink is whichever end of the histogram is away from the measured surface.
  // Deriving the direction from the surface rather than from a theme flag is
  // what makes this correct in both light and dark.
  const n = Math.max(1, Math.floor(pixels.length * 0.02));
  const tail = mid.l > 0.5 ? pixels.slice(0, n) : pixels.slice(-n);
  const ink = [0, 1, 2].map(function (k) {
    return median(
      tail.map(function (p) {
        return p.rgb[k];
      }),
    );
  });

  const la = lum(ink);
  const lb = lum(surface);
  const ratio = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);

  /*
   * Does the crop actually contain the text we asked about?
   *
   * The two fabricated failures this suite produced — `text-foreground` at
   * 2.37:1 and `text-muted-foreground` at 1.32:1 — were both crops that did not
   * contain their text at all: Playwright scrolled the element to the top of
   * the page and the sticky header was still painting over it. A foreground
   * colour cannot really come out at 2:1, so the giveaway is that the colour the
   * element claims to be painted in is nowhere in the crop.
   *
   * The declared colour arrives as written in the stylesheet, and this product
   * specifies `oklch(...)` — comparing its three components against sRGB
   * pixels would "miss" on every crop ever captured, so oklch is converted
   * first and a format this parser does not understand simply skips the check
   * rather than inventing a verdict.
   *
   * The test is deliberately only consulted when the ratio would otherwise
   * FAIL. On a passing ratio the answer cannot change anything, and running it
   * unconditionally produced false alarms on buttons, where most of the box is
   * fill and the glyphs are a small minority of the pixels.
   */
  if (ratio < 4.5) {
    const declared = (payload.color || "").trim();
    let want = null;
    const toRgb = function (L, C, H) {
      const h = (H * Math.PI) / 180;
      const a = C * Math.cos(h);
      const b = C * Math.sin(h);
      const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
      const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
      const s_ = L - 0.0894841775 * a - 1.291485548 * b;
      const l = l_ * l_ * l_;
      const m = m_ * m_ * m_;
      const s = s_ * s_ * s_;
      const lin = [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
      ];
      return lin.map(function (c) {
        const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
        return Math.max(0, Math.min(255, Math.round(v * 255)));
      });
    };
    const oklch = declared.match(/^oklch\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i);
    const rgbFn = declared.match(/^rgba?\(/i);
    if (oklch) {
      want = toRgb(Number(oklch[1]), Number(oklch[2]), Number(oklch[3]));
    } else if (rgbFn) {
      const n = declared.match(/[\d.]+/g);
      if (n && n.length >= 3) want = [Number(n[0]), Number(n[1]), Number(n[2])];
    }
    if (want) {
      const dist = function (a) {
        return Math.sqrt(
          Math.pow(a[0] - want[0], 2) + Math.pow(a[1] - want[1], 2) + Math.pow(a[2] - want[2], 2),
        );
      };
      if (dist(ink) > Math.max(40, dist(surface) * 0.5)) {
        return { ratio: null, reason: "crop does not contain the declared text colour" };
      }
    }
  }

  return { ratio: ratio, spread: Math.round(spread * 1000) / 1000 };
}

/* ------------------------------------------------------------------- driver */

const PUBLIC_PAGES = [
  ["landing", "/"],
  ["privacy policy", "/legal/privacy"],
  ["terms of service", "/legal/terms"],
  ["refund policy", "/legal/refunds"],
  ["sign in", "/auth/login"],
  ["sign up", "/auth/signup"],
];

const APP_PAGES = [
  ["overview", "/app/overview"],
  ["pulse", "/app/pulse"],
  ["POS", "/app/pos"],
  ["stock", "/app/stock"],
  ["inventory", "/app/inventory"],
  ["debtors", "/app/debtors"],
  ["expenses", "/app/expenses"],
  ["transactions", "/app/transactions"],
  ["reports", "/app/reports"],
  ["employees", "/app/employees"],
  ["settings", "/app/settings"],
];

/**
 * Measures everything currently on screen, scrolling in viewport-sized steps so
 * that content below the fold — the activity log and the whole Data & privacy
 * section on Settings — gets measured too.
 */
async function measurePage(page, prefix, scroll) {
  const samples = [];
  const unreadable = [];
  const occluded = [];
  const skipped = [];
  const seen = new Set();

  const height = await page.evaluate(function () {
    return document.body.scrollHeight;
  });
  const stops = scroll ? Math.min(12, Math.max(1, Math.ceil(height / 800))) : 1;

  for (let stop = 0; stop < stops; stop += 1) {
    if (scroll) {
      await page.evaluate(function (y) {
        window.scrollTo(0, y);
      }, stop * 800);
      await page.waitForTimeout(700);
    }

    const nodes = await page.evaluate(collect, MARK);
    for (const node of nodes) {
      const key = node.text + "|" + node.classes;
      if (seen.has(key)) continue;
      seen.add(key);

      const shot = await page
        .locator("[" + MARK + '="' + node.id + '"]')
        .screenshot()
        .catch(function () {
          return null;
        });
      if (!shot) continue;

      // Probe *after* the capture, because that is the moment whose pixels were
      // just measured. A crop taken while something was on top of the element
      // measures the something, not the text — and reporting that as a contrast
      // failure is how two real, high-contrast labels came out at 1.32:1.
      const covered = await page.evaluate(probeOcclusion, [MARK, node.id]).catch(function () {
        return false;
      });
      if (covered) {
        occluded.push(node.tag + ' "' + node.text + '"');
        continue;
      }

      const m = await page
        .evaluate(measure, { b64: shot.toString("base64"), color: node.color })
        .catch(function () {
          return null;
        });

      if (!m || m.ratio === null) {
        /*
         * A disabled control is exempt from WCAG contrast, and the POS's
         * disabled "Take payment" button is exactly that: a big filled button
         * whose label is a small minority of the pixels. Counting it as a
         * measurement failure would mean the suite can never pass while a shop
         * has an empty basket, so it is reported and excluded rather than
         * quietly dropped.
         */
        if (node.disabled) {
          skipped.push(node.tag + ' "' + node.text + '" (disabled)');
          continue;
        }
        unreadable.push(node.tag + ' "' + node.text + '"' + (m ? " (" + m.reason + ")" : ""));
        continue;
      }
      const row = Object.assign({}, node);
      row.ratio = m.ratio;
      row.spread = m.spread;
      samples.push(row);
    }
  }

  if (scroll) {
    await page.evaluate(function () {
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(300);
  }
  return {
    samples: samples,
    unreadable: unreadable,
    occluded: occluded,
    skipped: skipped,
  };
}

function report(prefix, result) {
  const required = result.samples.filter(function (s) {
    return !s.disabled;
  });
  const failing = required.filter(function (s) {
    return s.ratio < (s.large ? 3 : 4.5);
  });
  const glass = required.filter(function (s) {
    return s.onGlass;
  });
  required.sort(function (a, b) {
    return a.ratio - b.ratio;
  });

  console.log(
    "\n— " +
      prefix +
      " — " +
      required.length +
      " measured, " +
      result.unreadable.length +
      " unreadable, " +
      glass.length +
      " on glass, lowest " +
      (required[0] ? required[0].ratio.toFixed(2) : "—") +
      ":1",
  );
  for (const s of required.slice(0, 5)) {
    console.log(
      "    " +
        s.ratio.toFixed(2) +
        ":1  " +
        String(s.size).padStart(4) +
        "px" +
        (s.onGlass ? " glass" : "     ") +
        "  " +
        s.classes.slice(0, 38).padEnd(38) +
        '  "' +
        s.text +
        '"',
    );
  }

  check(
    prefix + ": the verifier can actually see the text",
    result.unreadable.length + result.occluded.length === 0,
    result.unreadable.length + result.occluded.length === 0
      ? required.length +
          " nodes" +
          (result.skipped.length ? " (" + result.skipped.length + " disabled, exempt)" : "")
      : result.unreadable.length +
          " unreadable, " +
          result.occluded.length +
          " occluded: " +
          result.unreadable.concat(result.occluded).slice(0, 3).join(" | "),
  );

  check(
    prefix + ": every text node meets its WCAG threshold",
    failing.length === 0,
    failing.length === 0
      ? required.length + " nodes, lowest " + required[0].ratio.toFixed(2) + ":1"
      : failing
          .slice(0, 6)
          .map(function (f) {
            return (
              f.tag +
              "." +
              f.classes.slice(0, 26) +
              " " +
              f.ratio.toFixed(2) +
              ':1 "' +
              f.text +
              '"'
            );
          })
          .join(" | "),
  );

  if (glass.length > 0) {
    const lowest = Math.min.apply(
      null,
      glass.map(function (g) {
        return g.ratio;
      }),
    );
    check(
      prefix + ": text on glass clears 4.5:1",
      lowest >= 4.5,
      glass.length + " glass-backed, lowest " + lowest.toFixed(2) + ":1",
    );
  }
}

async function signInAndCreateShop(context) {
  const stamp = Date.now();
  const email = "contrast" + stamp + "@example.com";
  const password = "Sup3rSecret!23";
  const shop = "Contrast " + stamp;

  const p = await context.newPage();
  await p.goto(BASE + "/auth/signup", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(3000);

  await p.fill("#signup-name", "Contrast Tester");
  await p.fill("#signup-email", email);
  await p.fill("#signup-password", password);
  // Required and deliberately not pre-ticked, so the suite does what a person
  // does. Without a shop every app route renders the same empty state, and a
  // contrast suite that measures an empty state has measured nothing.
  await p.check("#signup-accepted");
  await p.click('button[type="submit"]');
  await p.waitForURL(/onboarding|dashboard/, { timeout: 40000 }).catch(function () {});

  await p
    .getByRole("heading", { name: /How will you use SAVO/i })
    .waitFor({ timeout: 30000 })
    .catch(function () {});
  await p
    .getByRole("button", { name: /I own a shop/i })
    .click({ timeout: 15000 })
    .catch(function () {});
  await p.waitForTimeout(1500);

  const dialog = p.locator('[role="dialog"]');
  await dialog.waitFor({ timeout: 15000 }).catch(function () {});
  await p.fill("#shop-name", shop).catch(function () {});
  await p.fill("#shop-location", "Gikomba, Nairobi").catch(function () {});
  await p.fill("#shop-phone", "0712345678").catch(function () {});
  await dialog
    .getByRole("button", { name: /^create shop$/i })
    .click({ timeout: 20000 })
    .catch(function () {});
  await p.waitForTimeout(9000);

  const landed = p.url();
  const created = landed.indexOf("onboarding") === -1;
  console.log(
    created
      ? "Shop created; landed on " + landed
      : "NOTE  shop creation did not complete (still at " +
          landed +
          ") — the app pass will be measuring the empty state",
  );
  await p.close();
  return { email: email, shop: shop, created: created };
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox", "--force-color-profile=srgb", "--font-render-hinting=none"],
});
const context = await browser.newContext({
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

try {
  for (const entry of PUBLIC_PAGES) {
    if (!selected(entry[0])) continue;
    await page.goto(BASE + entry[1], { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await page.addStyleTag({ content: HIDE_STICKY_CSS }).catch(function () {});
    const result = await measurePage(page, entry[0], false);
    report(entry[0], result);
  }

  const wantsAppPages = APP_PAGES.some((entry) => !ONLY || ONLY.has(entry[0]));
  if (wantsAppPages) {
    const account = await signInAndCreateShop(context);
    console.log("\nSigned up as " + account.email + '; shop "' + account.shop + '"');
  }

  for (const entry of APP_PAGES) {
    if (!selected(entry[0])) continue;
    await page.goto(BASE + entry[1], { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    await page.addStyleTag({ content: HIDE_STICKY_CSS }).catch(function () {});

    const bodyText = await page.textContent("body").catch(function () {
      return "";
    });
    check(
      "app/" + entry[0] + ": the real screen rendered, not an empty state",
      !/you are not in a shop yet|page not found|this page didn't load/i.test(bodyText || ""),
      /you are not in a shop yet/i.test(bodyText || "")
        ? "the shop was never created — this row would have measured the empty state"
        : "",
    );

    const result = await measurePage(page, "app/" + entry[0], true);
    report("app/" + entry[0], result);
  }
} catch (error) {
  check("verifier threw", false, error && error.message ? error.message : String(error));
} finally {
  await browser.close();
}

console.log("\n" + passed + " passed, " + failures.length + " failed");
if (failures.length > 0) process.exit(1);
