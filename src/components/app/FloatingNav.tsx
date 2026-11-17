import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  BarChart3,
  Boxes,
  HandCoins,
  History,
  House,
  LogOut,
  MoreHorizontal,
  PackagePlus,
  ReceiptText,
  RefreshCw,
  ScanLine,
  ScrollText,
  Store,
  Users,
  Wallet,
} from "lucide-react";
import { useRef, useState } from "react";

import { JoinShopSheet } from "@/components/app/JoinShopSheet";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

/**
 * The floating navigation.
 *
 * A translucent slab that sits above the page rather than dividing it: the shop
 * keeps scrolling underneath it and you can still read a number through the
 * glass. Three rules keep it honest —
 *
 *   1. It is a *floating* object, so it is the only surface in the product with
 *      a large radius and a blur. Everything else stays flat with hairlines.
 *   2. It shows what the role can actually reach. An owner gets Dashboard; an
 *      employee never sees it, and never sees the destinations behind More that
 *      the database would refuse them anyway.
 *   3. It never covers the last row of a screen — see the clearance in
 *      `PageContainer`.
 */

type AppPath =
  | "/app/overview"
  | "/app/pos"
  | "/app/inventory"
  | "/app/expenses"
  | "/app/transactions"
  | "/app/reports"
  | "/app/pulse"
  | "/app/restock"
  | "/app/stock"
  | "/app/debtors"
  | "/app/employees"
  | "/app/settings"
  | "/app/sync"
  | "/dashboard";

type NavItem = {
  to: AppPath;
  /** Optional fragment, for the entries that open one screen at one section. */
  hash?: string;
  label: string;
  /** A second line in the More sheet explaining what the screen is for. */
  note?: string;
  icon: typeof House;
  ownerOnly?: boolean;
};

/**
 * A destination that earns a permanent tab. Always inside the workspace, so it
 * carries the shop deep-link like the rest of the workspace does.
 */
type TabItem = Omit<NavItem, "to"> & {
  to: Exclude<AppPath, "/dashboard">;
  /**
   * The centre of the dock: the sketch's larger middle button, which is the
   * POS. Rendered as a raised emerald puck between the left and right pairs.
   */
  center?: boolean;
};

/**
 * The destinations that earn a permanent place, in the order a shop uses them.
 *
 * The arrangement follows the supplied navigation sketch — two compact
 * destinations, the prominent POS in the centre, then two more — for five
 * targets in total. Seven was the sketch's other reading (three + POS +
 * three); at 320–360px it would leave ~47px per target, which is under the
 * 44px floor once labels are counted, so the secondary screens live behind
 * More instead of shrinking every tap.
 *
 * Expenses is here rather than behind More because recording what the shop
 * spent is a daily job, not an occasional one — and the counter needs it as
 * much as the owner does. Only the Dashboard is owner-only: it reads the
 * owner's own figures, which the database will not serve to staff at all —
 * staff get Sales as their leftmost destination instead.
 */
const STAFF_TABS: TabItem[] = [
  { to: "/app/transactions", label: "Sales", icon: ReceiptText },
  { to: "/app/inventory", label: "Inventory", icon: Boxes },
  { to: "/app/pos", label: "POS", icon: ScanLine, center: true },
  { to: "/app/expenses", label: "Expenses", icon: Wallet },
];

const OWNER_TABS: TabItem[] = [
  { to: "/app/overview", label: "Dashboard", icon: House },
  { to: "/app/inventory", label: "Inventory", icon: Boxes },
  { to: "/app/pos", label: "POS", icon: ScanLine, center: true },
  { to: "/app/expenses", label: "Expenses", icon: Wallet },
];

/** Everything that did not earn one of the four taps. Grouped by intent. */
type MoreGroup = { heading: string; items: NavItem[] };

