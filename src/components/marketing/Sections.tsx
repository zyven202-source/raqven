import { Banknote, Boxes, HandCoins, ScanLine } from "lucide-react";

/**
 * Section furniture for the public site.
 *
 * Two rules, and they are the reason this is a component rather than a class
 * string repeated five times:
 *
 *   1. **One heading level per band.** A section gets an `<h2>`; what it
 *      contains gets `<h3>`. The outline is the page read aloud, and a marketing
 *      page that jumps from `<h1>` to `<h4>` because the type scale looked
 *      better is a page a screen reader cannot navigate.
 *   2. **The eyebrow carries the label, the heading carries the sentence.** The
 *      label is small caps and quiet; the heading is the thing a person reads.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  className = "",
}: {
  eyebrow: string;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft">{eyebrow}</p>
      <h2 className="mt-3 max-w-2xl text-balance-tight font-display text-[1.875rem] font-semibold leading-[1.12] tracking-[-0.01em] text-ink sm:text-[2.25rem]">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 max-w-xl text-[0.9375rem] leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The four moments the home page walks through.
 *
 * `screen` names the actual screen in the product, so a visitor can find it
 * after signing up. `caption` explains what the sketch beside it represents —
 * the sketch is deliberately abstract and carries no invented figures.
 */
export const PAGE_BODY = [
  {
    time: "Morning",
    title: "Scan it, sell it, done.",
    screen: "Point of sale",
    icon: ScanLine,
    body: "A barcode or a tap on the product, then cash, M-Pesa, card or credit. The stock comes off the shelf and the receipt is written in the same movement.",
    points: ["Works on the phone you already carry", "Credit sales become balances, not notes"],
    caption: "The basket: scanned items, one payment step, a receipt the customer keeps.",
  },
  {
    time: "Midday",
    title: "Book in what arrived.",
    screen: "Stock and restock",
    icon: Boxes,
    body: "A delivery is a movement, not an overwrite. Every unit that arrives is recorded against its product, so the count on screen matches the shelf.",
    points: ["Every movement states its reason", "Low stock is visible before it is a problem"],
    caption: "The ledger: what came in, what went out, and why each time.",
  },
  {
    time: "Afternoon",
    title: "Take the repayment.",
    screen: "Debtors",
    icon: HandCoins,
    body: "The customer who took goods on credit is a balance with a history, not a name in a notebook. Take part of it or settle it, and the balance updates itself.",
    points: ["Part payments and repayments", "Reminders sent from the record itself"],
    caption: "The debt: the original sale, what has been paid, what is still owed.",
  },
  {
    time: "Evening",
    title: "See how the day actually went.",
    screen: "Reports and expenses",
    icon: Banknote,
    body: "Takings beside expenses, over the period you choose. Not revenue dressed up as profit — the figures the shop can defend, with the numbers behind them one tap away.",
    points: [
      "Expenses recorded where they happened",
      "Export the records as CSV when you need them",
    ],
    caption: "The day's result: what came in, what went out, and what is left.",
  },
] as const;
