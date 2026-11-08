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

/** Public routes with a static head, kept in step with `prerender-heads.mjs`. */
const STATIC_PAGES = new Set([
  "/auth/forgot-password",
  "/auth/login",
  "/auth/reset-password",
  "/auth/signup",
  "/legal/privacy",
  "/legal/refunds",
  "/legal/terms",
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
    if ((method === "GET" || method === "HEAD") && STATIC_PAGES.has(path)) {
      const page = new URL(`${path}.html`, url);
      const response = await env.ASSETS.fetch(new Request(page, request));
      // A missing file would be answered with the SPA shell by the assets
      // binding, which is exactly what this branch is trying to avoid; only a
      // real HTML file is accepted, and anything else falls through.
      if (response.ok && response.headers.get("content-type")?.includes("text/html")) {
        return response;
      }
    }

    return env.ASSETS.fetch(request);
  },
};
