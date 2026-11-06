/**
 * dbg-contrast — why does the settings crop check fail on three nodes?
 *
 * Signs up exactly like verify-contrast, opens /app/settings, then for each
 * suspect element: captures the locator crop, runs the suite's own `measure`
 * maths on it, and writes the PNG so the crop can be inspected by eye.
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:8080";
const TARGETS = ["Optional.", "Delete my account", "Delete this shop"];

const HIDE_STICKY_CSS =
  "*,*::before,*::after{scroll-margin-top:96px !important}" +
  "[class*='fixed'],[class*='sticky']{visibility:hidden !important}";

/** The suite's measure(), verbatim in behaviour. */
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
  if (pixels.length < 40)
    return { ratio: null, reason: "too few opaque pixels", pixels: pixels.length };

  pixels.sort(function (a, b) {
    return a.l - b.l;
  });
  const spread = pixels[pixels.length - 1].l - pixels[0].l;
  if (spread < 0.02)
    return { ratio: null, reason: "crop is a single flat colour", pixels: pixels.length };

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

  const n = Math.max(1, Math.floor(pixels.length * 0.02));
  const tail = mid.l > 0.5 ? pixels.slice(0, n) : pixels.slice(-n);
  const ink = [0, 1, 2].map(function (k) {
    return median(
      tail.map(function (p) {
        return p[k];
      }),
    );
  });

  const la = lum(ink);
  const lb = lum(surface);
  const ratio = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);

  let declaredCheck = "not consulted";
  if (ratio < 4.5) {
    const declared = (payload.color || "").match(/[\d.]+/g);
    if (declared && declared.length >= 3) {
      const want = [Number(declared[0]), Number(declared[1]), Number(declared[2])];
      const dist = function (a) {
        return Math.sqrt(
          Math.pow(a[0] - want[0], 2) + Math.pow(a[1] - want[1], 2) + Math.pow(a[2] - want[2], 2),
        );
      };
      declaredCheck =
        "want=" +
        want.join(",") +
        " distInk=" +
        Math.round(dist(ink)) +
        " distSurface=" +
        Math.round(dist(surface)) +
        " threshold=" +
        Math.round(Math.max(40, dist(surface) * 0.5));
      if (dist(ink) > Math.max(40, dist(surface) * 0.5)) {
        return {
          ratio: null,
          reason: "crop does not contain the declared text colour",
          pixels: pixels.length,
          declaredCheck: declaredCheck,
          ink: ink,
          surface: surface,
        };
      }
    }
  }
  return {
    ratio: Math.round(ratio * 100) / 100,
    spread: Math.round(spread * 1000) / 1000,
    pixels: pixels.length,
    declaredCheck: declaredCheck,
    ink: ink,
    surface: surface,
  };
}

async function signInAndCreateShop(context) {
  const stamp = Date.now();
  const email = "dbgcontrast" + stamp + "@example.com";
  const shop = "Dbg " + stamp;

  const p = await context.newPage();
  await p.goto(BASE + "/auth/signup", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(3000);
  await p.fill("#signup-name", "Dbg Tester");
  await p.fill("#signup-email", email);
  await p.fill("#signup-password", "Sup3rSecret!23");
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
  await p.close();
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
  await signInAndCreateShop(context);
  await page.goto(BASE + "/app/settings", { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: HIDE_STICKY_CSS }).catch(function () {});
  await page.waitForTimeout(3000);

  // Scroll like measurePage does, so lazy sections have rendered.
  for (let stop = 0; stop < 24; stop += 1) {
    await page.evaluate(function (y) {
      window.scrollTo(0, y);
    }, stop * 800);
    await page.waitForTimeout(350);
  }
  await page.evaluate(function () {
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(500);
  await page.addStyleTag({ content: HIDE_STICKY_CSS }).catch(function () {});

  for (let i = 0; i < TARGETS.length; i += 1) {
    const text = TARGETS[i];
    const loc = page
      .locator("p, button, span, div")
      .filter({ hasText: new RegExp("^" + text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })
      .first();
    await loc.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(function () {});
    await page.waitForTimeout(600);
    const shot = await loc.screenshot().catch(function () {
      return null;
    });
    if (!shot) {
      console.log(text + " → NO SHOT");
      continue;
    }
    const info = await loc.evaluate(function (el) {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(
        Math.min(window.innerWidth - 1, Math.max(0, r.left + 10)),
        Math.max(0, Math.min(window.innerHeight - 1, r.top + r.height / 2)),
      );
      return {
        tag: el.tagName.toLowerCase(),
        classes: el.className,
        color: s.color,
        bg: s.backgroundColor,
        rect: {
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
        },
        hit: hit ? hit.tagName.toLowerCase() + "." + String(hit.className).slice(0, 60) : "null",
        onscreen: r.bottom > 0 && r.top < window.innerHeight,
      };
    });
    const m = await page.evaluate(measure, { b64: shot.toString("base64"), color: info.color });
    const file = "/tmp/crop-" + i + ".png";
    const fs = await import("node:fs");
    fs.writeFileSync(file, shot);
    console.log("=== [" + text + "] → " + file);
    console.log(JSON.stringify({ info: info, m: m }, null, 1));
  }
} catch (error) {
  console.log("THREW " + (error && error.message));
} finally {
  await browser.close();
}
