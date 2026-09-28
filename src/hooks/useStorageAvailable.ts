import { useEffect, useState } from "react";

import { isBrowserStorageAvailable } from "@/lib/storage";

/**
 * Measures whether browser storage works, after mount.
 * Returns null until measured so server-rendered markup and the first client
 * render agree (no hydration mismatch).
 */
export function useStorageAvailable() {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    setAvailable(isBrowserStorageAvailable());
  }, []);

  return available;
}