const OWNER_MORE: MoreGroup[] = [
  {
    heading: "Money",
    items: [
      {
        to: "/app/debtors",
        label: "Customer accounts",
        note: "Credit customers and repayments",
        icon: HandCoins,
      },
      {
        to: "/app/transactions",
        label: "Sales history",
        note: "Every sale, payment and refund",
        icon: ReceiptText,
      },
    ],
  },
  {
    heading: "Stock",
    items: [
      { to: "/app/restock", label: "Receive stock", icon: PackagePlus },
      {
        to: "/app/stock",
        label: "Stock movements",
        note: "Every movement, and who made it",
        icon: ScrollText,
      },
    ],
  },
  {
    heading: "The business",
    items: [
      {
        to: "/app/pulse",
        label: "SAVO Pulse",
        note: "Understand your shop. Know your next move.",
        icon: Activity,
        ownerOnly: true,
      },
      { to: "/app/reports", label: "Reports", icon: BarChart3, ownerOnly: true },
      { to: "/app/employees", label: "Employees", icon: Users, ownerOnly: true },
      { to: "/dashboard", label: "All my shops", icon: Store },
    ],
  },
  {
    heading: "This device",
    items: [
      {
        to: "/app/sync",
        label: "Sync & offline",
        note: "Queued sales, last sync, retry",
        icon: RefreshCw,
      },
    ],
  },
  {
    heading: "Settings",
    items: [
      { to: "/app/settings", hash: "shop", label: "Shop settings", icon: Store },
      {
        to: "/app/settings",
        hash: "receipts",
        label: "Receipt settings",
        icon: ReceiptText,
      },
      { to: "/app/settings", hash: "refunds", label: "Refund settings", icon: HandCoins },
      // The audit trail is an owner destination in its own right: it is the
      // screen that answers "who did this, and when", and burying it one
      // scroll below the receipt settings made it a destination nobody could
      // find. Same icon the log itself renders under, so the row and the
      // section it opens agree.
      { to: "/app/settings", hash: "activity", label: "Activity log", icon: History },
    ],
  },
];

/**
 * What staff may reach. Not a shortened copy of the owner's list: every entry
 * here is something the database already lets an employee do at the counter.
 */
const STAFF_MORE: MoreGroup[] = [
  {
    heading: "Money",
    items: [
      {
        to: "/app/debtors",
        label: "Customer accounts",
        note: "Credit customers and repayments",
        icon: HandCoins,
      },
      // Sales history is deliberately absent: it earned a permanent tab on
      // this role's dock, and a destination listed twice reads as two
      // different screens.
    ],
  },
  {
    heading: "Stock",
    items: [
      { to: "/app/restock", label: "Receive stock", icon: PackagePlus },
      {
        to: "/app/stock",
        label: "Stock movements",
        note: "Every movement, and who made it",
        icon: ScrollText,
      },
    ],
  },
  {
    heading: "Shop",
    items: [{ to: "/dashboard", label: "All my shops", icon: Store }],
  },
  {
    heading: "This device",
    items: [
      {
        to: "/app/sync",
        label: "Sync & offline",
        note: "Queued sales, last sync, retry",
        icon: RefreshCw,
      },
    ],
  },
];

/** One spring for the whole navigation, so nothing in it moves at its own pace. */
const SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.8 } as const;

/**
 * The More sheet's entrance, as three numbers.
 *
 * Staggering is what turns a sheet of links into something that feels
 * assembled rather than pasted in: each row arrives a beat after the one above
 * it, so the eye is walked down the list in the order it is meant to be read.
 * The step and the base are set so the last of ten rows has landed inside
 * 350ms — a stagger that runs longer stops reading as an entrance and starts
 * reading as a delay, and a shopkeeper opening More on a bad connection cannot
 * afford to wait for an animation to finish before the list is usable.
 */
const STAGGER_BASE = 0.04;
const STAGGER_STEP = 0.016;
const STAGGER_IN = 0.18;
const STAGGER_OUT = 0.12;
const STAGGER_RISE = 10;
const STAGGER_EASE = [0.22, 0.8, 0.3, 1] as const;

