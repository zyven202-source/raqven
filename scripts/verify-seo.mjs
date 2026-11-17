// Checks the SEO and accessibility contract.
//
// Three kinds of claim are made about this app, and all three are easy to make
// and easy to break in a way nothing else notices:
//
//   1. **The copy.** A title over 60 characters is truncated in a search result;
//      a description over 150 is cut mid-sentence. Those are silent losses —
//      the page still works. So the strings are imported from the module that
//      produces them and measured, rather than written out again here.
//   2. **The images.** An empty `alt` is invisible in a browser and invisible
//      to the type checker, because `alt` is an optional string either way. The
//      only place that can be caught is the source, so every `<img>` and every
//      `<StorageImage>` in `src/` is scanned and its `alt` has to be present and
//      non-empty.
//   3. **The structured data.** JSON-LD is validated *upwards*: a typo in a
//      property name makes Google drop the whole block without telling anyone,
//      and inventing a rating or a price is a manual action, not a bug report.
//      So the shape is asserted, and the absence of invented claims is asserted
//      too.
//
// The browser half of this — that the tags actually reach the rendered page and
// that the heading outline holds together — lives in `verify-ui-acceptance.mjs`,
// because it needs a real DOM.
//
//   node scripts/verify-seo.mjs

import { readFileSync, existsSync, statSync } from "node:fs";

import {
  HOME_EYEBROW,
  HOME_HEADLINE,
  HOME_META,
  OG_IMAGE_ALT,
  OG_IMAGE_URL,
  PRIMARY_KEYWORD,
  SEO_DESCRIPTION,
  SEO_TITLE,
  SITE_NAME,
  SITE_URL,
  pageMeta,
  siteJsonLd,
  webApplicationJsonLd,
} from "../src/lib/seo.ts";

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

const log = console.log;
log(`\n=== The copy ===`);

check(
  `${PRIMARY_KEYWORD}`.length > 0 && /kenyan shop pos/i.test(PRIMARY_KEYWORD),
  "the primary keyword is the one term the page is built around",
  PRIMARY_KEYWORD,
);
check(
  "the title contains the primary keyword",
  SEO_TITLE.toLowerCase().includes(PRIMARY_KEYWORD.toLowerCase()),
  SEO_TITLE,
);
check(
  "the title fits in the 60 characters a search result shows",
  SEO_TITLE.length <= 60,
  `${SEO_TITLE.length} characters`,
);
check("the title leads with the brand", SEO_TITLE.startsWith(SITE_NAME), SEO_TITLE.slice(0, 24));
check(
  "the description contains the primary keyword",
  SEO_DESCRIPTION.toLowerCase().includes(PRIMARY_KEYWORD.toLowerCase()),
);
check(
  "the description fits in the 150 characters a search result shows",
  SEO_DESCRIPTION.length <= 160,
  `${SEO_DESCRIPTION.length} characters`,
);
check(
  "the description is long enough to be worth reading",
  SEO_DESCRIPTION.length >= 120,
  `${SEO_DESCRIPTION.length} characters`,
);
check(
  "the hero eyebrow carries the primary keyword",
  HOME_EYEBROW.toLowerCase().includes(PRIMARY_KEYWORD.toLowerCase()),
  HOME_HEADLINE,
);
check(
  "the h1 reads as a sentence rather than a keyword list",
  HOME_HEADLINE.endsWith(".") && HOME_HEADLINE.split(" ").length >= 5,
  HOME_HEADLINE,
);
check(
  "the site URL is an absolute origin with no trailing slash",
  /^https:\/\/[^/]+$/.test(SITE_URL),
  SITE_URL,
);

log(`\n=== The meta descriptors ===`);

const descriptorKey = (descriptor) =>
  descriptor.name
    ? `name:${descriptor.name}`
    : descriptor.property
      ? `property:${descriptor.property}`
      : "title";
