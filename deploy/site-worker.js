/**
 * The whole server for the Sites deployment.
 *
 * SAVO is a static single-page app: `bun run build` prerenders the shell to
 * `dist/index.html` and every runtime query goes from the browser straight to
 * Supabase. So the Worker's only job is to hand the request to the static
 * assets binding — Sites supplies `env.ASSETS` for the uploaded build, and the
 * manifest's `spa: true` makes an unknown path resolve to `index.html` instead
 * of a 404, which is what the client router needs for deep links such as
 * `/legal/privacy` or `/app/pos`.
 *
 * The one exception is the Digital Asset Links statement. Google Play's TWA
 * check fetches `/.well-known/assetlinks.json`, and the Sites uploader rejects
 * dot-directories, so the file is uploaded as `/assetlinks.json` and mapped
 * here. Without this the Play-installed package cannot be verified against the
 * origin (README, "Android").
 *
 * The other exception is the public pages' own heads. `spa: true` serves one
 * shell for every path, and that shell carries the home page's canonical link —
 * so a crawler fetching `/legal/privacy` was told it had fetched the landing
 * page. `scripts/prerender-heads.mjs` writes a copy of the shell per public
 * route with that route's own title, canonical and `og:url`; this map sends the
 * request to the copy. Paths outside the map still fall through to the SPA
 * shell, which is correct for signed-in screens (they are `noindex` anyway).
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

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === ASSETLINKS_PATH) {
      const target = new URL("/assetlinks.json", url);
      return env.ASSETS.fetch(new Request(target, request));
    }

    const method = request.method;
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const wantsStatic =
      STATIC_PAGES.has(path) || path === "/market" || path.startsWith("/shop/");
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

    return withReleaseHeaders(await env.ASSETS.fetch(request), url);
  },
};
