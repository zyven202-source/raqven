/**
 * The analytics session: one visitor id, one open session, one queue.
 *
 * This is deliberately small and defensive. Tracking is the least important
 * thing the app does, so every function here swallows its own failure and
 * returns — a refused analytics write must never break a sale, a sign-in, or a
 * page render. When storage is blocked (Safari private mode, a full disk) the
 * ids fall back to memory for the life of the tab, which still produces a
 * session, just not a returning visitor.
 *
 * Nothing personal is sent: no email, no phone, no product name, no amount.
 * A shop id is attached only when the caller passes one for a shop the caller
 * belongs to, and the database re-checks that membership itself.
 */
import {
  ANALYTICS_EVENTS,
  startAnalyticsSession,
  trackAnalyticsEvent,
  recordAnalyticsError,
  type AnalyticsEventName,
  type AnalyticsProperties,
} from "@/services/analytics.service";

const VISITOR_KEY = "savo.analytics.visitor";
const SESSION_KEY = "savo.analytics.session";
const OPENED_KEY = "savo.analytics.opened";

let visitorId: string | null = null;
let sessionId: string | null = null;
let initPromise: Promise<void> | null = null;
let flushing = false;

const queue: Array<{
  name: AnalyticsEventName;
  shopId?: string;
  properties?: AnalyticsProperties;
}> = [];

const seenScreens = new Set<string>();

function readStorage(area: "local" | "session", key: string): string | null {
  try {
    const store = area === "local" ? window.localStorage : window.sessionStorage;
    return store.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(area: "local" | "session", key: string, value: string): void {
  try {
    const store = area === "local" ? window.localStorage : window.sessionStorage;
    store.setItem(key, value);
  } catch {
    /* storage is a convenience here, never a requirement */
  }
}

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through to the manual form */
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function deviceCategory(): string {
  const width = typeof window === "undefined" ? 0 : window.innerWidth;
  if (width > 0 && width < 640) return "mobile";
  if (width > 0 && width < 1024) return "tablet";
  return "desktop";
}

/** A stable, low-cardinality screen name: ids and numbers collapse. */
export function screenName(pathname: string): string {
  const normalised = pathname
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
    .replace(/\/\d+/g, "/:n")
    .replace(/\/+$/, "");
  return (normalised || "/").slice(0, 120);
}

async function flush(): Promise<void> {
  if (flushing || !sessionId) return;
  flushing = true;
  try {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) break;
      await trackAnalyticsEvent({
        sessionId,
        eventName: next.name,
        ...(next.shopId ? { shopId: next.shopId } : {}),
        ...(next.properties ? { properties: next.properties } : {}),
      }).catch(() => false);
    }
  } finally {
    flushing = false;
  }
}

/** Opens (or re-attaches to) this tab's analytics session. Safe to call twice. */
export function initAnalytics(): void {
  if (typeof window === "undefined") return;
  if (initPromise) return;

  initPromise = (async () => {
    try {
      visitorId = readStorage("local", VISITOR_KEY) ?? randomId();
      writeStorage("local", VISITOR_KEY, visitorId);

      sessionId = readStorage("session", SESSION_KEY);
      if (!sessionId) {
        sessionId = await startAnalyticsSession({
          visitorId,
          platform: "web",
          device: deviceCategory(),
        });
        if (sessionId) writeStorage("session", SESSION_KEY, sessionId);
      }

      if (!sessionId) return;

      // One `app_opened` per tab session, so "visits" is a real count.
      if (readStorage("session", OPENED_KEY) !== "1") {
        writeStorage("session", OPENED_KEY, "1");
        queue.push({ name: ANALYTICS_EVENTS.appOpened });
      }

      await flush();
    } catch {
      /* analytics is optional; the app is not */
    }
  })();
}

/** Records a real action. No-ops when no session could be opened. */
export function trackEvent(
  name: AnalyticsEventName,
  options: { shopId?: string | undefined; properties?: AnalyticsProperties | undefined } = {},
): void {
  if (typeof window === "undefined") return;

  if (!initPromise) initAnalytics();
  if (!sessionId) {
    if (queue.length < 50) {
      queue.push({
        name,
        ...(options.shopId ? { shopId: options.shopId } : {}),
        ...(options.properties ? { properties: options.properties } : {}),
      });
    }
    return;
  }

  void trackAnalyticsEvent({
    sessionId,
    eventName: name,
    ...(options.shopId ? { shopId: options.shopId } : {}),
    ...(options.properties ? { properties: options.properties } : {}),
  }).catch(() => false);
}

/** One `screen_viewed` per screen per session, not per render. */
export function trackScreen(pathname: string): void {
  const route = screenName(pathname);
  if (seenScreens.has(route)) return;
  seenScreens.add(route);
  trackEvent(ANALYTICS_EVENTS.screenViewed, { properties: { route } });
}

/** A failure worth remembering. Message text is truncated by the database. */
export function trackError(
  error: unknown,
  category: string,
  route?: string | undefined,
): void {
  if (typeof window === "undefined") return;
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!message) return;
  if (!initPromise) initAnalytics();

  void recordAnalyticsError({
    sessionId,
    severity: "error",
    category,
    message,
    ...(route ? { route: screenName(route) } : {}),
  }).catch(() => undefined);
}

/** Exposed for the error boundary, which has no other handle on the session. */
export function currentAnalyticsSessionId(): string | null {
  return sessionId;
}
