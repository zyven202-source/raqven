/**
 * Browser-storage helpers.
 *
 * Supabase Auth persists the session in localStorage. Embedded previews and
 * privacy-restricted browsers can deny storage access entirely, in which case
 * the storage getter throws. Nothing in the app should hang or fail silently
 * because of that — this module makes the condition detectable.
 */

/** True when this browser lets the app read and write localStorage. */
export function isBrowserStorageAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const probe = "__ravqen_storage_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export const STORAGE_BLOCKED_MESSAGE =
  "This browser is blocking website storage, so RAVQEN cannot keep you signed in. " +
  "Open RAVQEN in a normal browser tab (not inside an embedded preview) and sign in again.";
