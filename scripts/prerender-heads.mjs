// Gives every public route its own static `<head>`.
//
// **The defect this fixes.** SAVO builds as a single-page app: `vite build`
// prerenders one shell (`dist/index.html`) carrying the home page's head, and
// the host serves that same file for every deep link. So `/legal/privacy` used
// to arrive with `<link rel="canonical" href="https://savo.freebuff.page/">` and
// `og:url` pointing at the home page in its raw HTML — a statement, to every
// crawler that does not run JavaScript, that the privacy policy *is* the landing
// page. Client-side code cannot repair that, because the wrong tag is already in
// the response. The fix has to happen in the bytes that ship.
//
// So this script clones the built shell once per public route and rewrites the
// handful of tags that describe a page: title, description, robots, canonical,
// `og:url`/`og:title`/`og:description` and the matching Twitter tags.
// `deploy/site-worker.js` serves `<path>.html` for that path, so the correct
// head is what the network returns, with or without JavaScript.
//
// **Where the values come from.** The route files, not a table here — a second
// copy of every title is a second thing to forget. Each route's `pageMeta({…})`
// call is parsed, and the canonical/og:url are derived from its `path` exactly
// as `pageMeta()` derives them, so the static head and the hydrated head agree.
// A route whose call cannot be parsed fails the build instead of shipping a
// head that quietly describes the wrong page.
//
//   node scripts/prerender-heads.mjs

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), "utf8");

const failures = [];
function fail(message) {
  failures.push(message);
}

/** Routes that build their head with `pageMeta()` and must ship their own. */
const ROUTE_FILES = [
  "src/routes/market.tsx",
  "src/routes/features.tsx",
  "src/routes/about.tsx",
  "src/routes/support.tsx",
  "src/routes/pricing.tsx",
  "src/routes/legal.privacy.tsx",
  "src/routes/legal.terms.tsx",
  "src/routes/legal.refunds.tsx",
  "src/routes/auth.login.tsx",
  "src/routes/auth.signup.tsx",
  "src/routes/auth.forgot-password.tsx",
  "src/routes/auth.reset-password.tsx",
];

const siteUrl = /export const SITE_URL = "([^"]+)"/.exec(read("src/lib/seo.ts"))?.[1];
if (!siteUrl) fail("could not read SITE_URL from src/lib/seo.ts");

/**
 * Reads a string-valued property out of a `pageMeta({…})` block.
 *
 * Handles both shapes the routes use: a value on the same line as its key, and
 * a value wrapped onto the next line. A `"…" + "…"` concatenation is joined
 * rather than truncated, because taking only the first half of a description
 * would produce a head that is subtly wrong. Returns `null` when the key is
 * absent, which the caller treats as unparseable rather than as empty.
 */
function stringValue(block, key) {
  const at = new RegExp(`\\n\\s*${key}:`).exec(block);
  if (!at) return null;

  let rest = block.slice(at.index + at[0].length);
  let value = "";
  let found = false;

  for (;;) {
    rest = rest.replace(/^\s+/, "");
    const quoted = /^"((?:[^"\\]|\\.)*)"/.exec(rest);
    if (!quoted) break;
    value += quoted[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    found = true;
    rest = rest.slice(quoted[0].length).replace(/^\s+/, "");
    if (!rest.startsWith("+")) break;
    rest = rest.slice(1);
  }

  return found ? value : null;
}

const escapeHtml = (value) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Replaces a tag exactly once. Anything other than one match means the built
 * shell is not the shape this script assumes — a silent no-op would ship the
 * home page's canonical under another page's URL, which is the bug itself.
 */
function replaceTag(html, pattern, replacement, label) {
  const global = new RegExp(
    pattern.source,
    pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
  );
  const matches = html.match(global) ?? [];
  if (matches.length !== 1) {
    fail(`${label}: expected 1 match in the shell, found ${matches.length}`);
    return html;
  }
  return html.replace(pattern, replacement);
}

