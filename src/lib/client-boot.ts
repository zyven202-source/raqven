/**
 * The tiny script that runs from the HTML, before (and without) the app bundle.
 *
 * Why it has to exist at all: every other piece of recovery lives inside the
 * JavaScript bundle, so it can only run once that bundle has loaded. A phone
 * holding an older cached shell whose chunks have already been replaced by a
 * deployment has the opposite problem — the HTML arrives, the chunk 404s, and
 * nothing ever mounts. The app cannot repair itself, and because service-worker
 * registration was also in the bundle, the corrected worker could never install
 * either. That is the permanent blank screen.
 *
 * This script is inlined into the document head by the root route, so it runs
 * from the served HTML alone:
 *
 *   1. It registers `/sw.js` (and asks it to update) immediately, so a client
 *      stuck on an older worker still picks up the current one.
 *   2. It watches for a failed `/assets/*.js` load — the exact signature of a
 *      page whose shell and chunks disagree — and clears the caches that hold
 *      the stale shell, then reloads once.
 *
 * The one-shot guard (60 seconds, in sessionStorage) is what keeps this a
 * recovery rather than a reload loop: if the chunk is still missing on the next
 * attempt, the deployment or the network is the problem and the honest error
 * must be shown instead of an endless refresh.
 *
 * Plain string on purpose: it is serialised into the prerendered HTML and must
 * not depend on any module, polyfill or build output to run.
 */
export const CLIENT_BOOT_SCRIPT = `
(function () {
  var RECOVERY_KEY = "savo:shell-recovery";
  var RECOVERY_MIN_GAP_MS = 60000;

  try {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then(function (registration) {
          return registration.update();
        })
        .catch(function () {
          /* Progressive enhancement: without it the app still works online. */
        });
    }
  } catch (error) {
    /* Old WebView or blocked storage: nothing to do here. */
  }

  function recover() {
    var lastAttempt = 0;
    try {
      lastAttempt = Number(sessionStorage.getItem(RECOVERY_KEY) || 0);
    } catch (error) {
      lastAttempt = 0;
    }
    if (lastAttempt && Date.now() - lastAttempt < RECOVERY_MIN_GAP_MS) return;

    if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;

    try {
      sessionStorage.setItem(RECOVERY_KEY, String(Date.now()));
    } catch (error) {
      /* Private mode: the in-memory attempt below still bounds the loop. */
    }

    if (!window.caches) {
      window.location.reload();
      return;
    }

    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys.map(function (key) {
            return caches.delete(key);
          }),
        );
      })
      .then(function () {
        window.location.reload();
      })
      .catch(function () {
        window.location.reload();
      });
  }

  // Capture phase: resource load failures do not bubble, and a failed module
  // script is reported on the script element rather than the window.
  window.addEventListener(
    "error",
    function (event) {
      var target = event.target;
      if (!target || target.tagName !== "SCRIPT") return;
      var src = target.src || "";
      if (src.indexOf("/assets/") === -1) return;
      recover();
    },
    true,
  );
})();
`.trim();
