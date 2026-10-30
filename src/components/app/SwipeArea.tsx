import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useReducedMotion } from "framer-motion";
import { useRef, useState } from "react";

import { navDestinations } from "@/components/app/FloatingNav";

/**
 * Horizontal swipe between the dock's destinations.
 *
 * The contract, in the order a finger meets it:
 *
 *   1. Vertical first, horizontal second. A gesture only *engages* once the
 *      movement is decisively horizontal (`ENGAGE_PX` and a 1.25:1 ratio), so
 *      the page's normal scroll is never taken away from it. Before that the
 *      wrapper does nothing at all, and after that a browser scroll taking
 *      over arrives as pointercancel and cancels the swipe cleanly.
 *   2. Never where something else already owns horizontal movement: inputs,
 *      carousels, charts, dialogs, and any horizontally scrollable ancestor
 *      are checked at press time and make the whole gesture a no-op.
 *   3. Only between real destinations. On a screen the dock does not hold a
 *      tab for, there is no "adjacent", so swiping does nothing rather than
 *      guessing.
 *   4. Commit needs intent: a 56px throw or a genuine flick. A small drag
 *      springs back and stays put.
 *   5. The navigation goes through the router, so Back/Forward, deep links
 *      and scroll restoration behave exactly as they do for a tab tap.
 *
 * Motion: the page is pulled by ~28% of the finger (capped), and released
 * pages slide back to centre over 200ms — inside the 180–250ms band, and
 * collapsed to nothing under `prefers-reduced-motion`.
 *
 * The wrapper only ever carries a `transform` while a gesture is live or
 * settling: a persistent transform would turn it into a containing block for
 * any `position: fixed` descendant of the page for as long as it lived.
 */
const ENGAGE_PX = 20;
const COMMIT_PX = 56;
const FLICK_PX_PER_MS = 0.45;
const MAX_PULL = 88;
const PULL_RATIO = 0.28;
const SLIDE_MS = 200;
const SETTLE_GRACE_MS = 40;

/** Where the swipe must keep its hands off. */
const IGNORE = [
  "input",
  "textarea",
  "select",
  '[contenteditable="true"]',
  "[data-swipe-ignore]",
  '[role="dialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  "[data-carousel]",
  ".recharts-wrapper",
  "[data-chart]",
].join(", ");

/** True when the press landed inside something that already owns horizontal gestures. */
function insideForeignGesture(target: EventTarget | null, boundary: HTMLElement | null): boolean {
  let node = target instanceof Element ? target : null;
  let depth = 0;
  while (node && node !== boundary && depth < 12) {
    if (node.matches(IGNORE)) return true;
    const style = getComputedStyle(node);
    // A horizontally scrollable ancestor (carousel, wide table, chart rail)
    // would fight the swipe for the same axis.
    if (style.overflowX === "auto" || style.overflowX === "scroll") return true;
    node = node.parentElement;
    depth += 1;
  }
  return false;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  startedAt: number;
  lastX: number;
  lastAt: number;
  engaged: boolean;
  from: number;
}

const IDLE: DragState = {
  pointerId: -1,
  startX: 0,
  startY: 0,
  startedAt: 0,
  lastX: 0,
  lastAt: 0,
  engaged: false,
  from: -1,
};

export function SwipeArea({ isOwner, children }: { isOwner: boolean; children: React.ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const reduceMotion = useReducedMotion() === true;

  const destinations = navDestinations(isOwner);
  const index = destinations.findIndex((destination) => pathname === destination.to);

  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState>(IDLE);
  const settleTimer = useRef<number | undefined>(undefined);
  const suppressClickRef = useRef(false);
  const [pull, setPull] = useState<number | null>(null);
  const [engaged, setEngaged] = useState(false);

  const finishGesture = () => {
    dragRef.current = IDLE;
    setEngaged(false);
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => setPull(null), SLIDE_MS + SETTLE_GRACE_MS);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (index < 0) return; // not one of the dock's destinations
    if (insideForeignGesture(event.target, wrapRef.current)) return;
    // Any unread suppression belongs to an earlier gesture (a cancel that
    // never produced a click); a fresh press starts clean.
    suppressClickRef.current = false;
    window.clearTimeout(settleTimer.current);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: event.timeStamp,
      lastX: event.clientX,
      lastAt: event.timeStamp,
      engaged: false,
      from: index,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (!drag.engaged) {
      if (Math.abs(dy) > ENGAGE_PX && Math.abs(dy) >= Math.abs(dx)) {
        dragRef.current = IDLE; // vertical: the page's scroll, not ours
        return;
      }
      if (Math.abs(dx) <= ENGAGE_PX || Math.abs(dx) < Math.abs(dy) * 1.25) return;
      drag.engaged = true;
      setEngaged(true);
      suppressClickRef.current = true;
      try {
        wrapRef.current?.setPointerCapture(event.pointerId);
      } catch {
        /* Capture is an optimisation; the handlers still run without it. */
      }
    }

    drag.lastX = event.clientX;
    drag.lastAt = event.timeStamp;
    if (!reduceMotion) {
      const offset = Math.max(-MAX_PULL, Math.min(MAX_PULL, dx * PULL_RATIO));
      setPull(offset);
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag.pointerId !== event.pointerId) return;
    if (!drag.engaged) {
      dragRef.current = IDLE;
      return;
    }

    const dx = event.clientX - drag.startX;
    const elapsed = Math.max(event.timeStamp - drag.startedAt, 1);
    const velocity = Math.abs(dx) / elapsed;
    const decided = Math.abs(dx) > COMMIT_PX || velocity > FLICK_PX_PER_MS;

    if (decided) {
      const step = dx < 0 ? 1 : -1;
      const target = destinations[drag.from + step];
      if (target) void navigate({ to: target.to, search: { shop: undefined } });
    }

    setPull(0); // spring the page back to centre over the slide duration
    finishGesture();
  };

  const onPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId !== event.pointerId) return;
    setPull(0);
    finishGesture();
  };

  // A swipe that ends on top of a link must not also activate the link — the
  // gesture claimed the press. One-shot, exactly like the dock's hold gesture.
  const onClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      ref={wrapRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClickCapture={onClickCapture}
      data-swipe-state={engaged ? "engaged" : pull !== null ? "settling" : "idle"}
      className={engaged ? "touch-pan-y select-none" : "touch-pan-y"}
      style={{
        transform: pull === null ? undefined : `translateX(${pull}px)`,
        transition:
          pull === null || engaged || reduceMotion
            ? undefined
            : `transform ${SLIDE_MS}ms cubic-bezier(0.22, 0.8, 0.3, 1)`,
        willChange: engaged ? "transform" : undefined,
      }}
    >
      {children}
    </div>
  );
}
