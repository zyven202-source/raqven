/**
 * Everything a crawler reads, in one place.
 *
 * The page title, the meta description, the Open Graph tags, the structured
 * data and the home page's `<h1>` are five descriptions of the same product. If
 * they are written five times they drift, and the drift is invisible until a
 * search result disagrees with the page. So the wording lives here once and
 * every consumer imports it: `src/routes/index.tsx` builds its `<head>` and its
 * heading from these values, and `webApplicationJsonLd()` is the same facts
 * expressed as schema.org.
 *
 * **What is deliberately absent.** No `aggregateRating`, no `review`, no
 * `offers`. Those are priced claims: this product has no published ratings and
 * no billing integration, and inventing either is both dishonest and something
 * Google penalises. Every property below is a fact about the application that
 * can be demonstrated from the code.
 *
 * **On `keywords`.** Google has ignored the meta keyword tag for two decades
 * and the page ranks on its title, description and body copy instead. It is
 * still emitted because it is harmless, some smaller engines and site search
 * tools do read it, and `KEYWORDS` is also the honest list of the phrases this
 * page is actually written to answer — nothing here is a term the copy does not
 * cover.
 */

/** Absolute origin. Open Graph and JSON-LD both reject relative URLs. */
/**
 * The canonical origin — the deployed Freebuff Sites production URL.
 *
 * Every absolute URL the product publishes (canonical link, Open Graph,
 * JSON-LD `url`, the sitemap, the robots entry, and the Play listing's privacy
 * and account-deletion links) is built from this one constant. The origin has
 * changed hosts more than once, and each time every dependent URL had to move
 * with it — so it stays here, in one place, and nothing else in the app spells
 * out a host.
 */
export const SITE_URL = "https://savo.freebuff.page";

/**
 * The one term a retailer would actually type to find this.
 *
 * It describes the product — retail management software — rather than a market.
 * SAVO is sold internationally, and a geographic phrase would be a claim about
 * where it works, not a description of what it does.
 */
export const PRIMARY_KEYWORD = "retail management software";

/**
 * The phrases the landing page is written to answer, in the words a shop owner
 * actually uses. Ordered by intent: what the product is, then the jobs it does,
 * then the hardware and payment habits around it. Every entry appears in the
 * page's own copy, so this list describes the page rather than aspirational
 * ranking targets.
 */
export const KEYWORDS = [
  "retail management software",
  "point of sale system",
  "inventory management software",
  "sales tracking app",
  "retail POS",
  "stock management software",
  "customer credit ledger",
  "expense tracking for retail",
  "small business POS",
  "retail reports",
  "SAVO",
] as const;

/** The `keywords` meta value, built from the one list above. */
export const KEYWORDS_META = KEYWORDS.join(", ");

export const SITE_NAME = "SAVO";

export const SITE_TAGLINE = "Every sale. Every stock. Every number.";

/** 51 characters — inside the ~60 a search result will show in full. */
export const SEO_TITLE = "SAVO — Retail Management Software, POS & Inventory";

/** 147 characters — inside the ~150 a search result will show before truncating. */
export const SEO_DESCRIPTION =
  "Retail management software for sales, inventory, expenses and customer accounts — " +
  "one workspace for the counter, the stockroom and the numbers.";

/**
 * The home page's `<h1>`: a sentence about the shop, not a keyword string.
 *
 * It used to carry the search term itself. The redesign moved the term into the
 * eyebrow above it, where it reads as a label rather than as a headline that was
 * written for a crawler — and the word still appears in the title, the meta
 * description and the first paragraph, which is what actually ranks.
 */
export const HOME_HEADLINE = "Run your business with clarity.";

/**
 * The label above the headline. The product's category, visible rather than
 * hidden, so the headline itself can be a sentence.
 */
export const HOME_EYEBROW = "Retail management software";

/**
 * The landscape social card, 1200 × 630.
 *
 * It used to point at the square app icon. A square image in a 1.91:1 unfurl is
 * cropped to a slice of itself, and `twitter:card` had to be `summary` to avoid
 * that — so every shared SAVO link was a small thumbnail of half a mark. A
 * purpose-built landscape card fits the slot exactly and can carry the tagline.
 * The square icon remains the app icon, the manifest icon and the JSON-LD logo;
 * this is the social preview only.
 */
export const OG_IMAGE_URL = `${SITE_URL}/og-image.png`;
export const OG_IMAGE_WIDTH = "1200";
export const OG_IMAGE_HEIGHT = "630";
export const OG_IMAGE_ALT =
  "SAVO — retail management software. A mint receipt mark, the word savo and the line 'Every sale. Every stock. Every number.' on a deep green field.";

/** The square app icon, still the logo where a square is correct. */
export const APP_ICON_URL = `${SITE_URL}/icon-512.png`;
export const APP_ICON_ALT =
  "The SAVO app icon: a mint receipt and the word savo on a shelf label, on a deep green tile.";