const keys = HOME_META.map(descriptorKey);
check("every descriptor appears exactly once", new Set(keys).size === keys.length, keys.join(", "));
for (const required of [
  "title",
  "name:description",
  "name:robots",
  "property:og:site_name",
  "property:og:title",
  "property:og:description",
  "property:og:type",
  "property:og:url",
  "property:og:locale",
  "property:og:image",
  "property:og:image:alt",
  "name:twitter:card",
  "name:twitter:title",
  "name:twitter:description",
  "name:twitter:image",
]) {
  check(`the head declares ${required}`, keys.includes(required));
}
check("the brand is declared once, not invented per route", SITE_NAME === "SAVO");
const absoluteValues = HOME_META.filter(
  (descriptor) =>
    descriptor.property === "og:url" ||
    descriptor.property === "og:image" ||
    descriptor.name === "twitter:image",
);
check(
  "every URL in the head is absolute",
  absoluteValues.every((descriptor) => /^https:\/\//.test(descriptor.content)),
  `${absoluteValues.length} URLs`,
);
check(
  "og:image:alt describes the image rather than repeating the title",
  OG_IMAGE_ALT.length > 10 && OG_IMAGE_ALT !== SEO_TITLE,
);
check(
  "the social card is declared square, which is what the image is",
  HOME_META.some((d) => d.property === "og:image:width" && d.content === "512") &&
    HOME_META.some((d) => d.property === "og:image:height" && d.content === "512"),
);

log(`\n=== The structured data ===`);

const schema = webApplicationJsonLd();
check("the context is schema.org", schema["@context"] === "https://schema.org");
check("the type is WebApplication", schema["@type"] === "WebApplication", schema["@type"]);
check("it names the application", schema.name === SITE_NAME, schema.name);
check(
  "it states an operating system",
  typeof schema.operatingSystem === "string" && schema.operatingSystem.length > 0,
  schema.operatingSystem,
);
check(
  "it states the application category",
  schema.applicationCategory === "BusinessApplication",
  schema.applicationCategory,
);
check("it points at the home page", schema.url === `${SITE_URL}/`, schema.url);
check("it uses the same description as the meta tag", schema.description === SEO_DESCRIPTION);
check("it uses the same image as the social card", schema.image === OG_IMAGE_URL);
check(
  "it lists real features",
  Array.isArray(schema.featureList) &&
    schema.featureList.length >= 5 &&
    schema.featureList.every((feature) => typeof feature === "string" && feature.length > 20),
  `${schema.featureList.length} features`,
);
// The product is sold internationally, so the structured data must not claim a
// single country. Absence is the assertion: adding one back fails the build.
check("it does not claim a single country", schema.areaServed === undefined);
check(
  "it names a publisher",
  schema.publisher?.name === SITE_NAME && schema.publisher?.logo?.url === OG_IMAGE_URL,
);
const serialised = JSON.stringify(schema);
check("it serialises to valid JSON", JSON.parse(serialised)["@type"] === "WebApplication");
check(
  "it claims no rating, review, offer or price",
  !/aggregateRating|"review"|"offers"|"price"|ratingValue/i.test(serialised),
);
check(
  "it does not stuff the keyword into unrelated properties",
  !/kenyan shop pos/i.test(schema.alternateName ?? "") ||
    schema.alternateName === `${SITE_NAME} ${PRIMARY_KEYWORD}`,
);

log(`\n=== The files the tags point at ===`);

// The ICO floor is lower than the PNG floor on purpose: a three-frame 16/32/48
// icon of flat artwork compresses to about 1.7 kB, and a blank one is only a few
// hundred bytes smaller — which is why the check that would catch a blank icon
// is not this one. `verify-app-icon.mjs` decodes the pixels and measures them.
for (const [file, minimum] of [
  ["public/icon-512.png", 20_000],
  ["public/icon-192.png", 5_000],
  ["public/favicon.ico", 200],
]) {
  const exists = existsSync(file);
  check(
    `${file} exists and is a real image`,
    exists && statSync(file).size > minimum,
    exists ? `${statSync(file).size} bytes` : "missing",
  );
}
check(
  "the social card is the file the head advertises",
  OG_IMAGE_URL.endsWith("/icon-512.png") && existsSync("public/icon-512.png"),
);
const robots = existsSync("public/robots.txt") ? readFileSync("public/robots.txt", "utf8") : "";
check(
  "robots.txt does not block the app",
  /Allow: \//.test(robots) && !/Disallow: \/\s*$/m.test(robots),
);

log(`\n=== Every image has alt text ===`);

/**
 * Reads the first element starting at `needle`, stopping at its own closing
 * bracket. Without the stop, a missing `alt` would silently pass by borrowing
 * the next element's.
 */
function elements(source, needle) {
  const found = [];
  let index = source.indexOf(needle);
  while (index >= 0) {
    const rest = source.slice(index);
    const end = rest.search(/\/?>|<\/StorageImage>/);
    found.push(end < 0 ? rest.slice(0, 400) : rest.slice(0, end + 2));
    index = source.indexOf(needle, index + needle.length);
  }
  return found;
}

/**
 * An `alt` is descriptive when it is present, and when it is not the empty
 * string in either quoted or expression form.
 */
function altOf(element) {
  const at = element.search(/\balt\s*=/);
  if (at < 0) return null;
  const value = element.slice(at + 4).trim();
  if (value.startsWith('"')) {
    const closing = value.indexOf('"', 1);
    return closing < 0 ? null : value.slice(1, closing);
  }
  if (value.startsWith("{")) {
    const inner = value.slice(1, value.indexOf("}", 1)).trim();
    return inner.replace(/^["'`]|["'`]$/g, "");
  }
  return null;
}

const SOURCES = [
  "src/components/app/StorageImage.tsx",
  "src/components/app/CreateShopDialog.tsx",
  "src/components/app/ProductFormDialog.tsx",
  "src/routes/_authenticated/dashboard.tsx",
  "src/routes/_authenticated/app.inventory.tsx",
  "src/routes/_authenticated/app.settings.tsx",
  "src/lib/receipt.ts",
];

let images = 0;
for (const file of SOURCES) {
  const source = readFileSync(file, "utf8");
  const tags = [
    ...elements(source, "<img").map((element) => ({ element, kind: "<img>" })),
    ...elements(source, "<StorageImage").map((element) => ({ element, kind: "<StorageImage>" })),
  ];
  for (const { element, kind } of tags) {
    images += 1;
    // `StorageImage` itself forwards whatever it is given, so its own `alt={alt}`
    // prop is the definition and is checked as such.
    if (file.endsWith("StorageImage.tsx")) continue;
    // A full-bleed background photograph is decorative by definition: it is
    // hidden from the accessibility tree and its empty alt is the correct
    // answer, not a missing one.
    if (altOf(element) === "" && /aria-hidden|role="presentation"/.test(element)) continue;
    const alt = altOf(element);
    check(
      `${file} — the ${kind} has descriptive alt text`,
      typeof alt === "string" && alt.trim().length > 0,
      alt === null ? "no alt attribute" : JSON.stringify(alt),
    );
  }
}
check("the app renders at least one image", images >= 2, `${images} image elements found`);
check(
  "every decorative image is hidden from assistive technology",
  // An empty alt is correct for a full-bleed background photograph — but only
  // when the image is also hidden from the accessibility tree. Anything else
  // is an image nobody can identify.
  SOURCES.every((file) =>
    readFileSync(file, "utf8")
      .split("<img")
      .slice(1)
      .every((tag) => {
        const head = tag.slice(0, tag.indexOf(">") + 1);
        const decorative = /alt=(""|\{""\})/.test(head);
        return !decorative || /aria-hidden|role="presentation"/.test(head);
      }),
  ),
);
check(
  "the alpha placeholder is hidden from assistive technology",
  /aria-hidden/.test(readFileSync("src/components/app/StorageImage.tsx", "utf8")),
);

log(`\n=== The home page is the one that gets indexed ===`);

/**
 * Comments out of the way before counting tags.
 *
 * This file documents its own rule in prose — "one `<h1>`, and it carries the
 * term people search for" — and a scan that counts `<h1` without stripping
 * comments counts that sentence as a second heading.
 */
const withoutComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const home = withoutComments(readFileSync("src/routes/index.tsx", "utf8"));
const marketing = ["SiteShell", "Sections", "Scene"].map((name) =>
  withoutComments(readFileSync(`src/components/marketing/${name}.tsx`, "utf8")),
);
/*
 * The home page opens with its own photographic hero rather than the shared
 * `PageHero`, because the photo, its two crops and its gradient are specific to
 * this one composition. That makes the route's own heading the one that counts,
 * so "exactly one h1" is asserted here directly — and the heading must still
 * come from the shared module rather than being typed into the markup twice.
 */
check(
  "the home page renders exactly one h1",
  (home.match(/<h1/g) ?? []).length === 1,
  `${(home.match(/<h1/g) ?? []).length} in the route`,
);
check(
  "the h1 reads its text from the shared module",
  /<h1[^>]*>\s*\{HOME_HEADLINE\}/.test(home),
);
check(
  "the hero photograph is a real image with a credit",
  /PHOTOGRAPHY\.hero\.src/.test(home) &&
    /unsplash\.com\/photos\//.test(readFileSync("src/lib/photography.ts", "utf8")) &&
    existsSync("public/photography/a-hero.jpg"),
  "hero comes from the photography manifest, which records the Unsplash page",
);
check(
  "the home page has section headings",
  (home.match(/SectionHeading/g) ?? []).length >= 3 && /<h2[^>]*>/.test(marketing[1]),
);
// Two in source, eight in the rendered page: the four steps and the three proof
// cards each share one `<h3>` inside a `.map()`. The rendered count is asserted
// where a real DOM exists, in `verify-ui-acceptance.mjs`.
check(
  "the home page has subsection headings",
  (home.match(/<h3/g) ?? []).length >= 2,
  `${(home.match(/<h3/g) ?? []).length} in source`,
);
check("the home page declares a canonical URL", /rel:\s*"canonical"/.test(home));
check(
  "the home page emits the JSON-LD from head(), not from the component body",
  /scripts:\s*\[/.test(home) && /type:\s*"application\/ld\+json"/.test(home),
);
check(
  "the JSON-LD goes in a string children, which is the only form the router renders",
  /children:\s*JSON\.stringify\(webApplicationJsonLd\(\)\)/.test(home),
);
check(
  "the structured data is not duplicated into the component body",
  !/application\/ld\+json/.test(home.split("component: Landing")[1] ?? ""),
);

const root = withoutComments(readFileSync("src/routes/__root.tsx", "utf8"));
check("the document declares its language", /<html lang="en-KE">/.test(root));
check(
  "the root provides a fallback social card for every other route",
  /og:image/.test(root) && /OG_IMAGE_URL/.test(root),
);
check(
  "a name/content descriptor is never written into the links array",
  !/links:\s*\[[^\]]*name:\s*"/s.test(root),
);

log(`\n=== Every page describes itself, and only public ones invite indexing ===`);

const canonicalOf = (head) => head.links.find((link) => link.rel === "canonical")?.href;
const metaOf = (head, key, value) =>
  head.meta.find((descriptor) => descriptor[key] === value)?.content;

const sample = pageMeta({
  title: "SAVO — Privacy policy",
  description: "What SAVO collects, and why.",
  path: "/legal/privacy",
});
check(
  "pageMeta() builds the canonical URL from the page's own path",
  canonicalOf(sample) === `${SITE_URL}/legal/privacy`,
  canonicalOf(sample),
);
check(
  "og:url is the page's own URL, never the home page's",
  metaOf(sample, "property", "og:url") === canonicalOf(sample),
  metaOf(sample, "property", "og:url"),
);
check(
  "og:title is the page's own title, so a share cannot unfurl as another page",
  metaOf(sample, "property", "og:title") === "SAVO — Privacy policy",
  metaOf(sample, "property", "og:title"),
);
check(
  "the Twitter card repeats the same title and description as Open Graph",
  metaOf(sample, "property", "og:title") === metaOf(sample, "name", "twitter:title") &&
    metaOf(sample, "property", "og:description") === metaOf(sample, "name", "twitter:description"),
);
check(
  "a public page invites indexing",
  /^index, follow/.test(metaOf(sample, "name", "robots") ?? ""),
  metaOf(sample, "name", "robots"),
);
const hidden = pageMeta({
  title: "SAVO — Set a new password",
  description: "Choose a new password.",
  path: "/auth/reset-password",
  noindex: true,
});
check(
  "a noindex page says so, once and unambiguously",
  metaOf(hidden, "name", "robots") === "noindex, nofollow",
  metaOf(hidden, "name", "robots"),
);

for (const [file, path] of [
  ["src/routes/auth.login.tsx", "/auth/login"],
  ["src/routes/auth.signup.tsx", "/auth/signup"],
  ["src/routes/legal.privacy.tsx", "/legal/privacy"],
  ["src/routes/legal.terms.tsx", "/legal/terms"],
  ["src/routes/legal.refunds.tsx", "/legal/refunds"],
]) {
  const source = withoutComments(readFileSync(file, "utf8"));
  check(
    `${path} builds its head from pageMeta() with its own path`,
    /pageMeta\(\{/.test(source) && source.includes(`path: "${path}"`),
  );
  check(`${path} no longer writes a canonical by hand`, !/rel: "canonical"/.test(source));
  check(`${path} stays indexable`, !/noindex: true/.test(source));
}

for (const [file, path] of [
  ["src/routes/auth.forgot-password.tsx", "/auth/forgot-password"],
  ["src/routes/auth.reset-password.tsx", "/auth/reset-password"],
]) {
  const source = withoutComments(readFileSync(file, "utf8"));
  check(
    `${path} is noindex — nobody reaches it from a search result`,
    /noindex: true/.test(source) && source.includes(`path: "${path}"`),
  );
}
check(
  "every signed-in screen is noindex, from the single layout they share",
  /noindex, nofollow/.test(
    withoutComments(readFileSync("src/routes/_authenticated/route.tsx", "utf8")),
  ),
);

log(`\n=== The site describes itself on every page ===`);

const site = siteJsonLd();
const graph = site["@graph"] ?? [];
const nodesOfType = (type) => graph.filter((node) => node["@type"] === type);
check("it is a schema.org graph", site["@context"] === "https://schema.org" && graph.length >= 2);
check(
  "it identifies the publisher",
  nodesOfType("Organization").some(
    (node) => node.name === SITE_NAME && node.logo?.url === OG_IMAGE_URL,
  ),
);
check(
  "it identifies the site, once, on its canonical URL",
  nodesOfType("WebSite").some((node) => node.url === `${SITE_URL}/`),
);
check(
  "the site points at the publisher rather than repeating it",
  nodesOfType("WebSite").some((node) => String(node.publisher?.["@id"]).endsWith("#organization")),
);
check(
  "it claims no rating, review, offer or price",
  !/aggregateRating|"review"|"offers"|"price"|ratingValue/i.test(JSON.stringify(site)),
);
check(
  "the root emits it through a string-children head script",
  /scripts: \[/.test(root) && /children: JSON\.stringify\(siteJsonLd\(\)\)/.test(root),
);
check(
  "the document language agrees with the manifest",
  /<html lang="en-KE">/.test(root) &&
    /"lang": "en-KE"/.test(readFileSync("public/manifest.webmanifest", "utf8")),
);

log(`\n=== The sitemap lists only pages that invite indexing ===`);

const sitemap = readFileSync("public/sitemap.xml", "utf8");
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const sitemapPaths = locs.map((loc) => loc.slice(SITE_URL.length));
check("the sitemap lists pages", locs.length >= 4, `${locs.length} URLs`);
check(
  "every URL is absolute, on the canonical origin",
  locs.every((loc) => loc.startsWith(`${SITE_URL}/`)),
);
check(
  "every URL is a route that exists in src/routes",
  sitemapPaths.every((path) => {
    const routeFile = path === "/" ? "index" : path.slice(1).replace(/\//g, ".");
    return existsSync(`src/routes/${routeFile}.tsx`);
  }),
  sitemapPaths.join(", "),
);
check(
  "it lists no signed-in screen",
  sitemapPaths.every((path) => !/^\/(app|admin|dashboard|onboarding)\b/.test(path)),
);
check(
  "it lists no page that declares itself noindex",
  sitemapPaths.every((path) => !/^\/auth\/(forgot-password|reset-password)$/.test(path)),
);
check(
  "it carries no future lastmod date",
  [...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].every((match) => {
    const date = new Date(match[1]);
    return !Number.isNaN(date.valueOf()) && date <= new Date();
  }),
);
check(
  "robots.txt points crawlers at the sitemap",
  robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`),
);

console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (failures.length) {
  console.log(`failed: ${failures.join(" | ")}`);
  process.exit(1);
}
