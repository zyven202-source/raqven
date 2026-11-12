import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";

import { SavoMascot } from "@/components/ai/SavoMascot";
import { useActiveShop } from "@/hooks/useActiveShop";
import { useSession } from "@/hooks/useSession";

/**
 * The floating Pith AI mascot — the only entry point to the assistant.
 *
 * Cheap on purpose: this button is a span and an SVG until the first tap. The
 * panel (and with it the Studio and the Supabase client calls) is a separate
 * chunk that is only fetched when someone actually opens it, and no request is
 * made until they send something.
 *
 * Placement is derived from the app's own layout tokens rather than a guess:
 * on a phone it clears the floating dock and the gesture bar; from `lg` the dock
 * becomes a left rail, so it drops to the corner. The till is the one screen
 * where a fixed control in that corner would sit on top of "Take payment", so
 * the launcher is not drawn there at all.
 */

const SavoAiPanel = lazy(() =>
  import("@/components/ai/SavoAiPanel").then((module) => ({ default: module.SavoAiPanel })),
);

const TIP_KEY = "savo.ai.tipDismissed";

export function SavoAiLauncher() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { activeShop, role } = useActiveShop();
  const { user } = useSession();
  const reduceMotion = useReducedMotion();

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [tipVisible, setTipVisible] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // The intro line is offered once per device, and only long enough to be read.
  useEffect(() => {
    if (open) return;
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(TIP_KEY) === "1";
    } catch {
      dismissed = false;
    }
    if (dismissed) return;
    const show = window.setTimeout(() => setTipVisible(true), 1400);
    const hide = window.setTimeout(() => setTipVisible(false), 8000);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [open]);

  function dismissTip() {
    setTipVisible(false);
    try {
      window.localStorage.setItem(TIP_KEY, "1");
    } catch {
      /* Storage blocked: the tip simply shows again next time. */
    }
  }

  function openPanel() {
    dismissTip();
    setMounted(true);
    setOpen(true);
  }

  if (pathname === "/app/pos") return null;

  return (
    <>
      {/* Clear the dock and the gesture bar on a phone; plain corner on desktop,
          where the dock is a left rail rather than a bottom bar. */}
      <div className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+var(--glass-bar-height)+0.85rem)] z-40 flex flex-col items-end gap-2 lg:right-6 lg:bottom-6">
        {tipVisible && !open ? (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mr-1 max-w-[13rem] rounded-lg rounded-br-sm border border-glass-line bg-[var(--glass-3)] px-2.5 py-1.5 text-xs leading-snug shadow-[var(--shadow-pop)] backdrop-blur-md"
          >
            <span className="font-medium">Ask Pith AI</span>
            <span className="block text-muted-foreground">
              {activeShop ? "About this shop, or how Pith works." : "How Pith works."}
            </span>
          </motion.div>
        ) : null}

        <motion.button
          ref={buttonRef}
          type="button"
          onClick={openPanel}
          aria-label="Open Pith AI assistant"
          aria-haspopup="dialog"
          aria-expanded={open}
          initial={reduceMotion ? false : { opacity: 0, scale: 0.86, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          {...(reduceMotion ? {} : { whileTap: { scale: 0.95 } })}
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 26 }}
          className="press group relative grid size-[54px] place-items-center rounded-full bg-positive text-background shadow-[0_8px_22px_-8px_oklch(0_0_0_/_0.65)] ring-1 ring-white/20 outline-none transition-shadow hover:shadow-[0_10px_26px_-8px_oklch(0_0_0_/_0.7)] focus-visible:ring-2 focus-visible:ring-champagne focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:size-[60px]"
        >
          <SavoMascot className="block size-[38px] [&>svg]:size-full sm:size-[42px]" expression={open ? "happy" : "idle"} />
          <span className="sr-only">Pith AI</span>
          {/* A single gold dot: brand, not a notification badge, and it never animates. */}
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-champagne ring-2 ring-background"
          />
        </motion.button>
      </div>

      {mounted ? (
        <Suspense fallback={null}>
          {open ? (
            <SavoAiPanel
              shopId={activeShop?.id ?? null}
              shopName={activeShop?.name ?? null}
              isOwner={role === "owner"}
              signedIn={Boolean(user)}
              onClose={() => {
                setOpen(false);
                // Put focus back where the user left it.
                window.setTimeout(() => buttonRef.current?.focus(), 0);
              }}
            />
          ) : null}
        </Suspense>
      ) : null}
    </>
  );
}
