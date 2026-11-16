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
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Replaces a tag exactly once. Anything other than one match means the built
 * shell is not the shape this script assumes — a silent no-op would ship the
 * home page's canonical under another page's URL, which is the bug itself.
 */
function replaceTag(html, pattern, replacement, label) {
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  const matches = html.match(global) ?? [];
  if (matches.length !== 1) {
    fail(`${label}: expected 1 match in the shell, found ${matches.length}`);
    return html;
  }
  return html.replace(pattern, replacement);
}

const shell = read("dist/index.html");
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

  let html = shell;
  html = replaceTag(html, /<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`, `${pagePath} title`);
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
  console.log(`head  ${page.pagePath.padEnd(24)} ${page.noindex ? "noindex" : "index  "} -> ${page.output}`);
}
console.log(`${pages.length} page heads written`);