/**
 * The transition for one element of the entrance.
 *
 * Closing is quick and unstaggered on purpose: the drawer is already sliding
 * away under it, and holding the rows on screen while it does looks like the
 * sheet is fighting itself. `prefers-reduced-motion` collapses both to nothing
 * rather than shortening them, because a 10px rise is the whole effect.
 */
function stagger(open: boolean, index: number, reduceMotion: boolean) {
  if (reduceMotion) return { duration: 0 };
  return open
    ? { duration: STAGGER_IN, delay: STAGGER_BASE + index * STAGGER_STEP, ease: STAGGER_EASE }
    : { duration: STAGGER_OUT, ease: "easeOut" as const };
}

/**
 * The dock's destinations in reading order — and, for the content swipe, in
 * swipe order. More is deliberately absent: swiping *into* a sheet is not a
 * page transition, so the swipe walks the four real screens and stops.
 */
export function navDestinations(isOwner: boolean): { to: TabItem["to"]; label: string }[] {
  return (isOwner ? OWNER_TABS : STAFF_TABS).map(({ to, label }) => ({ to, label }));
}

/* ------------------------------------------------------------ hold gesture */

/**
 * Press-and-hold, slide, release — the dock's second way to move.
 *
 * The rules it keeps, in the order the pointer meets them:
 *
 *   1. A tap never becomes a gesture. The hold only arms after `HOLD_MS` of
 *      stillness, and any wander past `HOLD_SLOP` before that disarms it, so
 *      a thumb landing while the phone moves does nothing at all.
 *   2. Once armed, the pointer is captured: every move — including one that
 *      leaves the bar — keeps coming to the pill instead of being stolen by
 *      the page underneath.
 *   3. Sliding lights up whichever destination sits under the finger, in
 *      real time, with one tick of haptics when it changes.
 *   4. Releasing commits the highlighted destination; releasing on the one
 *      already open, or on nothing, commits nothing.
 *   5. Interruption (pointercancel, a drift past the bar, a second pointer)
 *      cancels quietly and, because the gesture already claimed the press,
 *      swallows the click it would otherwise have produced — a cancelled
 *      gesture must never fire the tap underneath it.
 *
 * `touch-action: pan-y` on the bar is what makes step 2 honest on Android:
 * horizontal movement stays ours (the browser has no claim on it), while a
 * vertical drag is still the browser's scroll and arrives as pointercancel —
 * which is exactly the "interrupted" case.
 */
const HOLD_MS = 300;
const HOLD_SLOP = 12;
const OUTSIDE_TOLERANCE = 32;

type SlotBox = { left: number; top: number; width: number; height: number };

type HoldPhase = "pending" | "active" | "dead";

interface HoldState {
  pointerId: number;
  startX: number;
  startY: number;
  timer: number;
  phase: HoldPhase;
  slots: SlotBox[];
  index: number;
}

/** A tap of haptics, only where the device offers it and permits it. */
function buzz(ms: number) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(ms);
  } catch {
    /* Some browsers throw on vibrate during silent mode; the gesture works without it. */
  }
}

