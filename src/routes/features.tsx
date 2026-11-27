import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Banknote,
  Boxes,
  FileSpreadsheet,
  HandCoins,
  ReceiptText,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import { ClosingCta } from "@/components/marketing/Scene";
import { PageHero, SiteShell } from "@/components/marketing/SiteShell";
import { pageMeta } from "@/lib/seo";

export const Route = createFileRoute("/features")({
  head: () =>
    pageMeta({
      title: "SAVO Features — POS, inventory, customer accounts and reports",
      description:
        "What SAVO does: point of sale with cash, card, mobile money and credit, a stock ledger that records why every unit moved, customer accounts with part payments, expenses, receipts and reports.",
      path: "/features",
    }),
  component: FeaturesPage,
});

/**
 * The features page.
 *
 * Each section answers three questions in order: what the screen is for, what it
 * records, and what it refuses to pretend. The last one matters more than it
 * sounds — a features page that implies forecasting or automatic payments the
 * product does not have is a support ticket waiting to happen.
 *
 * Composition alternates deliberately: a wide editorial passage, then a tighter
 * two-column band, then wide again. Identical sections stacked would read as a
 * list no matter how good the type was.
 */

const FEATURES = [
  {
    id: "pos",
    icon: ScanLine,
    eyebrow: "Point of sale",
    title: "The counter, at the speed of the queue.",
    body: "Scan a barcode or tap the product. Choose cash, card, mobile money or credit, and the sale is written once — stock deducted, receipt produced, balance updated if it was credit.",
    points: [
      "Search by name or scan the barcode",
      "Cash, card, mobile money and credit on the same screen",
      "A duplicate tap cannot create a second sale",
      "The receipt prints or shares from the same record",
    ],
    note: "Mobile money is recorded as a payment method. SAVO does not move money or confirm a transfer with any network.",
  },
  {
    id: "stock",
    icon: Boxes,
    eyebrow: "Inventory",
    title: "A ledger where every movement has a reason.",
    body: "Stock is not a number you overwrite. Each unit that moves is a movement with a cause — sold, received, counted, returned — so a disagreement with the shelf can be traced instead of argued about.",
    points: [
      "Receive a delivery by scanning the boxes",
      "Low and out-of-stock products surface before they cost a sale",
      "Stock history per product, in order",
      "Counts correct the ledger without erasing it",
    ],
    note: "There is no automatic supplier ordering and no forecasting. Reordering is a decision the shop makes.",
  },
  {
    id: "debtors",
    icon: HandCoins,
    eyebrow: "Customer accounts",
    title: "Credit that stays attached to the sale that created it.",
    body: "A credit sale becomes a customer balance rather than a line in a notebook. Part payments and repayments adjust the balance, and the history shows what was bought and what has been paid.",
    points: [
      "Part payments, not just settled-or-not",
      "Reminders prepared from the record itself",
      "Every payment keeps its date and amount",
    ],
    note: "A reminder opens WhatsApp with the message prepared. SAVO cannot know whether it was sent or read.",
  },
  {
    id: "expenses",
    icon: Banknote,
    eyebrow: "Expenses",
    title: "What went out, recorded where it happened.",
    body: "Rent, transport, packaging, lunch. Expenses sit in the same period as the takings they belong to, so the day's result is worked out honestly rather than from revenue alone.",
    points: [
      "Categories that match how a shop actually spends",
      "Edits and deletions keep the original record in the log",
      "Totals per period, beside sales",
    ],
    note: "Revenue is never shown as profit. Profit appears only where the cost data exists to support it.",
  },
  {
    id: "sales",
    icon: ReceiptText,
    eyebrow: "Sales and refunds",
    title: "Every transaction keeps its own record.",
    body: "Search a day, a payment method or a customer and open the sale itself: line items, quantities, amounts, timestamps, and the refund if there was one.",
    points: [
      "Refunds are deliberate: reviewed, then confirmed",
      "Receipts reprint from the original sale",
      "Filters that follow the shop's own calendar",
    ],
    note: "A refund reverses a specific sale. It is not a general adjustment tool and it is logged as its own event.",
  },
  {
    id: "reports",
    icon: FileSpreadsheet,
    eyebrow: "Reports",
    title: "The period you choose, in figures you can check.",
    body: "Takings, product performance, expenses and stock over any period, with the CSV export carrying exactly the rows on screen.",
    points: [
      "One period selector for the whole workspace",
      "Charts only where the data supports them",
      "CSV export for your own records or your accountant",
    ],
    note: "Comparisons appear only when both periods have real data. An empty month is shown as empty.",
  },
  {
    id: "staff",
    icon: Users,
    eyebrow: "Staff and access",
    title: "The right people, and only the right screens.",
    body: "An owner creates one access code; staff sign up with it and land inside the shop. What an employee may see and do is enforced in PostgreSQL, not hidden in the browser.",
    points: [
      "Owner and employee roles with real boundaries",
      "Access codes can be retired and replaced",
      "Another shop's records are unreachable, not just hidden",
    ],
    note: "Hiding a button is not how access is controlled here. The database refuses the query.",
  },
  {
    id: "assistant",
    icon: Sparkles,
    eyebrow: "SAVO AI",
    title: "A question answered from your own books.",
    body: "Ask about today's takings, what is running low, or who owes you. The assistant reads the shop's records under your own session, so it can only see what you can see.",
    points: [
      "Answers cite the period they describe",
      "Reads stock, sales, expenses and debtors",
      "Never invents a figure that is not in the records",
    ],
    note: "It is read-only. It will not change a price, a balance or a permission.",
  },
  {
    id: "settings",
    icon: ShieldCheck,
    eyebrow: "Settings and receipt",
    title: "The shop's name, on the shop's paperwork.",
    body: "Shop profile, logo and receipt details live together, with a preview of what the customer will actually receive.",
    points: [
      "Logo and shop name on every receipt",
      "Receipt options in one place",
      "Changes confirmed by the backend before they are shown as saved",
    ],
    note: "There are no settings that do nothing. If a switch exists, it changes behaviour.",
  },
] as const;

