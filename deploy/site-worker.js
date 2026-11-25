/**
 * The whole server for the Sites deployment.
 *
 * SAVO is a static single-page app: `bun run build` prerenders the shell to
 * `dist/index.html` and every runtime query goes from the browser straight to
 * Supabase. So the Worker mainly hands the request to the static assets
 * binding — Sites supplies `env.ASSETS` for the uploaded build.
 *
 * It exists because three things cannot be said in a static file:
 *
 *   1. **The Digital Asset Links statement.** Google Play's TWA check fetches
 *      `/.well-known/assetlinks.json`, and the Sites uploader rejects
 *      dot-directories, so the file is uploaded as `/assetlinks.json` and mapped
 *      here. Without this the Play-installed package cannot be verified against
 *      the origin (README, "Android").
 *
 *   2. **Each public page's own head.** `spa: true` serves one shell for every
 *      path, and that shell carries the home page's canonical link — so a
 *      crawler fetching `/legal/privacy` was told it had fetched the landing
 *      page. `scripts/prerender-heads.mjs` writes a copy of the shell per public
 *      route with that route's own title, canonical, `og:url` and crawlable
 *      body; this map sends the request to the copy.
 *
 *   3. **A real 404 and real security headers.** `spa: true` answers an unknown
 *      path with the app shell and HTTP 200, which tells a crawler that every
 *      nonsense URL is a page of this site. Here an unknown path keeps the shell
 *      (so the client router can show its own not-found screen) but is returned
 *      with status 404 and `noindex`. The headers below are set on every
 *      response, because the static asset layer sets none of them.
 */
const ASSETLINKS_PATH = "/.well-known/assetlinks.json";

/**
 * Cache headers that keep a deployment's files consistent with each other.
 *
 * Sites already answers with `max-age=0, must-revalidate`, which is correct —
 * but the two files that make a release identifiable are worth stating
 * explicitly, because getting them wrong is exactly how a phone ends up on an
 * older build:
 *
 *   - `/version.json` is the deployment's answer to "which build is live?".
 *     A cached copy would answer for yesterday, so: `no-store`.
 *   - `/sw.js` is how a corrected caching strategy reaches a phone. The worker
 *     registration also passes `updateViaCache: "none"`; this header means an
 *     ordinary fetch of the script revalidates too.
 *
 * HTML revalidates for the same reason: a document that stays cached keeps
 * pointing at asset names the next deployment has replaced.
 */
const IMMUTABLE_RELEASE_FILES = new Set(["/version.json"]);
const REVALIDATE_FILES = new Set(["/sw.js"]);

/**
 * Response headers for every request, whatever the path.
 *
 * `includeSubDomains` is deliberately absent from HSTS: `savo.freebuff.page` is
 * a host under a domain the platform shares with other tenants, and a header
 * here cannot vouch for their subdomains. The host itself is HTTPS-only, which
 * is what `max-age` asserts.
 */
const SECURITY_HEADERS = {
  "strict-transport-security": "max-age=31536000",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  // SAVO never needs to be framed by another origin. SAMEORIGIN rather than
  // DENY because the app itself may print or preview its own documents.
  "x-frame-options": "SAMEORIGIN",
  "cross-origin-opener-policy": "same-origin-allow-popups",
  // Barcode scanning uses the camera and the market page can ask for a
  // location; nothing else is requested by the app.
  "permissions-policy": "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()",
};

/**
 * The application's own origins.
 *
 * Everything listed is used by code that ships in this app: Supabase for data
 * and auth (including its realtime WebSocket), Google Tag Manager and Analytics
 * as declared on the root route, Google Fonts for the two typefaces, PostHog
 * when a key is configured, Unsplash for the marketing photography, and
 * jsDelivr/the imgly CDN for the Studio background-removal runtime, which is
 * fetched on first use rather than bundled.
 */
const CSP_DIRECTIVES = {
  "default-src": "'self'",
  "script-src":
    "'self' 'unsafe-inline' 'wasm-unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://us-assets.i.posthog.com https://cdn.jsdelivr.net https://static.cloudflareinsights.com",
  "style-src": "'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src": "'self' data: https://fonts.gstatic.com",
  "img-src":
    "'self' data: blob: https://*.supabase.co https://images.unsplash.com https://www.google-analytics.com https://www.googletagmanager.com",
  "connect-src":
    "'self' https://*.supabase.co wss://*.supabase.co https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://us.i.posthog.com https://cloudflareinsights.com https://cdn.jsdelivr.net https://staticimgly.com https://imgly.com",
  "worker-src": "'self' blob:",
  "frame-src": "'self' https://www.googletagmanager.com",
  "media-src": "'self' blob:",
  "object-src": "'none'",
  "base-uri": "'self'",
  "form-action": "'self'",
  "frame-ancestors": "'self'",
  "upgrade-insecure-requests": "",
};

