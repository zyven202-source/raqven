import { useCallback, useEffect, useState } from "react";

import { BUILD_ID, HAS_BUILD_ID } from "@/lib/build";

/**
 * Service-worker lifecycle, in one hook.
 *
 * Registration happens in production builds only. A service worker in the dev
 * server is pure friction: it caches HMR responses and serves stale modules
 * against a server that has moved on, and no shop ever runs the dev server.
 *
 * Three pieces of state come back:
 *
 *   - `updateReady` — a waiting worker exists. `applyUpdate()` tells it to
 *     skip waiting and reloads, which is the only honest way to ship an
 *     update to a cash-register: the owner taps "Update now", the page
 *     reloads, and the new version is running. No silent swap underneath a
 *     half-entered sale.
 *   - `online` — connectivity, **probe-confirmed**. The browser's own
 *     signals (navigator.onLine and the online/offline events) are treated
 *     as suspicion only: Chromium fires spurious offline events on Wi-Fi↔mobile
 *     handoffs, captive-portal flags and VPN toggles, and a backgrounded PWA
 *     can miss the recovery event entirely — and either lie pins a false
 *     "Offline" tag over a till that is working. The flag never reaches the
 *     UI on its own; it only triggers a real HEAD request to our own origin,
 *     and the banner shows only while that request actually fails. While
 *     offline the hook keeps probing — on a short timer, on visibility, on
 *     the recovery event — so the banner clears the moment the network
 *     answers.
 *
 * In dev, or where service workers are unavailable (http:// origins that are
 * not localhost, old WebViews), the hook still probe-checks connectivity and
 * never offers an update — which is the truth about that environment.
 */
/** How often a confirmed-offline app re-tests the network. */
const REPROBE_INTERVAL_MS = 10_000;
/** How often a live tab re-reads the published release id. */
const BUILD_CHECK_INTERVAL_MS = 5 * 60_000;
/** Ignore focus-driven checks that arrive moments after the previous one. */
const BUILD_CHECK_MIN_GAP_MS = 30_000;

/**
 * The release the server says is live right now, or null if it cannot be read.
 *
 * `no-store` and a cache-busting query on purpose: this answer is only useful
 * if it is the deployment's current statement, never a copy from an hour ago.
 * A missing `/version.json` comes back as the SPA shell, whose JSON parse
 * fails — that is a null, not a false "update available".
 */