export function FloatingNav({ isOwner, onSignOut }: { isOwner: boolean; onSignOut: () => void }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const hash = useRouterState({ select: (state) => state.location.hash });
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  const tabs = isOwner ? OWNER_TABS : STAFF_TABS;
  const groups = (isOwner ? OWNER_MORE : STAFF_MORE)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.ownerOnly || isOwner),
    }))
    .filter((group) => group.items.length > 0);

  // More holds destinations that did not earn a tab, so it only lights up while
  // the user is inside one of them — and never for a destination that now has
  // its own tab, or two highlights would claim the same screen.
  const moreActive = groups.some((group) =>
    group.items.some((item) => pathname === item.to && !tabs.some((tab) => tab.to === item.to)),
  );

  /* ---------------------------------------------------------- hold state */

  const pillRef = useRef<HTMLDivElement>(null);
  const holdRef = useRef<HoldState | null>(null);
  const suppressClickRef = useRef(false);
  const [gesture, setGesture] = useState<{ index: number; box: SlotBox } | null>(null);

  const endHold = () => {
    const hold = holdRef.current;
    holdRef.current = null;
    setGesture(null);
    if (!hold) return;
    window.clearTimeout(hold.timer);
    if (hold.phase !== "active") return;

    // The gesture consumed this press: whatever happens next must not also
    // fire the Link the finger happened to lift on.
    suppressClickRef.current = true;
    const pill = pillRef.current;
    if (pill?.hasPointerCapture?.(hold.pointerId)) {
      try {
        pill.releasePointerCapture(hold.pointerId);
      } catch {
        /* Already released by the browser — nothing to undo. */
      }
    }

    const index = hold.index;
    if (index < 0 || index >= hold.slots.length) return; // released on nothing
    if (index < tabs.length) {
      const target = tabs[index];
      if (target && target.to !== pathname) {
        void navigate({ to: target.to, search: { shop: undefined } });
      }
      return;
    }
    setMoreOpen(true);
  };

  const slotAt = (x: number, y: number, slots: SlotBox[]): number => {
    for (let i = 0; i < slots.length; i += 1) {
      const s = slots[i];
      if (!s) continue;
      if (x >= s.left && x <= s.left + s.width && y >= s.top && y <= s.top + s.height) return i;
    }
    return -1;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (moreOpen || holdRef.current) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // A press starts clean: any unread suppression belongs to an earlier,
    // cancelled gesture that never produced its click.
    suppressClickRef.current = false;
    const timer = window.setTimeout(() => {
      const hold = holdRef.current;
      const pill = pillRef.current;
      if (!hold || hold.phase !== "pending" || !pill) return;

      const pillRect = pill.getBoundingClientRect();
      const nodes = Array.from(pill.querySelectorAll<HTMLElement>("[data-nav-slot]"));
      const slots = nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          left: rect.left - pillRect.left,
          top: rect.top - pillRect.top,
          width: rect.width,
          height: rect.height,
        };
      });

      hold.slots = slots;
      hold.phase = "active";
      const start = slotAt(hold.startX - pillRect.left, hold.startY - pillRect.top, slots);
      hold.index = start;
      const startBox = start >= 0 ? slots[start] : undefined;
      if (start >= 0 && startBox) setGesture({ index: start, box: startBox });
      try {
        pill.setPointerCapture(hold.pointerId);
      } catch {
        /* Capture is an optimisation; the handlers still run without it. */
      }
      buzz(8);
    }, HOLD_MS);
    holdRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timer,
      phase: "pending",
      slots: [],
      index: -1,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const hold = holdRef.current;
    if (!hold || hold.pointerId !== event.pointerId) return;

    if (hold.phase === "pending") {
      const moved =
        Math.abs(event.clientX - hold.startX) > HOLD_SLOP ||
        Math.abs(event.clientY - hold.startY) > HOLD_SLOP;
      if (moved) {
        hold.phase = "dead"; // a moving press is a scroll or a stray, never a hold
        window.clearTimeout(hold.timer);
      }
      return;
    }
    if (hold.phase !== "active") return;

    const pill = pillRef.current;
    if (!pill) return;
    const pillRect = pill.getBoundingClientRect();
    const x = event.clientX - pillRect.left;
    const y = event.clientY - pillRect.top;

    // Drifting clear of the bar cancels — the finger is somewhere else now.
    const outside =
      x < -OUTSIDE_TOLERANCE ||
      y < -OUTSIDE_TOLERANCE ||
      x > pillRect.width + OUTSIDE_TOLERANCE ||
      y > pillRect.height + OUTSIDE_TOLERANCE;
    if (outside) {
      hold.phase = "dead";
      setGesture(null);
      buzz(4);
      return;
    }

    const found = slotAt(x, y, hold.slots);
    const next = found >= 0 ? found : hold.index; // gaps between slots keep the last one
    if (next !== hold.index) {
      hold.index = next;
      const box = next >= 0 ? hold.slots[next] : undefined;
      setGesture(next >= 0 && box ? { index: next, box } : null);
      buzz(10);
    }
  };

  const releasePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const hold = holdRef.current;
    if (!hold || hold.pointerId !== event.pointerId) return;
    if (hold.phase === "active") endHold();
    else {
      if (hold.phase === "pending") window.clearTimeout(hold.timer);
      holdRef.current = null;
      setGesture(null);
    }
  };

  const cancelHold = (event: React.PointerEvent<HTMLDivElement>) => {
    const hold = holdRef.current;
    if (!hold || hold.pointerId !== event.pointerId) return;
    window.clearTimeout(hold.timer);
    if (hold.phase === "active") suppressClickRef.current = true;
    holdRef.current = null;
    setGesture(null);
  };

  // A cancelled gesture must not turn into the tap it was standing on. The
  // flag is one-shot: an untouched tap passes straight through to the Link.
  const onClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <>
      {/*
        One navigation, placed by the viewport. On a phone it is a pill floating
        just above the bottom edge; from `lg` up it becomes a compact rail in the
        left margin, because stretching five tabs across a desktop window would
        make each target a stretch of empty glass. Same destinations either way.

        `touch-action: pan-y` is the gesture contract: horizontal drags stay
        with the hold-and-slide selection, vertical drags stay with the page.
      */}
      <nav
        aria-label="Main"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[env(safe-area-inset-bottom)] pt-2.5 select-none lg:inset-x-auto lg:bottom-auto lg:left-4 lg:top-1/2 lg:translate-y-[-50%] lg:p-0"
      >
        <div
          ref={pillRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={releasePointer}
          onPointerCancel={cancelHold}
          onClickCapture={onClickCapture}
          onContextMenu={(event) => {
            // A long press must select a tab, not Android's "open link" menu.
            const pointerType = (event.nativeEvent as PointerEvent).pointerType;
            if (pointerType === "touch" || holdRef.current) event.preventDefault();
          }}
          className="glass-bar pointer-events-auto relative flex h-[var(--glass-bar-height)] w-full max-w-md touch-pan-y items-stretch gap-0.5 rounded-glass p-1 lg:h-auto lg:w-auto lg:max-w-none lg:flex-col"
        >
          {/* The travelling selection the hold gesture lights up. */}
          {gesture ? (
            <motion.span
              aria-hidden
              data-nav-gesture
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="pointer-events-none absolute z-0 rounded-[1.125rem] bg-ink/8 ring-1 ring-ink/20"
              style={{
                left: gesture.box.left,
                top: gesture.box.top,
                width: gesture.box.width,
                height: gesture.box.height,
              }}
            />
          ) : null}
          {tabs.map((tab) =>
            tab.center ? (
              <CenterTab key={tab.to} item={tab} pathname={pathname} />
            ) : (
              <Tab key={tab.to} item={tab} pathname={pathname} />
            ),
          )}
          <MoreTab open={moreOpen} active={moreActive} onOpenChange={setMoreOpen} />
        </div>
      </nav>

      <MorePanel
        open={moreOpen}
        onOpenChange={setMoreOpen}
        groups={groups}
        pathname={pathname}
        hash={hash}
        onSignOut={onSignOut}
      />
    </>
  );
}