const CSP_POLICY = Object.entries(CSP_DIRECTIVES)
  .map(([name, value]) => (value ? `${name} ${value}` : name))
  .join("; ");

/**
 * Pages whose CSP is enforced rather than reported.
 *
 * They are the ones a signed-out visitor can load and the ones that were
 * exercised in a browser against this policy. The signed-in application is
 * report-only for now: its screens cannot be reached without an account, and a
 * policy nobody has watched work should not be able to lock a shop out of its
 * till. Promoting it is a one-line change here once its console is clean.
 */
const ENFORCED_CSP_PAGES = new Set([
  "/",
  "/features",
  "/pricing",
  "/about",
  "/support",
  "/market",
  "/legal/privacy",
  "/legal/terms",
  "/legal/refunds",
  "/auth/login",
  "/auth/signup",
  "/auth/forgot-password",
  "/auth/reset-password",
]);

/** Public routes with a static head, kept in step with `prerender-heads.mjs`. */
const STATIC_PAGES = new Set([
  "/auth/forgot-password",
  "/auth/login",
  "/auth/reset-password",
  "/auth/signup",
  "/legal/privacy",
  "/legal/refunds",
  "/legal/terms",
  "/pricing",
  "/features",
  "/about",
  "/support",
  "/market",
]);

/**
 * The first path segment of every client route, from `src/routes`.
 *
 * A path outside these is not a page of this site, so it is answered with a
 * 404 instead of the shell's usual 200. Deeper paths under a known segment
 * (a shop slug, an order, a list token) are left to the router, which knows
 * whether that particular record exists.
 */
const KNOWN_SEGMENTS = new Set([
  "about",
  "account",
  "admin",
  "api",
  "app",
  "auth",
  "dashboard",
  "features",
  "legal",
  "list",
  "market",
  "onboarding",
  "pricing",
  "shop",
  "support",
]);

const isAppRoute = (path) => path === "/" || KNOWN_SEGMENTS.has(path.split("/")[1] ?? "");

function withReleaseHeaders(response, url) {
  if (!response) return response;
  const headers = new Headers(response.headers);
  const contentType = headers.get("content-type") ?? "";

  if (IMMUTABLE_RELEASE_FILES.has(url.pathname)) {
    headers.set("cache-control", "no-store");
  } else if (REVALIDATE_FILES.has(url.pathname)) {
    headers.set("cache-control", "no-cache, must-revalidate");
  } else if (contentType.includes("text/html")) {
    headers.set("cache-control", "no-cache, must-revalidate");
  }

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }

  if (contentType.includes("text/html") && response.status === 200) {
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const header = ENFORCED_CSP_PAGES.has(path)
      ? "content-security-policy"
      : "content-security-policy-report-only";
    headers.set(header, CSP_POLICY);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === ASSETLINKS_PATH) {
      const target = new URL("/assetlinks.json", url);
      return withReleaseHeaders(await env.ASSETS.fetch(new Request(target, request)), url);
    }

    const method = request.method;
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const wantsStatic = STATIC_PAGES.has(path) || path === "/market" || path.startsWith("/shop/");
    if ((method === "GET" || method === "HEAD") && wantsStatic) {
      const page = new URL(`${path}.html`, url);
      const response = await env.ASSETS.fetch(new Request(page, request));
      // A missing file would be answered with the SPA shell by the assets
      // binding, which is exactly what this branch is trying to avoid; only a
      // real HTML file is accepted, and anything else falls through. Shop and
      // product pages exist only while published; the build writes them.
      if (response.ok && response.headers.get("content-type")?.includes("text/html")) {
        return withReleaseHeaders(response, url);
      }
    }

    const response = await env.ASSETS.fetch(request);
    const isHtml = response.headers.get("content-type")?.includes("text/html");
    if (response.ok && isHtml && (method === "GET" || method === "HEAD") && !isAppRoute(path)) {
      // Keep the shell so the client router can render its not-found screen,
      // but state the truth in the protocol: there is no page at this URL.
      const headers = new Headers(response.headers);
      headers.set("x-robots-tag", "noindex");
      return withReleaseHeaders(
        new Response(response.body, { status: 404, statusText: "Not Found", headers }),
        url,
      );
    }

    return withReleaseHeaders(response, url);
  },
};
