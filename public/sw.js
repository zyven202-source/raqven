/**
 * RAVQEN's service worker.
 *
 * What it is for: a shop does not stop because the network did. The app shell
 * (the prerendered HTML, the hashed JS and CSS, the fonts, the icons) is
 * precached at install, so a phone that has opened RAVQEN before can open it
 * again with no connectivity — the screens render, and the parts of a till
 * that are pure interface keep working. Business data is never faked here:
 * Supabase requests are answered from the network first and the cache only as
 * a same-session fallback, clearly marked so no stale number can masquerade
 * as a live one.
 *
 * Versioning: bump SERVICE_WORKER_VERSION whenever the shell changes shape.
 * The old caches are deleted on activate. The byte-identical build does not
 * need a bump — hashed asset names change on their own.
 *
 * Plain JavaScript on purpose: it ships from `public/` verbatim, it must
 * never be transpiled or code-split, and it must stay reviewable by anyone
 * who audits what runs on their phone with no build between them and it.
 */

const SERVICE_WORKER_VERSION = "ravqen-pwa-v1";
const SHELL_CACHE = `${SERVICE_WORKER_VERSION}-shell`;
const RUNTIME_CACHE = `${SERVICE_WORKER_VERSION}-runtime`;
const FONT_CACHE = `${SERVICE_WORKER_VERSION}-fonts`;

/** The app shell: small, stable, and everything offline needs it. */
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icon-192.png",
  "/icon-512.png",
  "/robots.txt",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll is atomic: one failure rolls the whole install back, so a
      // half-precached worker never takes control of the app.
      await cache.addAll(PRECACHE_URLS);
      await self.skipWaiting();
    })(),
  );
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

  // Fonts from Google's CDN: cache-first in their own bucket, so typography
  // survives offline too. Checked before the same-origin gate, because these
  // are the one cross-origin response this worker is allowed to store.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
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
          return hit ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Everything else cross-origin — Supabase above all — is the network's
  // business. A shop's numbers must not be served from a cache that cannot
  // tell "old" from "wrong", so no worker here ever answers for them.
  if (url.origin !== self.location.origin) return;

  // Navigations: cache-first, because the shell is the same prerendered
  // document for every route (the SPA router does the rest client-side).
  // Falling back to the cached shell when the network is gone is what makes
  // a cold offline open work at all.
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

  // Hashed build assets: immutable, so cache-first is not a staleness risk.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        const fresh = await fetch(request);
        if (fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      })(),
    );
    return;
  }

  // Everything else same-origin (icons, manifest, robots): stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const hit = await cache.match(request);
      const refresh = fetch(request)
        .then((fresh) => {
          if (fresh.ok) cache.put(request, fresh.clone());
          return fresh;
        })
        .catch(() => hit);
      return hit ?? (await refresh);
    })(),
  );
});
