import { Link, useRouterState } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import {
  BarChart3,
  Boxes,
  HandCoins,
  House,
  LogOut,
  MoreHorizontal,
  PackagePlus,
  ReceiptText,
  ScanLine,
  ScrollText,
  Store,
  Users,
  Wallet,
} from "lucide-react";
import { useState } from "react";

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
  | "/app/restock"
  | "/app/stock"
  | "/app/debtors"
  | "/app/employees"
  | "/app/settings"
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
type TabItem = Omit<NavItem, "to"> & { to: Exclude<AppPath, "/dashboard"> };

/**
 * The destinations that earn a permanent place, in the order a shop uses them.
 *
 * Expenses is here rather than behind More because recording what the shop
 * spent is a daily job, not an occasional one — and the counter needs it as
 * much as the owner does. Only the Dashboard is owner-only: it reads the
 * owner's own figures, which the database will not serve to staff at all.
 */
const STAFF_TABS: TabItem[] = [
  { to: "/app/pos", label: "POS", icon: ScanLine },
  { to: "/app/inventory", label: "Inventory", icon: Boxes },
  { to: "/app/expenses", label: "Expenses", icon: Wallet },
];

const OWNER_TABS: TabItem[] = [
  { to: "/app/overview", label: "Dashboard", icon: House },
  { to: "/app/pos", label: "POS", icon: ScanLine },
  { to: "/app/inventory", label: "Inventory", icon: Boxes },
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
        label: "Debtors",
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
        label: "Activity log",
        note: "Every movement, and who made it",
        icon: ScrollText,
      },
    ],
  },
  {
    heading: "The business",
    items: [
      { to: "/app/reports", label: "Reports", icon: BarChart3, ownerOnly: true },
      { to: "/app/employees", label: "Employees", icon: Users, ownerOnly: true },
      { to: "/dashboard", label: "All my shops", icon: Store },
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
        label: "Debtors",
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
        label: "Activity log",
        note: "Every movement, and who made it",
        icon: ScrollText,
      },
    ],
  },
  {
    heading: "Shop",
    items: [{ to: "/dashboard", label: "All my shops", icon: Store }],
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

export function FloatingNav({ isOwner, onSignOut }: { isOwner: boolean; onSignOut: () => void }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const hash = useRouterState({ select: (state) => state.location.hash });
  const [moreOpen, setMoreOpen] = useState(false);

  const tabs = isOwner ? OWNER_TABS : STAFF_TABS;
  const groups = (isOwner ? OWNER_MORE : STAFF_MORE)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.ownerOnly || isOwner),
    }))
    .filter((group) => group.items.length > 0);

  // More holds a fixed set of destinations, so the tab has to light up while
  // the user is inside any of them — otherwise the bar goes blank on the way to
  // Debtors and looks broken.
  const moreActive = groups.some((group) => group.items.some((item) => pathname === item.to));

  return (
    <>
      {/*
        One navigation, placed by the viewport. On a phone it is a pill floating
        just above the bottom edge; from `lg` up it becomes a compact rail in the
        left margin, because stretching five tabs across a desktop window would
        make each target a stretch of empty glass. Same destinations either way.
      */}
      <nav
        aria-label="Main"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[env(safe-area-inset-bottom)] pt-2.5 lg:inset-x-auto lg:bottom-auto lg:left-4 lg:top-1/2 lg:translate-y-[-50%] lg:p-0"
      >
        <div className="glass-bar pointer-events-auto flex h-[var(--glass-bar-height)] w-full max-w-md items-stretch gap-0.5 rounded-glass p-1 backdrop-blur-2xl backdrop-saturate-150 lg:h-auto lg:w-auto lg:max-w-none lg:flex-col">
          {tabs.map((tab) => (
            <Tab key={tab.to} item={tab} pathname={pathname} />
          ))}
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
      className="press hover-glass hover:bg-ink/4 relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-[1.125rem] px-0.5 lg:w-[4.5rem] lg:flex-none"
    >
      {active ? (
        <motion.span
          layoutId="nav-highlight"
          className="glass-tile pointer-events-none absolute inset-0 rounded-[1.125rem] backdrop-blur-md backdrop-saturate-150"
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
      className="press hover-glass hover:bg-ink/4 relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-[1.125rem] px-0.5 lg:w-[4.5rem] lg:flex-none"
    >
      {active ? (
        <motion.span
          layoutId="nav-highlight"
          className="glass-tile pointer-events-none absolute inset-0 rounded-[1.125rem] backdrop-blur-md backdrop-saturate-150"
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
          "glass-sheet mx-auto max-w-lg gap-0 rounded-t-glass-lg px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] backdrop-blur-2xl backdrop-saturate-150",
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
