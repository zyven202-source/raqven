import { useEffect, useState } from "react";

import { startOfDay } from "@/services/reports.service";

/**
 * A "now" that only moves once a minute.
 *
 * Report queries are keyed on their date range. Building that range with a raw
 * `new Date()` inside a component body produces a *new* key on every render, so
 * React Query tears the request down and starts it again, forever — the screen
 * sits on "Working out the numbers…" until the stall timer fires and reports a
 * failure that never actually happened. Rounding the instant to the minute
 * keeps the key stable within a tick while still rolling forward on its own, so
 * a shop left open across a sale eventually reflects it.
 */
export function useMinuteNow() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow((current) => {
        const next = new Date();
        // Only re-render once a full minute has actually passed.
        return next.getTime() - current.getTime() >= 60_000 ? next : current;
      });
    }, 30_000);

    return () => window.clearInterval(timer);
  }, []);

  return now;
}

/** Today's window, stable for the length of a minute tick. */
export function useTodayWindow() {
  const now = useMinuteNow();
  return { from: startOfDay(now), to: now };
}
