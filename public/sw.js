/**
 * SAVO's service worker.
 *
 * What it is for: speed and continuity — never authority. SAVO is an
 * online-first app: every request tries the network first, and only a failed
 * attempt may touch the cache. The network is the source of truth for every
 * number a shop sees; a cached page must never be what a customer's till
 * shows when a fresher one was one request away.
 *
 * ## What went wrong in v3 (and must not come back)
 *
 * v3 gave every navigation a four-second leash and then answered with the
 * cached shell. On a slow mobile network that is a normal load time, so a
 * phone online and working was handed the *previous* release's HTML. Because
 * v3 also kept every hashed chunk it had ever seen in one cache named for the
 * strategy rather than for the build, that old HTML found its old chunks and
 * rendered completely — the app really did go back a version, and a reload
 * could bring back a third one. v3's own bytes never changed between releases,
 * so no new worker ever installed and nothing ever offered an update.
 *
 * v4 removes the cause rather than the symptom:
 *
 *   - Navigations are network-first with **no timeout**. The cached shell is
 *     used only when the fetch itself rejects — that is, the network is gone.
 *     Being slow is not being offline.
 *   - Every cache is namespaced by the release id from `/version.json`, the
 *     same id the running bundle carries. A shell from an earlier build can
 *     never be matched against this build's cache, so it cannot be served as
 *     if it were current.
 *   - The previous release's caches are kept until the following release, so
 *     a tab that is still open finishes its lazy chunks; assets that are
 *     missing from both fall through to the app's stale-chunk recovery, which
 *     reloads once into the current build.
 *
 * ## What the cache is allowed to do
 *
 *   - Navigations: network first, cached shell only when the network fails.
 *     Only `text/html` may replace the stored shell (a navigation to
 *     robots.txt must not clobber it).
 *   - Hashed build assets (`/assets/*`): cache first within this build's
 *     cache. The filename carries the content hash, so the bytes are correct
 *     forever; a new deploy is a new name the fresh navigation points at.
 *     On a miss the network is asked; if that fails or 404s (a tab from the
 *     previous build asking for a chunk that has been replaced), the previous
 *     build's cache is consulted before giving up.
 *   - Fonts: content-addressed files cache first; the Google stylesheet is
 *     stale-while-revalidate because its URL is stable across releases.
 *   - Other same-origin miscellany (manifest, icons, robots.txt): network
 *     first, cache on failure.
 *   - Everything else cross-origin — Supabase above all — is the network's
 *     business, full stop. Offline those requests fail, and the UI says so.
 *
 * There is no install-time precache and no timeout-triggered fallback, so the
 * cache can never be served on the strength of the network merely being slow.
 *
 * Plain JavaScript on purpose: it ships from `public/` verbatim, it must never
 * be transpiled or code-split, and it must stay reviewable by anyone who
 * audits what runs on their phone with no build between them and it.
 */

/** Bump when the caching strategy changes shape. */
const SERVICE_WORKER_VERSION = "savo-pwa-v4";

const BUILD_INFO_URL = "/version.json";
const BUILD_TAG_PATTERN = /^[A-Za-z0-9._+-]{1,64}$/;
/** How long a resolved build tag is trusted before asking again. */
const BUILD_TAG_TTL_MS = 60_000;

const META_CACHE = `${SERVICE_WORKER_VERSION}-meta`;
const META_BUILDS_KEY = "/builds";

/** Resolved release id, and when it was resolved. */
let resolvedTag = null;
let resolvedAt = 0;

function cacheNames(tag) {
  return {
    shell: `${SERVICE_WORKER_VERSION}-${tag}-shell`,
    runtime: `${SERVICE_WORKER_VERSION}-${tag}-runtime`,
    fonts: `${SERVICE_WORKER_VERSION}-${tag}-fonts`,
  };
}

/**
 * The release currently published at our origin.
 *
 * `/version.json` is written by every build and served with `no-store`, so this
 * is the deployment's own statement about itself. If it cannot be read we keep
 * the last known tag rather than inventing one: an unknown tag is a separate,
 * still-safe namespace.
 */
async function currentBuildTag() {
  const now = Date.now();
  if (resolvedTag !== null && now - resolvedAt < BUILD_TAG_TTL_MS) return resolvedTag;

  let tag = resolvedTag ?? "unknown";
  try {
    const response = await fetch(`${BUILD_INFO_URL}?t=${now}`, { cache: "no-store" });
    if (response.ok) {
      const info = await response.json();
      if (typeof info?.buildId === "string" && BUILD_TAG_PATTERN.test(info.buildId)) {
        tag = info.buildId;
      }
    }
  } catch {
    /* Offline or blocked: keep the last tag we knew. */
  }

  resolvedTag = tag;
  resolvedAt = now;
  return tag;
}

