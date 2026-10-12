/**
 * Real visitor analytics — the tracking snippet, in one place.
 *
 * A dashboard on a third party's domain can only report what its own script
 * observed, so counting visits to this site means the site itself must ship
 * the snippet. This file is that snippet: it is rendered into the document
 * head of every public page (`__root.tsx`) and re-injected from the client
 * when a visitor arrives through an in-app navigation, so the bytes the
 * browser executes and the code in this repository are the same code.
 *
 * **Provider.** PostHog (`phc_…` project API key, safe to publish — it only
 * identifies the project, never authenticates a write from the browser
 * without it). Its JavaScript web SDK captures `$pageview` on load *and* on
 * history changes (right for a single-page app), plus autocaptured clicks,
 * which is exactly "how many people came and what they pressed today".
 *
 * **`capture_pageview: "history_change"` is load-bearing.** The SDK's default
 * of `true` counts only the page a visitor landed on: its history monitor
 * starts for the string `"history_change"` or an object, and stays stopped for
 * a boolean — so a default initialisation of this SPA would report one pageview
 * no matter how many screens the visitor walked through. The verification
 * script asserts both halves: that this value is in the snippet, and that a
 * history change actually reaches the wire.
 *
 * **What is deliberately NOT tracked.** The `/app` workspace is a shop's
 * private books: product names, debtor names, sale amounts and shop ids never
 * leave the browser.
 *
 * 1. The snippet is not in the document of an `/app` route at all — the head
 *    only renders it for public paths, so a till opened at `/app/pos` never
 *    even requests the analytics host.
 * 2. A visitor who walks from the landing page into the workspace trips
 *    `before_send`, which drops every event while the current path is `/app`.
 *    Navigation events fire before any effect could react, so the guarantee
 *    lives in the hook the SDK calls on every event, not in timing.
 * 3. Leaving a private screen is remembered by the SDK and attached to the
 *    *next* event as `$prev_pageview_pathname`, so a perfectly public event
 *    can still carry the private path the visitor just left. `before_send`
 *    therefore scrubs any private path out of an event's properties, and
 *    `verify-analytics.mjs` asserts this against a real navigation rather than
 *    trusting the code to have covered it.
 *
 * Nothing here ever calls `identify`: visitors stay anonymous, no email or
 * user id is attached, and no third-party cookie is set by this code.
 */

const RAW_KEY = import.meta.env["VITE_POSTHOG_KEY"] || "";
const RAW_HOST = import.meta.env["VITE_POSTHOG_HOST"] || "https://us.i.posthog.com";

/** The snippet exists only when the project key is configured. */
export const analyticsEnabled = RAW_KEY.length > 0;

/**
 * The only paths whose traffic is anyone's business but the shop's:
 * the landing page, sign-in, and the legal pages. `/app` is the workspace.
 */
export function isTrackablePath(pathname: string): boolean {
  return !pathname.startsWith("/app");
}

/** Guard flag inside the snippet: two injections can never double-init. */
const SNIPPET_ID = "savo-analytics";

/**
 * The snippet itself, as it is written into the document.
 *
 * Deliberately readable rather than minified: it ships in the page source,
 * and anyone inspecting the site should be able to see exactly what runs.
 * It appends the SDK asynchronously (no render-blocking request) and initialises
 * on load — pageviews on first load and history changes, clicks via
 * autocapture, and `before_send` as the hard line in front of `/app`.
 */
export function analyticsSnippet(key = RAW_KEY, host = RAW_HOST): string {
  // Strip anything that could close the surrounding <script> tag early, then
  // return nothing at all when the project is not configured.
  const cleanKey = key.replace(/[^\w-]/g, "");
  const cleanHost = host.replace(/[^\w./:-]/g, "").replace(/\/+$/, "");
  if (!cleanKey || !cleanHost) return "";
  return `(function () {
  if (window.__savoAnalytics) return;
  window.__savoAnalytics = true;
  // True for a path — or an absolute URL — inside the private workspace. The
  // workspace is the shop's own books, so no event may carry one of these.
  // The pathname check below catches an event sent *while* a private screen is
  // open; this catches the residue left by *leaving* one, because the SDK
  // attaches $prev_pageview_pathname to the next event it sends — a visitor who
  // walks out of /app/pos to the sign-in page would otherwise upload the path
  // they just left.
  function isPrivatePath(value) {
    if (typeof value !== "string") return false;
    if (value === "/app" || value.indexOf("/app/") === 0) return true;
    if (value.indexOf("http://") === 0 || value.indexOf("https://") === 0) {
      try {
        var path = new URL(value).pathname;
        return path === "/app" || path.indexOf("/app/") === 0;
      } catch (error) { /* not a URL after all */ }
    }
    return false;
  }
  var script = document.createElement("script");
  script.id = "${SNIPPET_ID}";
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = "${cleanHost}/static/array.js";
  script.onload = function () {
    if (!window.posthog || window.posthog.__savoInit) return;
    window.posthog.__savoInit = true;
    window.posthog.init("${cleanKey}", {
      api_host: "${cleanHost}",
      capture_pageview: "history_change",
      before_send: function (event) {
        try {
          if (location.pathname.indexOf("/app") === 0) return null;
          var props = event && event.properties;
          if (props) {
            for (var key in props) {
              if (Object.prototype.hasOwnProperty.call(props, key) && isPrivatePath(props[key])) {
                delete props[key];
              }
            }
          }
        } catch (error) { /* pathname unreadable — let the event through */ }
        return event;
      }
    });
  };
  document.head.appendChild(script);
})();`;
}

/**
 * Inject the snippet from the client when the document did not carry it —
 * a visitor who starts inside `/app` and walks back out to the landing page
 * gets a head React created, and React-inserted inline scripts do not run.
 * This appends a real script element, which the browser does execute.
 */
export function loadAnalytics(): void {
  if (!analyticsEnabled || typeof document === "undefined") return;
  if (window.__savoAnalytics || document.getElementById(SNIPPET_ID)) return;
  const el = document.createElement("script");
  el.id = `${SNIPPET_ID}-client`;
  el.type = "text/javascript";
  el.textContent = analyticsSnippet();
  document.head.appendChild(el);
}

declare global {
  interface Window {
    /** Set by the snippet the moment it runs, so double injection is a no-op. */
    __savoAnalytics?: boolean;
    posthog?: {
      __savoInit?: boolean;
      init: (key: string, config: Record<string, unknown>) => void;
    };
  }
}