/**
 * The real screen behind each section.
 *
 * Each file is a capture of the deployed application at 412×728 with the shop's
 * header cropped off, so the panel shows the screen itself. A section whose
 * screenshot is missing falls back to the record list alone rather than to a
 * placeholder.
 */
const SCREENS: Record<string, string> = {
  pos: "/showcase/showcase-pos.png",
  stock: "/showcase/showcase-stock.png",
  debtors: "/showcase/showcase-debtors.png",
  expenses: "/showcase/showcase-expenses.png",
  sales: "/showcase/showcase-sales.png",
  reports: "/showcase/showcase-reports.png",
  staff: "/showcase/showcase-staff.png",
  assistant: "/showcase/showcase-assistant.png",
  settings: "/showcase/showcase-settings.png",
};

function FeaturesPage() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="Features"
        title={
          <>
            Every part of the shop,
            <br className="hidden sm:block" /> in one workspace.
          </>
        }
        aside={
          /* A real index, not decoration: every row jumps to its own section. */
          <nav
            aria-label="Feature sections"
            className="rounded-3xl border border-[var(--brand-line)] bg-[var(--brand-raised)] p-5"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cream/50">
              On this page
            </p>
            <ul className="mt-3 divide-y divide-white/8">
              {FEATURES.map((feature) => (
                <li key={feature.id}>
                  <a
                    href={`#${feature.id}`}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm text-cream/85 transition-colors hover:text-cream"
                  >
                    <span className="flex items-center gap-2.5">
                      <feature.icon className="size-4 text-[var(--savo-mint)]" aria-hidden />
                      {feature.eyebrow}
                    </span>
                    <ArrowRight className="size-3.5 text-cream/30" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        }
      >
        <p>
          SAVO is a point of sale, an inventory ledger, a customer-accounts book and a reporting
          tool — built for retailers who need the day&rsquo;s numbers to be defensible, not
          decorated.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            to="/auth/signup"
            className="group inline-flex h-11 items-center gap-2 rounded-full bg-[var(--savo-mint)] px-5 text-sm font-semibold text-[var(--savo-night)] transition-transform duration-200 hover:-translate-y-0.5"
          >
            Open your shop
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            to="/pricing"
            className="inline-flex h-11 items-center rounded-full border border-[var(--brand-line)] bg-[var(--brand-raised)] px-5 text-sm font-medium text-cream transition-colors hover:bg-[var(--brand-surface)]"
          >
            It&rsquo;s free
          </Link>
        </div>
      </PageHero>

      <div className="bg-background">
        {FEATURES.map((feature, index) => (
          <section
            key={feature.id}
            id={feature.id}
            className={index > 0 ? "border-t border-border" : ""}
          >
            <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-14 sm:py-16 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
              <div>
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft">
                  <feature.icon className="size-4" aria-hidden />
                  {feature.eyebrow}
                </p>
                <h2 className="mt-3 max-w-md font-display text-[1.75rem] font-semibold leading-[1.16] text-cream sm:text-[2rem]">
                  {feature.title}
                </h2>
                <p className="mt-4 max-w-md text-[0.9375rem] leading-relaxed text-muted-foreground">
                  {feature.body}
                </p>
                <p className="mt-5 max-w-md border-l-2 border-ink/12 pl-3 text-[13px] leading-relaxed text-muted-foreground">
                  {feature.note}
                </p>

                <div className="mt-7 max-w-md border-t border-border pt-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--savo-mint)]">
                    What it records
                  </p>
                  <ul className="mt-3 space-y-2.5">
                    {feature.points.map((point) => (
                      <li
                        key={point}
                        className="flex items-start gap-3 text-sm leading-relaxed text-cream/85"
                      >
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-positive" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <figure className="overflow-hidden rounded-3xl border border-border bg-card">
                <div className="flex items-baseline justify-between gap-3 border-b border-border px-5 py-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cream/65">
                    {feature.eyebrow}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-cream/30">
                    From the running app
                  </span>
                </div>

                {SCREENS[feature.id] ? (
                  <div className="bg-sunken p-4 sm:p-5">
                    <div className="relative mx-auto aspect-[412/496] w-full max-w-[21rem] overflow-hidden rounded-xl border border-border">
                      <img
                        src={SCREENS[feature.id]}
                        alt={`SAVO ${feature.eyebrow} screen`}
                        width={412}
                        height={728}
                        loading="lazy"
                        decoding="async"
                        className="size-full object-cover object-top"
                      />
                      {/*
                        The screen continues past the frame, so the cut is a fade
                        into the card rather than a word sliced in half.
                      */}
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-[linear-gradient(to_top,var(--sunken),transparent)]"
                      />
                    </div>
                  </div>
                ) : null}
              </figure>
            </div>
          </section>
        ))}
      </div>

      <section className="border-t border-border bg-sunken">
        <div className="mx-auto w-full max-w-6xl px-5 py-14">
          <div className="grid gap-6 sm:grid-cols-2">
            <Link
              to="/pricing"
              className="group rounded-2xl border border-border bg-card p-6 transition-colors hover:border-ink/25"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">
                Next
              </p>
              <p className="mt-2 font-display text-xl text-cream">What it costs</p>
              <p className="mt-1 text-sm text-muted-foreground">
                One account, nothing to upgrade — and no card.
              </p>
            </Link>
            <Link
              to="/support"
              className="group rounded-2xl border border-border bg-card p-6 transition-colors hover:border-ink/25"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">
                Stuck?
              </p>
              <p className="mt-2 font-display text-xl text-cream">Talk to someone</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Help with a sale, a stock count or a login.
              </p>
            </Link>
          </div>
        </div>
      </section>

      <ClosingCta
        title="See it on your own counter."
        description="Open a shop, add a few products and make the first sale. Everything on this page is already working."
        secondary={{ to: "/support", label: "Ask a question" }}
      />
    </SiteShell>
  );
}