/**
 * Crawlable body copy for each public page.
 *
 * The head was only half the problem. `spa: true` serves a shell whose `<body>`
 * is the router's hydration payload and a live-region stub — no heading, no
 * paragraph, no link — so a crawler that does not execute JavaScript saw a
 * titled but empty document. These blocks give each page a real heading, a
 * sentence saying what the page is for, and the site's own navigation, written
 * from the same copy the rendered page shows.
 *
 * The block lives in the bytes and is removed by the inline script that follows
 * it, during parsing and before the module script runs — so no visitor ever sees
 * it next to the app, and the hydrated page is unchanged. It is not a crawler
 * variant: everyone receives the same HTML.
 */
const PAGE_BODY = {
  "/": {
    h1: "Run your business with clarity.",
    lead: "SAVO is retail management software for sales, inventory, expenses and customer accounts — one workspace for the counter, the stockroom and the numbers.",
    points: [
      "Point of sale with cash, card, mobile money and credit",
      "A stock ledger that records why every unit moved",
      "Customer accounts with part payments",
      "Receipts, reports and staff access on a free account",
    ],
  },
  "/features": {
    h1: "What SAVO does",
    lead: "Point of sale, a stock ledger that records why every unit moved, customer accounts with part payments, expenses, receipts and reports — each one a screen a shop uses at the counter.",
    points: [
      "Sell with cash, card, mobile money or credit",
      "Receive stock and see every movement explained",
      "Track debtors and part payments",
      "Read today's numbers and export reports",
    ],
  },
  "/pricing": {
    h1: "SAVO costs nothing",
    lead: "Sales, inventory, customer accounts, expenses, receipts, staff access and reports on one free account. No subscription, no trial and no card.",
    points: [
      "Unlimited sales and products",
      "Staff accounts with owner and employee roles",
      "Receipts and reports included",
    ],
  },
  "/about": {
    h1: "Records that belong to the business that made them",
    lead: "SAVO exists so that a business's records stay readable on an ordinary phone and honest about what they show.",
    points: [
      "Built for the counter, not for a report",
      "Every number traceable to the sale or stock movement behind it",
    ],
  },
  "/support": {
    h1: "Help with sales, stock and sign-in",
    lead: "Ask the in-app assistant, find the screen for a sale, a stock count, a debtor payment or a sign-in problem, or contact a person directly.",
    points: [
      "In-app assistant for everyday questions",
      "Guides for sales, stock receiving and debtors",
      "A direct way to reach support",
    ],
  },
  "/market": {
    h1: "SAVO Marketlink",
    lead: "Browse products published by real SAVO shops, see current prices and availability, and send an order request to the seller.",
    points: [
      "Products from shops that sell on SAVO",
      "Prices and stock as the seller publishes them",
      "Order requests go to the seller, not to a stranger",
    ],
  },
  "/legal/privacy": {
    h1: "Privacy policy",
    lead: "What SAVO collects, why it holds it, and what a shop and its customers can ask for. The policy below is the authoritative text.",
    points: [],
  },
  "/legal/terms": {
    h1: "Terms of use",
    lead: "The terms that apply to using SAVO, including accounts, acceptable use and the limits of the service. The text below is authoritative.",
    points: [],
  },
  "/legal/refunds": {
    h1: "Refund policy",
    lead: "How refunds work for sales recorded in SAVO and for orders placed through Marketlink. The policy below is authoritative.",
    points: [],
  },
  "/auth/login": {
    h1: "Sign in to SAVO",
    lead: "Sign in with the email and password for your shop. Employees use the account their owner invited.",
    points: [],
  },
  "/auth/signup": {
    h1: "Create a SAVO account",
    lead: "One account holds your shop: sales, stock, customer accounts, receipts and reports.",
    points: [],
  },
  "/auth/forgot-password": {
    h1: "Reset your password",
    lead: "Enter the email on your SAVO account and a reset link is sent to it.",
    points: [],
  },
  "/auth/reset-password": {
    h1: "Choose a new password",
    lead: "Set a new password for your SAVO account using the link from your email.",
    points: [],
  },
};

const NAV_LINKS = [
  ["/features", "Features"],
  ["/pricing", "Pricing"],
  ["/about", "About"],
  ["/market", "Marketlink"],
  ["/support", "Support"],
];

