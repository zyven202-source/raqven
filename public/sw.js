/**
 * SAVO's service worker.
 *
 * What it is for: speed and continuity — never authority. SAVO is an
 * online-first app: every request tries the network first, and only a failed
 * attempt may touch the cache. The network is the source of truth for every
 * number a shop sees; a cached page must never be what a customer's till
 * shows when a fresher one was one request away.
 *
 * What the cache is allowed to do, in the order the fetch handler decides:
 *
 *   - Navigations: network first, with a short timeout when a cached shell
 *     exists — a dying network falls back to the shell instead of parking the
 *     till on a blank spinner. A successful HTML response replaces the
 *     cached shell (only text/html is ever stored at /index.html — a
 *     navigation to robots.txt or the manifest must not clobber the shell
 *     with it). When the network is gone, the cached shell renders so the
 *     user sees the app instead of a browser error, and the ConnectivityBar
 *     banner says the truth about what will and will not load.
 *   - Hashed build assets (/assets/*): cache first, network on a miss. The
 *     filename carries the content hash, so a URL's bytes cannot change
 *     under it — serving the stored copy on a repeat visit is what makes the
 *     second load instant, and a *new* deploy is a *new* URL that the fresh
 *     (network-first) navigation just pointed at. Old entries can never mix
 *     with new HTML: they are simply unreferenced until the next version
 *     bump clears them.
 *   - Fonts: the file URLs on fonts.gstatic.com are content-addressed, so
 *     cache first for the same reason. The stylesheet on
 *     fonts.googleapis.com can change at the same URL, so it is served
 *     stale-while-revalidate: the page paints immediately with the last
 *     approved typography, and the fresh sheet lands for the next one.
 *   - Other same-origin miscellany (manifest, icons, robots.txt): network
 *     first, cache on failure, in the runtime bucket.
 *   - Everything else cross-origin — Supabase above all — is the network's
 *     business, full stop. The worker never answers for it and never stores
 *     it: a number that cannot tell "old" from "wrong" has no place in a
 *     ledger. Offline, those requests simply fail, and the UI says so.
 *
 * There is no install-time precache. The cache starts empty and fills only
 * from successful network responses, so nothing can ever be served from a
 * cache the network has not already confirmed the shape of — and the first
 * successful navigation stores the shell, which is what the offline
 * fallback serves.
 *
 * Versioning: bump SERVICE_WORKER_VERSION whenever the caching strategy
 * changes shape — clients holding the old strategy must refresh. The old
 * caches are deleted on activate. The byte-identical build does not need a
 * bump — hashed asset names change on their own.
 *
 * Plain JavaScript on purpose: it ships from `public/` verbatim, it must
 * never be transpiled or code-split, and it must stay reviewable by anyone
 * who audits what runs on their phone with no build between them and it.
 */

const SERVICE_WORKER_VERSION = "savo-pwa-v3";

/**
 * How long a navigation waits for the network before falling back to the
 * cached shell — but only when a cached shell exists to fall back to. On a
 * first visit there is nothing in the cache, so the request is given as long
 * as the network needs; aborting it would turn a slow-but-working first load
 * into a blank error page.
 */
const NAVIGATION_TIMEOUT_MS = 4_000;
const SHELL_CACHE = `${SERVICE_WORKER_VERSION}-shell`;
const RUNTIME_CACHE = `${SERVICE_WORKER_VERSION}-runtime`;
const FONT_CACHE = `${SERVICE_WORKER_VERSION}-fonts`;

self.addEventListener("install", () => {
  // Nothing to precache: the cache starts empty and only ever holds what a
  // successful network response has put there.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, RUNTIME_CACHE, FONT_CACHE]);
      for (const name of await caches.keys()) {
        if (!keep.has(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Fonts, checked before the same-origin gate because these are the one
  // cross-origin response this worker is allowed to store — and only these
  // two hosts ever are.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    // The stylesheet URL is stable across releases, so its bytes can change:
    // paint the approved copy now, refresh it for the next visit.
    if (url.hostname === "fonts.googleapis.com") {
      event.respondWith(
        (async () => {
          const cache = await caches.open(FONT_CACHE);
          const stored = await cache.match(request);
          const refresh = fetch(request)
            .then((fresh) => {
              if (fresh.ok) void cache.put(request, fresh.clone());
              return fresh;
            })
            .catch(() => stored);
          return stored ?? (await refresh) ?? Response.error();
        })(),
      );
      return;
    }

    // Font files are content-addressed: their URL can only ever be those
    // bytes, so a stored copy is a correct copy.
    event.respondWith(
      (async () => {
        const cache = await caches.open(FONT_CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        try {
          const fresh = await fetch(request);
          if (fresh.ok) cache.put(request, fresh.clone());
          return fresh;
        } catch {
          return Response.error();
        }
      })(),
    );
    return;
  }

  // Everything else cross-origin — Supabase above all — is the network's
  // business. A shop's numbers must not be served from a cache that cannot
  // tell "old" from "wrong", so no worker here ever answers for them, online
  // or off.
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, with a short leash. The cache is only what a
  // shop sees when the network itself is gone — never a substitute for a fresh
  // document. The timeout is what keeps a dying network from parking the till
  // on a blank spinner for half a minute: once a few seconds have passed and a
  // cached shell is known to exist, the shell renders and the app's own data
  // layer keeps retrying underneath it. Without a cached shell there is
  // nothing honest to fall back to, so no timeout is applied.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const shell =
          (await cache.match("/index.html")) ?? (await cache.match("/")) ?? null;

        const canTimeOut = shell !== null && typeof AbortSignal?.timeout === "function";

        try {
          const fresh = await fetch(
            request,
            canTimeOut ? { signal: AbortSignal.timeout(NAVIGATION_TIMEOUT_MS) } : undefined,
          );
          // Only an HTML document may replace the cached shell. A navigation
          // to a plain file (robots.txt, the manifest) is served as itself;
          // storing it under /index.html would clobber the shell with it.
          const type = fresh.headers.get("content-type") ?? "";
          if (type.includes("text/html")) cache.put("/index.html", fresh.clone());
          return fresh;
        } catch {
          return shell ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Hashed build assets: cache first, network on a miss. The name contains
  // the content hash, so the stored bytes are the correct bytes forever —
  // and a deploy that changes them changes the name too, which the
  // network-first navigation above picks up before anything asks for it.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        try {
          const fresh = await fetch(request);
          if (fresh.ok) cache.put(request, fresh.clone());
          return fresh;
        } catch {
          return Response.error();
        }
      })(),
    );
    return;
  }

  // Everything else same-origin (icons, manifest, robots): network first,
  // cache on failure, in the runtime bucket.
  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(request);
        if (fresh.ok) {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, fresh.clone());
        }
        return fresh;
      } catch {
        const cache = await caches.open(RUNTIME_CACHE);
        const hit = await cache.match(request);
        return hit ?? Response.error();
      }
    })(),
  );
});
