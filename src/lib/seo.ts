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
 * `offers`, no `keywords` meta. The first three are priced claims: this product
 * has no published ratings and no billing integration, and inventing either is
 * both dishonest and something Google penalises. `keywords` has been ignored by
 * every engine that matters for two decades, so listing our own search terms
 * would only advertise what we hope to rank for. Every property below is a fact
 * about the application that can be demonstrated from the code.
 */

/** Absolute origin. Open Graph and JSON-LD both reject relative URLs. */
/**
 * The canonical origin.
 *
 * This was `ravqen.freebuff.app` — the old app's host, which now answers 404.
 * Every absolute URL the product publishes (canonical link, Open Graph,
 * JSON-LD `url`, the sitemap, the robots entry, and the Play listing's privacy
 * and account-deletion links) is built from this one constant, so leaving the
 * dead host here meant all of them pointed at a page that does not exist.
 */
export const SITE_URL = "https://savo.freebuff.app";

/** The one term a shop owner in Kenya would actually type to find this. */
export const PRIMARY_KEYWORD = "Kenyan shop POS";

export const SITE_NAME = "SAVO";

export const SITE_TAGLINE = "Every sale. Every stock. Every number.";

/** 51 characters — inside the ~60 a search result will show in full. */
export const SEO_TITLE = "SAVO — Kenyan Shop POS with Stock, Debtors & M-Pesa";

/** 147 characters — inside the ~150 a search result will show before truncating. */
export const SEO_DESCRIPTION =
  "Kenyan shop POS and stock book in one: record sales, take M-Pesa, track stock, " +
  "chase debtors and log expenses from an Android phone at the counter.";

/**
 * The home page's `<h1>`: the primary keyword, phrased as a sentence rather
 * than stuffed into one. A heading exists to be read first and indexed second.
 */
export const HOME_HEADLINE = "The Kenyan shop POS that keeps every sale, stock and number.";

/** The square app icon, which is the only large image the product ships. */
export const OG_IMAGE_URL = `${SITE_URL}/icon-512.png`;
export const OG_IMAGE_ALT = "The SAVO app icon: the champagne Savo mark on a deep emerald tile.";

/** Every meta descriptor the home page needs, in the order crawlers read them. */
export const HOME_META = [
  { title: SEO_TITLE },
  { name: "description", content: SEO_DESCRIPTION },
  {
    name: "robots",
    content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  },
  { name: "application-name", content: SITE_NAME },
  { property: "og:site_name", content: SITE_NAME },
  { property: "og:title", content: SEO_TITLE },
  { property: "og:description", content: SEO_DESCRIPTION },
  { property: "og:type", content: "website" },
  { property: "og:url", content: `${SITE_URL}/` },
  { property: "og:locale", content: "en_KE" },
  { property: "og:image", content: OG_IMAGE_URL },
  { property: "og:image:type", content: "image/png" },
  { property: "og:image:width", content: "512" },
  { property: "og:image:height", content: "512" },
  { property: "og:image:alt", content: OG_IMAGE_ALT },
  // `summary`, not `summary_large_image`: the only image the product has is
  // square, and a square stretched into a 1.91:1 card is cropped to a slice of
  // the mark. A small correct thumbnail beats a large wrong one.
  { name: "twitter:card", content: "summary" },
  { name: "twitter:title", content: SEO_TITLE },
  { name: "twitter:description", content: SEO_DESCRIPTION },
  { name: "twitter:image", content: OG_IMAGE_URL },
  { name: "twitter:image:alt", content: OG_IMAGE_ALT },
] as const;

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
    inLanguage: "en-KE",
    areaServed: { "@type": "Country", name: "Kenya" },
    featureList: [
      "Point of sale with barcode scanning and cash, M-Pesa, card or credit payment",
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
      logo: { "@type": "ImageObject", url: OG_IMAGE_URL, width: 512, height: 512 },
    },
  };
}