const SEO_BODY_START = "<!--seo-body:start-->";
const SEO_BODY_END = "<!--seo-body:end-->";

function seoBodyHtml(pagePath) {
  const copy = PAGE_BODY[pagePath];
  if (!copy) return null;

  const points = copy.points.length
    ? `<ul>${copy.points.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>`
    : "";
  const nav = NAV_LINKS.map(([href, label]) => `<a href="${href}">${label}</a>`).join(" · ");

  return [
    SEO_BODY_START,
    `<div data-seo-prerender style="background:#0e1613;color:#f4f1ea;font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:2.5rem 1.5rem;line-height:1.55">`,
    `<main style="max-width:44rem;margin:0 auto">`,
    `<p style="margin:0 0 .75rem;color:#10b981;font-size:.8rem;letter-spacing:.08em;text-transform:uppercase">SAVO</p>`,
    `<h1 style="margin:0 0 1rem;font-size:2rem;line-height:1.15">${escapeHtml(copy.h1)}</h1>`,
    `<p style="margin:0 0 1rem">${escapeHtml(copy.lead)}</p>`,
    points,
    `<p style="margin:1.5rem 0 0;font-size:.9rem">${nav}</p>`,
    `</main>`,
    `</div>`,
    // Runs while the parser is still reading the body, so the block is gone
    // before the router hydrates and nothing shifts for a visitor.
    `<script>document.currentScript.previousElementSibling.remove();document.currentScript.remove();</script>`,
    SEO_BODY_END,
  ].join("");
}

/** Puts one page's crawlable block into a clone of the shell, replacing any
 * block the clone inherited from the home page. */
function injectSeoBody(html, pagePath) {
  const body = seoBodyHtml(pagePath);
  if (!body) {
    fail(`${pagePath}: no crawlable body copy defined in PAGE_BODY`);
    return html;
  }
  const pattern = new RegExp(`${SEO_BODY_START}[\\s\\S]*?${SEO_BODY_END}`);
  if (pattern.test(html)) return html.replace(pattern, body);
  return html.replace(/(<body[^>]*>)/, `$1${body}`);
}

if (!PAGE_BODY["/"]) fail("PAGE_BODY has no entry for the home page");
const shell = injectSeoBody(read("dist/index.html"), "/");
writeFileSync(join(ROOT, "dist", "index.html"), shell);

const worker = read("deploy/site-worker.js");
const pages = [];

