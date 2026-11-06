/**
 * dbg-crops — run the contrast suite's crop maths (with the oklch declared
 * colour correctly converted to sRGB) over the PNGs dbg-contrast saved, to
 * learn each crop's true ink/surface ratio.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const FILES = ["/tmp/crop-0.png", "/tmp/crop-1.png", "/tmp/crop-2.png"];
// Declared colours of the three elements, as the browser reported them (oklch).
const DECLARED = ["oklch(0.76 0.045 165)", "oklch(0.72 0.16 26)", "oklch(0.72 0.16 26)"];

/** oklab -> linear sRGB -> sRGB, per CSS Color 4. */
function oklchToRgb(L, C, H) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const to8 = (c) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(v * 255)));
  };
  return [to8(lr), to8(lg), to8(lb)];
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox", "--force-color-profile=srgb"],
});
const page = await browser.newPage();

async function script(payload) {
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
  if (spread < 0.02) return { ratio: null, reason: "flat" };

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
        return p.rgb[k];
      }),
    );
  });

  const la = lum(ink);
  const lb = lum(surface);
  const ratio = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);

  const dist = function (a, b) {
    return Math.sqrt(
      Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2),
    );
  };
  return {
    ratio: Math.round(ratio * 100) / 100,
    ink: ink,
    surface: surface,
    distDeclared: Math.round(dist(ink, payload.want)),
    distSurfaceDeclared: Math.round(dist(surface, payload.want)),
    pixels: pixels.length,
    brightest: pixels[pixels.length - 1].rgb,
  };
}

for (let i = 0; i < FILES.length; i += 1) {
  const b64 = readFileSync(FILES[i]).toString("base64");
  const m = DECLARED[i].match(/[\d.]+/g);
  const want = oklchToRgb(Number(m[0]), Number(m[1]), Number(m[2]));
  const out = await page.evaluate(script, { b64, want });
  console.log(FILES[i], "declared→rgb", want.join(","), JSON.stringify(out));
}

await browser.close();
