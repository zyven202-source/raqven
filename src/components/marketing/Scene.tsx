import { Link } from "@tanstack/react-router";
import { Banknote, Boxes, HandCoins, ReceiptText, ScanLine } from "lucide-react";

/**
 * The public site's artwork.
 *
 * **What this is not.** It is not a screenshot with invented numbers in it. This
 * product has real shops with real figures, and a marketing page that draws a
 * fake "KSh 48,320 today" is a lie a shopkeeper can check in one tap once they
 * sign up. So the composition shows the *shape* of the product — a till, a
 * receipt, a stock row — and labels the parts instead of inventing values.
 *
 * **How it is built.** Layers of glass at different depths over the emerald
 * field, with one object in focus (the receipt) and the rest behind it. All
 * shapes are CSS; nothing is an image, so it is sharp at any size, costs no
 * request and inherits the brand tokens.
 */
export function TillScene() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none" aria-hidden>
      <div className="savo-halo -top-6 left-10 size-64 bg-[var(--savo-mint)]/25" />

      {/* The till: the object the eye lands on first. */}
      <div className="savo-glass-a relative rounded-[28px] p-5">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cream/60">
            <ScanLine className="size-3.5 text-[var(--savo-mint)]" />
            Point of sale
          </span>
          <span className="rounded-full border border-[var(--savo-mint)]/30 bg-[var(--savo-mint)]/10 px-2.5 py-1 text-[10px] font-medium text-[var(--savo-mint)]">
            Ready
          </span>
        </div>

        {/* The basket: labelled rows, deliberately without invented money. */}
        <ul className="mt-4 space-y-2">
          {[
            { icon: Boxes, label: "Product added to the basket", note: "scanned" },
            { icon: Banknote, label: "Cash · M-Pesa · Card · Credit", note: "payment" },
            { icon: HandCoins, label: "Credit sale becomes a debtor", note: "balance" },
          ].map((row) => (
            <li
              key={row.label}
              className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/6 px-3 py-2.5"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--savo-emerald)]/40 text-[var(--savo-mint)]">
                <row.icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1 text-[13px] leading-snug text-cream/90">
                {row.label}
              </span>
              <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-cream/40">
                {row.note}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-[var(--savo-mint)] px-3.5 py-2.5 text-[var(--savo-night)]">
          <span className="text-[13px] font-semibold">Take payment</span>
          <span className="text-[11px] font-medium opacity-70">one tap</span>
        </div>
      </div>

      {/*
        The receipt: the record the sale leaves behind. It sits in the flow and
        is pulled up over the till's bottom padding by a few pixels — enough to
        read as a separate sheet, not enough to cover the "Take payment" bar.
        An earlier version hung off the corner at `-bottom-10`, which looks
        better in isolation and hides the primary action underneath it.
        Below `sm` it drops straight into the flow with no pull at all, because
        at 320px the overlap landed on the basket labels.
      */}
      <div className="savo-glass-b mt-3 w-full rounded-2xl p-3.5 sm:-mt-6 sm:ml-6 sm:w-44 sm:rotate-[-3deg]">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cream/55">
          <ReceiptText className="size-3" />
          Receipt
        </div>
        <div className="mt-2.5 space-y-1.5">
          {[64, 78, 52, 70].map((width, index) => (
            <span
              key={width}
              className="block h-1.5 rounded-full bg-cream/25"
              style={{ width: `${width}%`, opacity: 1 - index * 0.16 }}
            />
          ))}
        </div>
        <div className="mt-3 border-t border-dashed border-cream/20 pt-2 text-[9px] uppercase tracking-[0.16em] text-cream/40">
          Shop copy
        </div>
      </div>

      {/* Stock, behind the till: depth without noise. Raised clear of the
          "Ready" pill it used to sit on top of. */}
      <div className="savo-glass-c absolute -right-4 -top-16 hidden w-36 rotate-[5deg] rounded-2xl p-3 sm:block">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--savo-mint)]">
          <Boxes className="size-3" />
          Stock
        </div>
        <div className="mt-2 space-y-1.5">
          <span className="block h-1.5 w-4/5 rounded-full bg-[var(--savo-mint)]/40" />
          <span className="block h-1.5 w-3/5 rounded-full bg-[var(--savo-mint)]/25" />
          <span className="block h-1.5 w-2/3 rounded-full bg-[var(--savo-mint)]/20" />
        </div>
      </div>
    </div>
  );
}

/** A closing band: one sentence, one action, the same field as the hero. */
export function ClosingCta({
  title,
  description,
  primary = { to: "/auth/signup", label: "Open your shop" },
  secondary = { to: "/features", label: "See what's inside" },
}: {
  title: string;
  description: string;
  primary?: { to: string; label: string };
  secondary?: { to: string; label: string };
}) {
  return (
    <section className="savo-field on-field relative overflow-hidden">
      <div
        aria-hidden
        className="savo-halo left-1/2 top-0 size-80 -translate-x-1/2 bg-[var(--savo-mint)]/20"
      />
      <div className="relative mx-auto w-full max-w-3xl px-5 py-20 text-center">
        <h2 className="text-balance-tight font-display text-3xl font-semibold leading-tight sm:text-4xl">
          {title}
        </h2>
        <p className="mx-auto mt-4 max-w-md text-[0.9375rem] leading-relaxed text-cream/70">
          {description}
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to={primary.to}
            className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--savo-mint)] px-6 text-[0.9375rem] font-semibold text-[var(--savo-night)] transition-transform duration-200 hover:-translate-y-0.5"
          >
            {primary.label}
          </Link>
          <Link
            to={secondary.to}
            className="inline-flex h-12 items-center justify-center rounded-full border border-white/20 px-6 text-[0.9375rem] font-medium text-cream transition-colors hover:bg-white/8"
          >
            {secondary.label}
          </Link>
        </div>
      </div>
    </section>
  );
}