/**
 * One destination. The glass highlight behind the active item is a shared
 * layout element, so it slides between tabs instead of blinking on and off.
 */
function Tab({ item, pathname }: { item: TabItem; pathname: string }) {
  const reduceMotion = useReducedMotion();
  const active = pathname === item.to;

  return (
    <Link
      to={item.to}
      search={{ shop: undefined }}
      aria-current={active ? "page" : undefined}
      data-nav-slot
      className="press hover-glass hover:bg-ink/4 relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-[1.125rem] px-0.5 lg:w-[4.5rem] lg:flex-none"
    >
      {active ? (
        <motion.span
          layoutId="nav-highlight"
          className="glass-tile pointer-events-none absolute inset-0 rounded-[1.125rem]"
          transition={reduceMotion ? { duration: 0 } : SPRING}
        />
      ) : null}

      <motion.span
        className={cn(
          "relative z-10 transition-colors duration-200",
          active ? "text-ink" : "text-muted-foreground",
        )}
        animate={active ? { scale: 1.08, y: -1 } : { scale: 1, y: 0 }}
        transition={reduceMotion ? { duration: 0 } : SPRING}
      >
        <item.icon className="size-5" aria-hidden />
      </motion.span>

      <span
        className={cn(
          "relative z-10 text-[0.625rem] font-medium leading-none transition-colors duration-200",
          active ? "text-ink" : "text-muted-foreground",
        )}
      >
        {item.label}
      </span>

      <span aria-hidden className="absolute top-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full">
        <motion.span
          className="block size-1 rounded-full bg-ink"
          animate={{ scale: active ? 1 : 0, opacity: active ? 1 : 0 }}
          transition={reduceMotion ? { duration: 0 } : SPRING}
        />
      </span>
    </Link>
  );
}