/**
 * Remembers this build and keeps exactly two generations of caches: the
 * current release and the one before it. The older generation is what lets a
 * tab opened before the deploy finish loading its lazy chunks; anything older
 * is unreachable and is deleted.
 */
async function pruneCaches(tag) {
  const meta = await caches.open(META_CACHE);
  const stored = await meta.match(META_BUILDS_KEY);
  let history = [];
  if (stored) {
    const parsed = await stored.json().catch(() => []);
    if (Array.isArray(parsed)) history = parsed.filter((entry) => typeof entry === "string");
  }

  history = history.filter((entry) => entry !== tag);
  history.push(tag);
  const keepTags = history.slice(-2);

  await meta.put(
    META_BUILDS_KEY,
    new Response(JSON.stringify(keepTags), { headers: { "content-type": "application/json" } }),
  );

  const keep = new Set([META_CACHE]);
  for (const keptTag of keepTags) {
    const names = cacheNames(keptTag);
    keep.add(names.shell);
    keep.add(names.runtime);
    keep.add(names.fonts);
  }

  for (const name of await caches.keys()) {
    // Anything from an older strategy (savo-pwa-v3-*) or an unreachable build.
    if (!keep.has(name)) await caches.delete(name);
  }
}

/** Looks in other builds' shell caches — used only when this build misses. */
async function matchInOtherBuilds(request, currentShellName) {
  for (const name of await caches.keys()) {
    if (name === currentShellName || !name.endsWith("-shell")) continue;
    const cache = await caches.open(name);
    const hit = await cache.match(request);
    if (hit) return hit;
  }
  return null;
}

self.addEventListener("install", () => {
  // Nothing to precache: the cache only ever holds what a successful network
  // response has put there. This worker is release-agnostic (it reads the
  // release id at runtime), so activating it immediately is safe and is what
  // gets the corrected strategy onto phones that are still running v3.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const tag = await currentBuildTag();
      await pruneCaches(tag);
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
  // cross-origin response this worker may store — and only these hosts.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    if (url.hostname === "fonts.googleapis.com") {
      // Stable URL, changeable bytes: paint the stored copy, refresh for later.
      event.respondWith(
        (async () => {
          const tag = await currentBuildTag();
          const cache = await caches.open(cacheNames(tag).fonts);
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

    event.respondWith(
      (async () => {
        const tag = await currentBuildTag();
        const cache = await caches.open(cacheNames(tag).fonts);
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

  // Everything cross-origin — Supabase above all — is the network's business.
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, with no leash at all. A slow network is still
  // a working network, and serving a previous release because this one took
  // four seconds is precisely the bug this version exists to remove.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const tag = await currentBuildTag();
        const shellName = cacheNames(tag).shell;
        const cache = await caches.open(shellName);

        try {
          const fresh = await fetch(request);
          if (fresh.ok) {
            const type = fresh.headers.get("content-type") ?? "";
            if (type.includes("text/html")) {
              await cache.put("/index.html", fresh.clone());
              // A fresh shell means this release is live: drop generations
              // older than the previous one.
              void pruneCaches(tag);
            }
          }
          return fresh;
        } catch {
          // The network is genuinely gone: the shell is all we can honestly
          // offer, and the app's connectivity banner says so.
          const shell = (await cache.match("/index.html")) ?? (await cache.match("/"));
          if (shell) return shell;
          const previous = await matchInOtherBuilds("/index.html", shellName);
          return previous ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Hashed build assets: cache first within this build.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      (async () => {
        const tag = await currentBuildTag();
        const shellName = cacheNames(tag).shell;
        const cache = await caches.open(shellName);

        const hit = await cache.match(request);
        if (hit) return hit;

        let fresh = null;
        try {
          fresh = await fetch(request);
          if (fresh.ok) {
            cache.put(request, fresh.clone());
            return fresh;
          }
        } catch {
          fresh = null;
        }

        // Missing here or rejected by the network: a tab opened before the
        // deploy may still need this chunk from the previous release.
        const previous = await matchInOtherBuilds(request, shellName);
        if (previous) return previous;
        return fresh ?? Response.error();
      })(),
    );
    return;
  }

  // Everything else same-origin (icons, manifest, robots): network first,
  // cache on failure.
  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(request);
        if (fresh.ok) {
          const tag = await currentBuildTag();
          const cache = await caches.open(cacheNames(tag).runtime);
          cache.put(request, fresh.clone());
        }
        return fresh;
      } catch {
        const tag = await currentBuildTag();
        const cache = await caches.open(cacheNames(tag).runtime);
        const hit = await cache.match(request);
        return hit ?? Response.error();
      }
    })(),
  );
});
