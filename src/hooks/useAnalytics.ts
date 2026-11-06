import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";

import { initAnalytics, trackScreen } from "@/lib/analytics-tracker";

/**
 * Boots the analytics session once and records each screen a visitor reaches.
 *
 * Mounted at the root so the landing page, sign-in and the workspace are all
 * counted; calling it twice is harmless.
 */
export function useAnalytics() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    trackScreen(pathname);
  }, [pathname]);
}
