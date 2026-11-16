import { Link } from "@tanstack/react-router";
import { Loader2, Lock, Receipt, ShieldCheck } from "lucide-react";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { useStorageAvailable } from "@/hooks/useStorageAvailable";

/**
 * The frame every auth screen shares.
 *
 * **Why it is a scene, not a card on a plain page.** Signing in is the moment the
 * product stops being a website and becomes the shop's workspace. A white card
 * floating in an empty viewport says the opposite — that nobody thought about
 * this screen. So the page is built as two halves of one environment: an emerald
 * field on the left that establishes the brand, and a paper panel on the right
 * that holds the form. The panel is opaque on purpose: a form is a tool, and
 * translucency behind text you have to type into is a contrast problem dressed
 * up as a style.
 *
 * **On a phone** the same two halves stack — atmosphere on top, form below — and
 * the form panel overlaps the field with a generous radius, so the composition
 * still reads as one scene. The page scrolls naturally when the keyboard opens;
 * nothing is pinned to the viewport bottom where a keyboard would cover it.
 *
 * **What it does not do.** No social-login buttons (there are none), no slogans
 * inside the form, no invented security badge. The three footnotes on the left
 * describe things the code actually does.
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  const storageAvailable = useStorageAvailable();

  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[1.02fr_1fr]">
      {/* ------------------------------------------------------- atmosphere */}
      <div className="savo-field on-field relative overflow-hidden">
        <div
          aria-hidden
          className="savo-halo -left-16 top-8 size-72 bg-[var(--savo-emerald-lit)]/45"
        />
        <div aria-hidden className="savo-halo right-4 top-40 size-56 bg-[var(--savo-mint)]/20" />

        <div className="relative mx-auto flex h-full w-full max-w-xl flex-col px-6 py-10 sm:px-10 lg:max-w-none lg:px-14 lg:py-14">
          <Link to="/" aria-label="SAVO home" className="w-fit">
            <Logo tone="light" markSize="size-10" />
          </Link>

          <div className="mt-12 lg:my-auto">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--savo-mint)]">
              Welcome
            </p>
            <h2 className="mt-4 max-w-md text-balance-tight font-display text-[2rem] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[2.5rem]">
              Your shop.
              <br />
              Your rhythm.
              <br />
              Your SAVO.
            </h2>
            <p className="mt-5 max-w-sm text-[0.9375rem] leading-relaxed text-cream/70">
              Pick up where your business day left off — the sales, the stock and the debts are
              where you left them.
            </p>

            {/* A quiet object, not a fake screenshot: the receipt the sale leaves. */}
            <div className="savo-glass-a mt-9 hidden w-52 -rotate-2 rounded-2xl p-4 lg:block">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-cream/55">
                <Receipt className="size-3" />
                Receipt
              </div>
              <div className="mt-3 space-y-1.5">
                {[70, 84, 58, 74].map((width, index) => (
                  <span
                    key={width}
                    className="block h-1.5 rounded-full bg-cream/25"
                    style={{ width: `${width}%`, opacity: 1 - index * 0.15 }}
                  />
                ))}
              </div>
              <div className="mt-3 border-t border-dashed border-cream/20 pt-2 text-[9px] uppercase tracking-[0.16em] text-cream/40">
                Shop copy
              </div>
            </div>
          </div>

          <ul className="mt-10 hidden gap-4 text-[13px] text-cream/60 lg:mt-auto lg:flex lg:flex-wrap">
            <li className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-[var(--savo-mint)]" aria-hidden />
              One shop, one set of books
            </li>
            <li className="flex items-center gap-1.5">
              <Lock className="size-3.5 text-[var(--savo-mint)]" aria-hidden />
              Records kept to your shop only
            </li>
          </ul>
        </div>
      </div>

      {/* ------------------------------------------------------------ form */}
      <div className="relative -mt-6 rounded-t-[28px] bg-background px-5 pb-14 pt-8 sm:px-8 lg:mt-0 lg:flex lg:items-center lg:rounded-none lg:px-12">
        <div className="mx-auto w-full max-w-sm">
          {storageAvailable === false ? (
            <p className="mb-6 rounded-xl border border-caution/40 bg-caution-soft/60 px-3.5 py-2.5 text-xs leading-relaxed text-caution">
              This browser is blocking website storage, so signing in here will not stick. Open SAVO
              in its own tab instead of inside an embedded preview.
            </p>
          ) : null}

          {children}

          <p className="mt-8 text-center text-xs text-muted-foreground">
            Need help?{" "}
            <Link to="/support" className="font-medium text-ink underline underline-offset-4">
              Support
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

/** The heading block shared by sign-in, sign-up and recovery. */
export function AuthHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.01em] text-ink">
        {title}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
    </div>
  );
}

export function SubmitButton({
  busy,
  label,
  busyLabel = "Working…",
}: {
  busy: boolean;
  label: string;
  busyLabel?: string;
}) {
  return (
    <Button type="submit" className="h-12 w-full text-[0.9375rem]" disabled={busy}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
      {busy ? busyLabel : label}
    </Button>
  );
}

/** Footer link row: switches mode or steps back. */
export function AuthSwitchLink({
  leading,
  to,
  linkLabel,
}: {
  leading: string;
  to: "/auth/login" | "/auth/signup" | "/auth/forgot-password";
  linkLabel: string;
}) {
  return (
    <p className="mt-6 text-sm text-muted-foreground">
      {leading}{" "}
      <Link
        to={to}
        className="font-medium text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink"
      >
        {linkLabel}
      </Link>
    </p>
  );
}
