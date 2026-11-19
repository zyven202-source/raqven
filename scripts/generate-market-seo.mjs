// Gives every PUBLISHED shop and product a static head and a sitemap entry.
//
// SAVO is deployed as a static single-page app. The client router sets the right
// title and canonical once JavaScript runs, but a crawler that does not execute
// scripts would otherwise receive the landing page's head on `/shop/...`. This
// script reads the public marketplace functions from Supabase at build time —
// published rows only — clones the built shell for each page, and rewrites the
// tags that describe it. It also writes a sitemap that reflects what was
// published when this deploy was built.
//
// It never fails a deploy on a network error: a marketplace that is briefly
// unreachable should not block a release. It says so plainly instead.
//
//   node scripts/generate-market-seo.mjs

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), "utf8");

try {
  process.loadEnvFile(join(ROOT, ".env"));
} catch {
  /* No .env: the build may be running with real environment variables. */
}
try {
  process.loadEnvFile(join(ROOT, ".env.local"));
} catch {
  /* optional */
}

const SITE_URL = "https://savo.freebuff.page";
const SUPABASE_URL = process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";
const SUPABASE_KEY =
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const truncate = (value, max) => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
};

async function rpc(name) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!response.ok) {
      console.warn(`market-seo: ${name} answered ${response.status}; skipping dynamic pages`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.warn(`market-seo: could not reach ${name}; skipping dynamic pages`);
    console.warn(`  ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

const shell = read("dist/index.html");
const failures = [];

function replaceTag(html, pattern, replacement, label) {
  const matches = html.match(new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`)) ?? [];
  if (matches.length !== 1) {
    failures.push(`${label}: expected 1 match, found ${matches.length}`);
    return html;
  }
  return html.replace(pattern, replacement);
}

function pageHtml({ title, description, path, type, jsonLd, image }) {
  const url = `${SITE_URL}${path}`;
  let html = shell;

  html = replaceTag(html, /<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`, `${path} title`);
  html = replaceTag(
    html,
    /<meta name="description" content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${escapeHtml(description)}"/>`,
    `${path} description`,
  );
  html = replaceTag(
    html,
    /<meta name="robots" content="[^"]*"\s*\/?>/,
    `<meta name="robots" content="index, follow, max-image-preview:large"/>`,
    `${path} robots`,
  );
  html = replaceTag(
    html,
    /<meta property="og:title" content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${escapeHtml(title)}"/>`,
    `${path} og:title`,
  );
  html = replaceTag(
    html,
    /<meta property="og:description" content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${escapeHtml(description)}"/>`,
    `${path} og:description`,
  );
  html = replaceTag(
    html,
    /<meta property="og:type" content="[^"]*"\s*\/?>/,
    `<meta property="og:type" content="${type}"/>`,
    `${path} og:type`,
  );
  html = replaceTag(
    html,
    /<meta property="og:url" content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${escapeHtml(url)}"/>`,
    `${path} og:url`,
  );
  html = replaceTag(
    html,
    /<link rel="canonical" href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${escapeHtml(url)}"/>`,
    `${path} canonical`,
  );
  if (image) {
    html = replaceTag(
      html,
      /<meta property="og:image" content="[^"]*"\s*\/?>/,
      `<meta property="og:image" content="${escapeHtml(image)}"/>`,
      `${path} og:image`,
    );
    html = replaceTag(
      html,
      /<meta name="twitter:image" content="[^"]*"\s*\/?>/,
      `<meta name="twitter:image" content="${escapeHtml(image)}"/>`,
      `${path} twitter:image`,
    );
  }

  // The shell carries the landing page's WebApplication block. Leaving it here
  // would tell a crawler the shop page *is* the application at the site root.
  html = html.replace(
    /<script type="application\/ld\+json">[^<]*"@type":"WebApplication"[^<]*<\/script>/,
    "",
  );
  const block = JSON.stringify(jsonLd).replace(/</g, "\\u003c").replace(/&/g, "\\u0026");
  html = html.replace("</head>", `<script type="application/ld+json">${block}</script></head>`);

  return html;
}

function writePage(path, html) {
  const output = join(ROOT, "dist", `${path.slice(1)}.html`);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, html);
}

function imageUrl(path) {
  if (!path) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/marketlink-images/${path}`;
}

const shops = (await rpc("marketlink_public_shops")) ?? [];
const listings = (await rpc("marketlink_public_listings")) ?? [];

const staticPaths = [
  "/",
  "/market",
  "/features",
  "/pricing",
  "/about",
  "/support",
  "/legal/privacy",
  "/legal/terms",
  "/legal/refunds",
];

for (const shop of shops) {
  if (!shop?.slug) continue;
  const description = truncate(
    `Browse ${shop.name} on SAVO Marketlink: real products, current prices and availability, with delivery or collection arranged directly with the shop.`,
    155,
  );
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Store",
    name: shop.name,
    url: `${SITE_URL}/shop/${shop.slug}`,
  };
  writePage(
    `/shop/${shop.slug}`,
    pageHtml({
      title: `${truncate(shop.name, 44)} — SAVO Marketlink`,
      description,
      path: `/shop/${shop.slug}`,
      type: "profile",
      jsonLd,
    }),
  );
}

for (const listing of listings) {
  if (!listing?.shop_slug || !listing?.listing_id) continue;
  const path = `/shop/${listing.shop_slug}/p/${listing.listing_id}`;
  const description = truncate(
    listing.description ||
      `Buy ${listing.name} from ${listing.shop_name} on SAVO Marketlink. ${listing.currency} ${Number(listing.price).toFixed(2)}.`,
    155,
  );
  const image = imageUrl(listing.image_path);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: listing.name,
    url: `${SITE_URL}${path}`,
    ...(listing.description ? { description: truncate(listing.description, 400) } : {}),
    ...(image ? { image: [image] } : {}),
    brand: { "@type": "Brand", name: listing.shop_name },
    offers: {
      "@type": "Offer",
      price: Number(listing.price).toFixed(2),
      priceCurrency: listing.currency,
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}${path}`,
      seller: { "@type": "Organization", name: listing.shop_name },
    },
  };
  writePage(
    path,
    pageHtml({
      title: `${truncate(listing.name, 38)} — ${truncate(listing.shop_name, 18)}`,
      description,
      path,
      type: "product",
      jsonLd,
      image,
    }),
  );
}

const today = new Date().toISOString().slice(0, 10);
const urls = [
  ...staticPaths.map((path) => ({ loc: `${SITE_URL}${path === "/" ? "/" : path}`, lastmod: today })),
  ...shops.map((shop) => ({
    loc: `${SITE_URL}/shop/${shop.slug}`,
    lastmod: (shop.updated_at ?? today).slice(0, 10),
  })),
  ...listings.map((listing) => ({
    loc: `${SITE_URL}/shop/${listing.shop_slug}/p/${listing.listing_id}`,
    lastmod: (listing.updated_at ?? today).slice(0, 10),
  })),
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated at build time from published Marketlink records. A shop or product
     that is unpublished is absent here, and its page serves a noindex shell. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (entry) =>
      `  <url>\n    <loc>${escapeHtml(entry.loc)}</loc>\n    <lastmod>${entry.lastmod}</lastmod>\n  </url>`,
  )
  .join("\n")}
</urlset>
`;
writeFileSync(join(ROOT, "dist", "sitemap.xml"), sitemap);

if (failures.length) {
  console.error("market-seo: refusing to ship a wrong head");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `market-seo: ${shops.length} shop page(s), ${listings.length} product page(s), ${urls.length} sitemap URL(s)`,
);