for (const file of ROUTE_FILES) {
  const source = read(file);
  const block = /pageMeta\(\{([\s\S]*?)\}\)/.exec(source)?.[1];

  if (!block) {
    fail(`${file}: no pageMeta({…}) call found`);
    continue;
  }

  const title = stringValue(block, "title");
  const description = stringValue(block, "description");
  const pagePath = stringValue(block, "path");
  const noindex = /\bnoindex:\s*true\b/.test(block);

  if (!title || !description || !pagePath) {
    fail(`${file}: could not read title/description/path out of pageMeta()`);
    continue;
  }
  if (!pagePath.startsWith("/") || pagePath.endsWith("/")) {
    fail(`${file}: path ${pagePath} is not a clean absolute path`);
    continue;
  }

  const url = `${siteUrl}${pagePath}`;
  const robots = noindex
    ? "noindex, nofollow"
    : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";

  let html = injectSeoBody(shell, pagePath);
  html = replaceTag(
    html,
    /<title>[^<]*<\/title>/,
    `<title>${escapeHtml(title)}</title>`,
    `${pagePath} title`,
  );
  html = replaceTag(
    html,
    /<meta name="description" content="[^"]*"\s*\/>/,
    `<meta name="description" content="${escapeHtml(description)}"/>`,
    `${pagePath} description`,
  );
  html = replaceTag(
    html,
    /<meta name="robots" content="[^"]*"\s*\/>/,
    `<meta name="robots" content="${robots}"/>`,
    `${pagePath} robots`,
  );
  html = replaceTag(
    html,
    /<meta property="og:title" content="[^"]*"\s*\/>/,
    `<meta property="og:title" content="${escapeHtml(title)}"/>`,
    `${pagePath} og:title`,
  );
  html = replaceTag(
    html,
    /<meta property="og:description" content="[^"]*"\s*\/>/,
    `<meta property="og:description" content="${escapeHtml(description)}"/>`,
    `${pagePath} og:description`,
  );
  html = replaceTag(
    html,
    /<meta property="og:url" content="[^"]*"\s*\/>/,
    `<meta property="og:url" content="${escapeHtml(url)}"/>`,
    `${pagePath} og:url`,
  );
  html = replaceTag(
    html,
    /<meta name="twitter:title" content="[^"]*"\s*\/>/,
    `<meta name="twitter:title" content="${escapeHtml(title)}"/>`,
    `${pagePath} twitter:title`,
  );
  html = replaceTag(
    html,
    /<meta name="twitter:description" content="[^"]*"\s*\/>/,
    `<meta name="twitter:description" content="${escapeHtml(description)}"/>`,
    `${pagePath} twitter:description`,
  );
  html = replaceTag(
    html,
    /<link rel="canonical" href="[^"]*"\s*\/>/,
    `<link rel="canonical" href="${escapeHtml(url)}"/>`,
    `${pagePath} canonical`,
  );

  // `/pricing` is the one public page with structured data of its own. Every
  // clone starts as the home shell, which carries the landing page's
  // `WebApplication` block — on this page that block would claim the pricing
  // page *is* the app at the site root, and the page's own FAQ markup would
  // never reach a crawler. So the block is replaced, from the same `faq.json`
  // the page renders, and the result is checked below rather than trusted.
  if (pagePath === "/pricing") {
    const faq = JSON.parse(read("src/lib/faq.json"));
    const faqSchema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    };
    const json = JSON.stringify(faqSchema).replace(/</g, "\\u003c").replace(/&/g, "\\u0026");
    html = replaceTag(
      html,
      /<script type="application\/ld\+json">\{"@context":"https:\/\/schema\.org","@type":"WebApplication"[\s\S]*?<\/script>/,
      `<script type="application/ld+json">${json}</script>`,
      `${pagePath} FAQPage`,
    );

    const schemas = html.match(/<script type="application\/ld\+json">/g)?.length ?? 0;
    if (schemas !== 2) fail(`${pagePath}: shipped ${schemas} JSON-LD blocks, expected 2`);
    if (!html.includes('"@type":"FAQPage"')) fail(`${pagePath}: FAQPage block was not written`);
    if (html.includes('"@type":"WebApplication"')) {
      fail(`${pagePath}: still carries the home page's WebApplication block`);
    }
  }

  // The served file has to agree with itself: one canonical, one og:url, both
  // this page's, and the title a reader sees.
  const canonicals = html.match(/rel="canonical"/g)?.length ?? 0;
  const ogUrls = html.match(/property="og:url"/g)?.length ?? 0;
  if (canonicals !== 1) fail(`${pagePath}: shipped ${canonicals} canonical links`);
  if (ogUrls !== 1) fail(`${pagePath}: shipped ${ogUrls} og:url tags`);
  if (!html.includes(`<link rel="canonical" href="${escapeHtml(url)}"/>`)) {
    fail(`${pagePath}: canonical does not point at ${url}`);
  }
  if (!html.includes(`<title>${escapeHtml(title)}</title>`)) {
    fail(`${pagePath}: title was not rewritten`);
  }

  // The host only returns this file if the Worker maps the path to it.
  if (!worker.includes(`"${pagePath}"`)) {
    fail(`${pagePath}: deploy/site-worker.js does not serve this path's static page`);
  }

  const output = join(ROOT, "dist", `${pagePath.slice(1)}.html`);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, html);
  pages.push({ pagePath, title, noindex, output: `dist/${pagePath.slice(1)}.html` });
}

if (failures.length) {
  console.error("prerender-heads: refusing to ship a wrong head");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

for (const page of pages) {
  console.log(
    `head  ${page.pagePath.padEnd(24)} ${page.noindex ? "noindex" : "index  "} -> ${page.output}`,
  );
}
console.log(`${pages.length} page heads written`);
