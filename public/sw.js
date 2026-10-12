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
 *   - Navigations: network first. A successful HTML response replaces the
 *     cached shell (only text/html is ever stored at /index.html — a
 *     navigation to robots.txt or the manifest must not clobber the shell
 *     with it). When the network is gone, the cached shell renders so the
 *     user sees the app instead of a browser error, and the ConnectivityBar
 *     banner says the truth about what will and will not load.
 *   - Hashed build assets (/assets/*): network first, cache on failure. The
 *     names are immutable, but freshness is cheap and correctness is not
 *     negotiable.
 *   - Fonts (Google's CDN): network first, cache on failure, in their own
 *     bucket. Checked before the same-origin gate, because these are the one
 *     cross-origin response this worker is allowed to store.
 *   - Other same-origin miscellany (manifest, icons, robots.txt): network
 *     first, cache on failure, in the runtime bucket.
 *   - Everything else cross-origin — Supabase above all — is the network's
 *     business, full stop. The worker never answers for it and never stores
 *     it: a number that cannot tell "old" from "wrong" has no place in a
 *     ledger. Offline, those requests simply fail, and the UI says so.
 *
 * There is no install-time precache. The cache starts empty and fills only
 * from successful network responses, so nothing can ever be served from a
 * cache the network has not already confirmed the shape of.
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

const SERVICE_WORKER_VERSION = "savo-pwa-v1";
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

  // Fonts from Google's CDN: network first, cached on success in their own
  // bucket so typography still renders when the network later fails. Checked
  // before the same-origin gate, because these are the one cross-origin
  // response this worker is allowed to store.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          if (fresh.ok) {
            const cache = await caches.open(FONT_CACHE);
            cache.put(request, fresh.clone());
          }
          return fresh;
        } catch {
          const cache = await caches.open(FONT_CACHE);
          const hit = await cache.match(request);
          return hit ?? Response.error();
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

  // Navigations: network first. The cache is only what a shop sees when the
  // network itself is gone — never a substitute for a fresh document.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          // Only an HTML document may replace the cached shell. A navigation
          // to a plain file (robots.txt, the manifest) is served as itself;
          // storing it under /index.html would clobber the shell with it.
          const type = fresh.headers.get("content-type") ?? "";
          if (type.includes("text/html")) {
            const cache = await caches.open(SHELL_CACHE);
            cache.put("/index.html", fresh.clone());
          }
          return fresh;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const shell =
            (await cache.match("/index.html")) ?? (await cache.match("/")) ?? Response.error();
          return shell;
        }
      })(),
    );
    return;
  }

  // Hashed build assets: network first, cache on failure. Serving a stale
  // asset from cache while a fresh one exists would defeat the point of
  // shipping updates at all.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          if (fresh.ok) {
            const cache = await caches.open(SHELL_CACHE);
            cache.put(request, fresh.clone());
          }
          return fresh;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const hit = await cache.match(request);
          return hit ?? Response.error();
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
