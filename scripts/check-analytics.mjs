/**
 * Sanity check for the visitor-analytics snippet builder.
 *
 * The snippet ships inside the page's HTML, so it must parse as JavaScript
 * before it ever reaches a browser, must not be able to break out of its
 * <script> tag, and must contain the two guarantees it exists for: the
 * before_send line in front of /app, and no output at all when the project
 * key is missing.
 */
import { analyticsSnippet, isTrackablePath } from "../src/lib/analytics.ts";

let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const snippet = analyticsSnippet("phc_TEST123", "https://us.i.posthog.com");
check("a configured project produces a snippet", snippet.length > 0);
check(
  "it loads the SDK from the configured host",
  snippet.includes("https://us.i.posthog.com/static/array.js"),
);
check("it initialises with the project key", snippet.includes('posthog.init("phc_TEST123"'));
check(
  "it drops every event on /app paths",
  snippet.includes('location.pathname.indexOf("/app") === 0') && snippet.includes("return null"),
);
check("it guards against double injection", snippet.includes("window.__savoAnalytics"));
// PostHog's history monitor stays stopped for a boolean `capture_pageview`,
// so the default would count only the landing page of this SPA.
check(
  "SPA route changes are counted (capture_pageview is history_change)",
  snippet.includes('capture_pageview: "history_change"'),
);
// The SDK hangs $prev_pageview_pathname off the event sent *after* a private
// screen, so dropping events sent while on /app is not by itself enough.
check(
  "a private path remembered by the next event is scrubbed",
  snippet.includes("isPrivatePath") && snippet.includes("delete props[key]"),
);

let parses = true;
let parseError = "";
try {
  new Function(snippet);
} catch (error) {
  parses = false;
  parseError = String(error);
}
check("the snippet is valid JavaScript", parses, parseError);

const hostile = analyticsSnippet(
  'phc_X"></script><script>alert(1)</script>',
  "https://us.i.posthog.com/x?y=1</script>",
);
check("a hostile key cannot escape the tag", !hostile.includes("</script"), hostile.slice(0, 120));
check("an unconfigured project renders nothing", analyticsSnippet("", "") === "");
check("no key in the ambient environment renders nothing", analyticsSnippet() === "");

check("/app paths are private", !isTrackablePath("/app") && !isTrackablePath("/app/pos"));
check(
  "public paths are tracked",
  isTrackablePath("/") && isTrackablePath("/auth/login") && isTrackablePath("/legal/privacy"),
);

console.log(failed === 0 ? "\nall checks passed" : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