/**
 * The centre of the dock: the POS, as the sketch's larger middle button.
 *
 * Same machinery as a Tab — highlight, indicator, aria-current — so the active
 * state reads identically wherever the user is; what changes is the target
 * itself, a raised emerald puck, because on a shop counter the till IS the
 * product. The lift is mobile-only: in the desktop rail the puck sits inline
 * with its neighbours. The contact shadow is black, like every other depth
 * cue in the product — an emerald glow would be the decorative outline the
 * brief rules out.
 */
function CenterTab({ item, pathname }: { item: TabItem; pathname: string }) {
  const reduceMotion = useReducedMotion();
  const active = pathname === item.to;

  return (
    <Link
      to={item.to}
      search={{ shop: undefined }}
      aria-current={active ? "page" : undefined}
      data-nav-slot
      className="press hover-glass hover:bg-ink/4 relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-[1.125rem] px-0.5 lg:w-[4.5rem] lg:flex-none"
    >
      {active ? (
        <motion.span
          layoutId="nav-highlight"
          className="glass-tile pointer-events-none absolute inset-0 rounded-[1.125rem]"
          transition={reduceMotion ? { duration: 0 } : SPRING}
        />
      ) : null}

      <motion.span
        className={cn(
          "relative z-10 grid size-10 -translate-y-1 place-items-center rounded-full border border-[var(--brand-line)] bg-positive text-background shadow-[0_6px_14px_-6px_oklch(0_0_0_/_0.5)] lg:translate-y-0",
          active && "ring-2 ring-ink/70",
        )}
        animate={active ? { scale: 1.05 } : { scale: 1 }}
        transition={reduceMotion ? { duration: 0 } : SPRING}
      >
        <item.icon className="size-5" aria-hidden />
      </motion.span>

      <span
        className={cn(
          "relative z-10 text-[0.625rem] font-semibold leading-none transition-colors duration-200",
          active ? "text-ink" : "text-muted-foreground",
        )}
      >
        {item.label}
      </span>

      <span aria-hidden className="absolute top-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full">
        <motion.span
          className="block size-1 rounded-full bg-ink"
          animate={{ scale: active ? 1 : 0, opacity: active ? 1 : 0 }}
          transition={reduceMotion ? { duration: 0 } : SPRING}
        />
      </span>
    </Link>
  );
}