/** Every meta descriptor the home page needs, in the order crawlers read them. */
export const HOME_META = [
  { title: SEO_TITLE },
  { name: "description", content: SEO_DESCRIPTION },
  {
    name: "robots",
    content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  },
  { name: "application-name", content: SITE_NAME },
  { name: "keywords", content: KEYWORDS_META },
  { property: "og:site_name", content: SITE_NAME },
  { property: "og:title", content: SEO_TITLE },
  { property: "og:description", content: SEO_DESCRIPTION },
  { property: "og:type", content: "website" },
  { property: "og:url", content: `${SITE_URL}/` },
  { property: "og:locale", content: "en" },
  { property: "og:image", content: OG_IMAGE_URL },
  { property: "og:image:type", content: "image/png" },
  { property: "og:image:width", content: OG_IMAGE_WIDTH },
  { property: "og:image:height", content: OG_IMAGE_HEIGHT },
  { property: "og:image:alt", content: OG_IMAGE_ALT },
  { name: "twitter:card", content: "summary_large_image" },
  { name: "twitter:title", content: SEO_TITLE },
  { name: "twitter:description", content: SEO_DESCRIPTION },
  { name: "twitter:image", content: OG_IMAGE_URL },
  { name: "twitter:image:alt", content: OG_IMAGE_ALT },
] as const;

/**
 * One page's head, built from that page's own facts.
 *
 * **Why this exists.** Every route used to write its own `meta` array, and the
 * only place `og:url` was declared was the root head — with the home page's URL
 * hard-coded. So `/legal/privacy` rendered "SAVO — Privacy policy" as its
 * `<title>` and, one line below it, an `og:url` and `og:title` claiming to be
 * the home page. A crawler reads both; a chat app unfurls the second. The fix
 * is not to remember the extra tags on each page, it is to make one function
 * the only way a page describes itself, and to derive `og:url` from the same
 * `path` the canonical link uses so they cannot disagree.
 *
 * `noindex` is for screens that must not appear in a search result: the
 * password-reset pair (thin, and useful to nobody but the account holder) and
 * every signed-in screen (a crawler cannot sign in, so all it can index is a
 * loading state).
 */
export type PageHeadInput = {
  /** The page title, already brand-prefixed. */
  title: string;
  /** One sentence, written for a search result, not for a crawler. */
  description: string;
  /** The page's absolute path, beginning with `/`, e.g. `/legal/privacy`. */
  path: string;
  /** Open Graph type. `website` unless the page is genuinely an article. */
  type?: "website" | "article" | "profile";
  /** True when the page must stay out of search results. */
  noindex?: boolean;
};

export function pageMeta({
  title,
  description,
  path,
  type = "website",
  noindex = false,
}: PageHeadInput) {
  const url = `${SITE_URL}${path}`;

  return {
    meta: [
      { title },
      { name: "description", content: description },
      { name: "keywords", content: KEYWORDS_META },
      {
        name: "robots",
        content: noindex
          ? "noindex, nofollow"
          : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
      },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: type },
      { property: "og:url", content: url },
      { property: "og:locale", content: "en" },
      { property: "og:image", content: OG_IMAGE_URL },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: OG_IMAGE_WIDTH },
      { property: "og:image:height", content: OG_IMAGE_HEIGHT },
      { property: "og:image:alt", content: OG_IMAGE_ALT },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: OG_IMAGE_URL },
      { name: "twitter:image:alt", content: OG_IMAGE_ALT },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

/**
 * The site itself: one `Organization` and one `WebSite` node, on every route.
 *
 * The landing page's `WebApplication` answers "what does this do?". These answer
 * the two questions a search engine asks before it trusts an answer: who
 * publishes this, and what is this site. Identity only — no rating, no price, no
 * address the operator has not confirmed — because a knowledge panel built on
 * an invented fact is a correction to file, not a win.
 */
export function siteJsonLd() {
  const organizationId = `${SITE_URL}/#organization`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        logo: {
          "@type": "ImageObject",
          url: APP_ICON_URL,
          contentUrl: APP_ICON_URL,
          width: 512,
          height: 512,
          caption: APP_ICON_ALT,
        },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: SITE_NAME,
        description: SEO_DESCRIPTION,
        inLanguage: "en",
        publisher: { "@id": organizationId },
      },
    ],
  };
}

/**
 * The application, described once as schema.org `WebApplication`.
 *
 * `featureList` is not marketing copy — each entry is a screen that exists and
 * reads or writes real Supabase rows.
 *
 * `offers` is omitted on purpose: pricing is not a property of the code, and a
 * stale `price` in structured data is worse than no price at all.
 */
export function webApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    alternateName: `${SITE_NAME} ${PRIMARY_KEYWORD}`,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Point of Sale",
    // The app is installed from the browser as a web app and is used on
    // Android phones at the counter; desktop is where the owner reads reports.
    operatingSystem: "Android, iOS, Web browser",
    url: `${SITE_URL}/`,
    description: SEO_DESCRIPTION,
    image: OG_IMAGE_URL,
    inLanguage: "en",
    featureList: [
      "Point of sale with barcode scanning and cash, card, mobile money or credit payment",
      "Stock ledger where every movement states its reason",
      "Debtors book with part payments and repayments",
      "Expense recording beside the day's takings",
      "Owner reports over any period, exportable as CSV",
      "Staff access codes and role-based permissions enforced in the database",
      "Printed and shareable receipts with the shop's own logo",
    ],
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      logo: { "@type": "ImageObject", url: APP_ICON_URL, width: 512, height: 512 },
    },
  };
}