async function fetchPublishedBuildId(): Promise<string | null> {
  try {
    const response = await fetch(`/version.json?b=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;
    const info = (await response.json()) as { buildId?: unknown };
    return typeof info?.buildId === "string" ? info.buildId : null;
  } catch {
    return null;
  }
}
/** A probe slower than this has not proven reachability; treat as offline. */
const PROBE_TIMEOUT_MS = 8_000;

/**
 * Ask the wire itself, not the browser's opinion of it. HEAD on our own
 * origin with every cache bypassed: non-GET requests never reach the service
 * worker (it handles GET only), so this is answered by the network or not at
 * all — any response of any status proves the wire is live, a rejection
 * proves it is not. Same-origin on purpose: the app's connectivity answer
 * must not depend on a third party being reachable.
 */
async function probeNetwork(): Promise<boolean> {
  try {
    // AbortSignal.timeout needs a guard for engines without it (old WebViews);
    // exactOptionalPropertyTypes forbids passing `signal: undefined`, so the
    // init object is built twice rather than conditionally nulled.
    await fetch(
      `/?connectivity-probe=${Date.now()}`,
      typeof AbortSignal.timeout === "function"
        ? { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) }
        : { method: "HEAD", cache: "no-store" },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Probe-confirmed connectivity on its own, with no service-worker or sync
 * side effects — for screens that only need to know whether the figures on
 * screen can still be refreshed (SAVO Pulse labels its numbers live or
 * stale-with-timestamp accordingly).
 *
 * Deliberately separate from `useServiceWorker`: importing that hook to read
 * `online` would run the registration effect a second time, and importing
 * `useOfflineSync` would start a second sync loop. This is just the probe.
 */
export function useOnlineStatus(): boolean {
  // Optimistic start: the network is assumed present until a probe proves
  // otherwise. Seeding from navigator.onLine is exactly what pinned a
  // permanent "Offline" tag above a working till.
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    let inFlight = false;

    const recheck = async () => {
      if (inFlight) return; // a probe is already deciding; the next one follows
      inFlight = true;
      const reachable = await probeNetwork();
      inFlight = false;
      if (disposed) return;
      setOnline(reachable);
      if (timer !== undefined) window.clearTimeout(timer);
      // Only a confirmed-offline app keeps polling, so a recovery event a
      // backgrounded PWA misses cannot strand the banner on screen.
      if (!reachable) timer = window.setTimeout(recheck, REPROBE_INTERVAL_MS);
    };

    const onSuspicion = () => void recheck();
    const onVisible = () => {
      if (document.visibilityState === "visible") void recheck();
    };

    window.addEventListener("offline", onSuspicion);
    window.addEventListener("online", onSuspicion);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    void recheck(); // confirm the state we optimistically assumed

    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener("offline", onSuspicion);
      window.removeEventListener("online", onSuspicion);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  return online;
}

export function useServiceWorker() {
  const [updateReady, setUpdateReady] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const online = useOnlineStatus();

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;
    let registration: ServiceWorkerRegistration | null = null;

    const onStateChange = (event: Event) => {
      const worker = event.target as ServiceWorker;
      // A waiting worker with a controller present means an update is ready:
      // a first install never has a controller, and must not ask anything.
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        setUpdateReady(true);
      }
    };

    void navigator.serviceWorker
      // `updateViaCache: "none"` keeps the worker script itself revalidated:
      // a phone must be able to discover a corrected caching strategy instead
      // of trusting an HTTP copy of yesterday's worker.
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        if (cancelled) return;
        registration = reg;
        if (reg.waiting) {
          setWaitingWorker(reg.waiting);
          setUpdateReady(true);
        }
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", onStateChange);
        });
      })
      .catch(() => {
        /* Registration is a progressive enhancement; without it the app still works online. */
      });

    return () => {
      cancelled = true;
      registration = null;
    };
  }, []);

  /**
   * Is this page still the published build?
   *
   * The lifecycle events above only fire when the *worker script* changes,
   * and it deliberately does not change between ordinary releases — so on
   * their own they can never notice a new build. This compares the id baked
   * into this bundle with the id the server is serving. It runs on load, when
   * the tab becomes visible again (a phone picked up after lunch), and on a
   * slow timer for tabs left open all day.
   *
   * A build with no injected id cannot prove it is stale, so it stays quiet
   * rather than nagging with a banner it cannot justify.
   */
  useEffect(() => {
    if (!import.meta.env.PROD || !HAS_BUILD_ID) return;

    let disposed = false;
    let lastCheck = 0;

    const check = async () => {
      if (disposed) return;
      lastCheck = Date.now();
      const published = await fetchPublishedBuildId();
      if (disposed || published === null) return;
      if (published !== BUILD_ID) setUpdateReady(true);
    };

    // Not during first paint: the shop's own numbers come first.
    const initial = window.setTimeout(() => void check(), 2_000);
    const timer = window.setInterval(() => void check(), BUILD_CHECK_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastCheck < BUILD_CHECK_MIN_GAP_MS) return;
      void check();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      disposed = true;
      window.clearTimeout(initial);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    if (waitingWorker) {
      waitingWorker.postMessage("SKIP_WAITING");
      waitingWorker.addEventListener("statechange", (event) => {
        if ((event.target as ServiceWorker).state === "activated") window.location.reload();
      });
      return;
    }
    window.location.reload();
  }, [waitingWorker]);

  const dismissUpdate = useCallback(() => {
    setUpdateReady(false);
  }, []);

  return { online, updateReady, applyUpdate, dismissUpdate };
}