/** The More destination. Opens the sheet rather than navigating. */
function MoreTab({
  open,
  active,
  onOpenChange,
}: {
  open: boolean;
  active: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <button
      type="button"
      onClick={() => onOpenChange(true)}
      aria-expanded={open}
      aria-haspopup="dialog"
      data-nav-slot
      className="press hover-glass hover:bg-ink/4 relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-[1.125rem] px-0.5 lg:w-[4.5rem] lg:flex-none"
    >
      {active ? (
        <motion.span
          layoutId="nav-highlight"
          className="glass-tile pointer-events-none absolute inset-0 rounded-[1.125rem]"
          transition={reduceMotion ? { duration: 0 } : SPRING}
        />
      ) : null}

      <motion.span
        className={cn(
          "relative z-10 transition-colors duration-200",
          active ? "text-ink" : "text-muted-foreground",
        )}
        animate={active ? { scale: 1.08, y: -1 } : { scale: 1, y: 0 }}
        transition={reduceMotion ? { duration: 0 } : SPRING}
      >
        <MoreHorizontal className="size-5" aria-hidden />
      </motion.span>

      <span
        className={cn(
          "relative z-10 text-[0.625rem] font-medium leading-none transition-colors duration-200",
          active ? "text-ink" : "text-muted-foreground",
        )}
      >
        More
      </span>

      <span aria-hidden className="absolute top-1 left-1/2 h-1 w-1 -translate-x-1/2">
        <motion.span
          className="block size-1 rounded-full bg-ink"
          animate={{ scale: active ? 1 : 0, opacity: active ? 1 : 0 }}
          transition={reduceMotion ? { duration: 0 } : SPRING}
        />
      </span>
    </button>
  );
}

/**
 * More, as a sheet of glass rather than a dropdown.
 *
 * It is a drawer, so it can be dismissed by tapping outside, by swiping it
 * down, or with Escape — the three things a thumb already knows.
 */
