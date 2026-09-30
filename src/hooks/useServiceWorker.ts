import { useCallback, useEffect, useState } from "react";

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
 *   - `online` — the browser's connectivity. The UI renders an offline
 *     banner from it.
 *
 * In dev, or where service workers are unavailable (http:// origins that are
 * not localhost, old WebViews), the hook is a no-op that reports online and
 * never offers an update — which is the truth about that environment.
 */
export function useServiceWorker() {
  const [updateReady, setUpdateReady] = useState(false);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

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
      .register("/sw.js", { scope: "/" })
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