function MorePanel({
  open,
  onOpenChange,
  groups,
  pathname,
  hash,
  onSignOut,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: MoreGroup[];
  pathname: string;
  hash: string;
  onSignOut: () => void;
}) {
  const reduceMotion = useReducedMotion();
  // `useReducedMotion` is `boolean | null` — null while the media query has not
  // been read yet. Normalise once rather than at every call site.
  const reduced = reduceMotion === true;

  /*
    The entrance order. Every heading and every row takes the next number in the
    sequence, so the list is walked in the order it is meant to be read rather
    than arriving all at once. `at` is a plain render-time counter: `groups` is
    rebuilt each render anyway, and a counter that reset per pass is easier to
    reason about than a memo whose dependency is a fresh array every time.
  */
  let at = 0;
  const sections = groups.map((group) => {
    const headingAt = at++;
    return {
      heading: group.heading,
      headingAt,
      items: group.items.map((item) => ({ item, at: at++ })),
    };
  });
  const footerAt = at;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false} dismissible>
      <DrawerContent
        className={cn(
          "glass-sheet mx-auto max-w-lg gap-0 rounded-t-glass-lg px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]",
          reduceMotion && "transition-none",
        )}
      >
        {/*
          The heading leads the sequence.

          `initial` is the hidden state rather than `false`, and that is load
          bearing. The drawer mounts its content at the moment it opens, so a
          freshly mounted element with `initial={false}` is handed the final
          value directly and the entrance never plays — every row would simply
          appear, which is the one outcome the stagger exists to avoid. Starting
          from the hidden state animates correctly whether the panel is mounted
          ahead of time or created on open.
        */}
        <motion.div
          initial={{ opacity: 0, y: STAGGER_RISE }}
          animate={{ opacity: open ? 1 : 0, y: open ? 0 : STAGGER_RISE }}
          transition={stagger(open, -1, reduced)}
        >
          <DrawerTitle className="text-left font-display text-lg font-semibold">More</DrawerTitle>
          <DrawerDescription className="mb-4 text-left text-sm text-muted-foreground">
            Everything else in this shop.
          </DrawerDescription>
        </motion.div>

        <div className="max-h-[min(62vh,30rem)] overflow-y-auto overscroll-contain pr-0.5">
          {sections.map((section) => (
            <motion.section
              key={section.heading}
              initial={{ opacity: 0, y: STAGGER_RISE }}
              animate={{ opacity: open ? 1 : 0, y: open ? 0 : STAGGER_RISE }}
              transition={stagger(open, section.headingAt, reduced)}
              className="mb-4 last:mb-0"
            >
              <h2 className="eyebrow mb-2 px-1">{section.heading}</h2>
              <ul className="glass-sunk overflow-hidden rounded-xl">
                {section.items.map(({ item, at: itemAt }) => (
                  <motion.li
                    key={`${item.to}${item.hash ?? ""}`}
                    initial={{ opacity: 0, y: STAGGER_RISE }}
                    animate={{ opacity: open ? 1 : 0, y: open ? 0 : STAGGER_RISE }}
                    transition={stagger(open, itemAt, reduced)}
                    className="border-t border-glass-line first:border-t-0"
                  >
                    <SheetLink
                      item={item}
                      // The three settings entries all open one screen, so the
                      // current section is what decides which one is selected.
                      active={
                        pathname === item.to &&
                        (item.hash === undefined || hash === `#${item.hash}`)
                      }
                      onNavigate={() => onOpenChange(false)}
                    />
                  </motion.li>
                ))}
              </ul>
            </motion.section>
          ))}

          {/*
            The two account actions are part of the sequence, not an afterthought
            below it. They are the last things a shopkeeper wants, and arriving
            last is how they are read.
          */}
          <motion.div
            initial={{ opacity: 0, y: STAGGER_RISE }}
            animate={{ opacity: open ? 1 : 0, y: open ? 0 : STAGGER_RISE }}
            transition={stagger(open, footerAt, reduced)}
            className="mt-4 space-y-2"
          >
            <JoinShopSheet>
              <Button variant="outline" className="h-14 w-full justify-start text-base">
                Join another shop
              </Button>
            </JoinShopSheet>
            <DrawerClose asChild>
              <Button
                variant="ghost"
                onClick={onSignOut}
                className="h-14 w-full justify-start text-base text-negative hover:bg-negative-soft hover:text-negative"
              >
                <LogOut className="size-5" aria-hidden />
                Sign out
              </Button>
            </DrawerClose>
          </motion.div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** A row in the sheet. Full-width, 56px tall, and says where it goes. */
function SheetLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: () => void;
}) {
  const body = (
    <>
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-lg transition-colors",
          active ? "bg-ink text-background" : "bg-sunken text-muted-foreground",
        )}
      >
        <item.icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-medium leading-tight">{item.label}</span>
        {item.note ? (
          <span className="mt-0.5 block text-xs leading-tight text-muted-foreground">
            {item.note}
          </span>
        ) : null}
      </span>
    </>
  );

  /*
    The interaction system, unchanged from every other control in the product:
    `press` for the thumb, `hover-glass` for the pointer. The lift is what gives
    a row the "slight elevation" on desktop, and the tint is what makes it read
    as a glass highlight rather than as a shadow under a line. `hover:bg-*` is
    compiled inside `@media (hover: hover)`, so a phone never gets a row stuck
    in a hover state after a tap.
  */
  const className =
    "press hover-glass flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-ink/5";

  if (item.to === "/dashboard") {
    return (
      <Link to={item.to} onClick={onNavigate} className={className}>
        {body}
      </Link>
    );
  }

  return (
    <Link
      to={item.to}
      search={{ shop: undefined }}
      {...(item.hash ? { hash: item.hash } : {})}
      onClick={onNavigate}
      className={className}
    >
      {body}
    </Link>
  );
}
