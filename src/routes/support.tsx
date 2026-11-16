import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Banknote,
  Boxes,
  HandCoins,
  KeyRound,
  Mail,
  MessageSquare,
  Phone,
  ReceiptText,
  ScanLine,
} from "lucide-react";

import { PageHero, SiteShell } from "@/components/marketing/SiteShell";
import { BUSINESS_DETAILS, CONTACT_PHONE } from "@/config/legal";
import { pageMeta } from "@/lib/seo";

export const Route = createFileRoute("/support")({
  head: () =>
    pageMeta({
      title: "SAVO Support — help with sales, stock and sign-in",
      description:
        "Get help with SAVO: ask the in-app assistant, find the right screen for a sale, a stock count, a debtor payment or a sign-in problem, or contact a person directly.",
      path: "/support",
    }),
  component: SupportPage,
});

/**
 * The support page.
 *
 * It is a destination, not a marketing page with a form on it. Three exits, in
 * the order they actually solve problems: the assistant inside the app (fastest,
 * knows the shop's records), the screen-by-screen guide, then a human.
 *
 * There is no contact form here on purpose — a form implies a queue and a
 * ticket number this project does not have. Email and phone go somewhere a
 * person reads.
 */
const TOPICS = [
  {
    icon: ScanLine,
    title: "Making a sale",
    body: "Scanning, choosing a payment method, a sale that did not go through, and how to reprint a receipt.",
    to: "/features",
    hash: "pos",
  },
  {
    icon: Boxes,
    title: "Stock and deliveries",
    body: "Receiving stock, correcting a count, and understanding why a product shows a different number from the shelf.",
    to: "/features",
    hash: "stock",
  },
  {
    icon: HandCoins,
    title: "Debtors and payments",
    body: "Recording a part payment, settling a balance, and sending a reminder from the record.",
    to: "/features",
    hash: "debtors",
  },
  {
    icon: Banknote,
    title: "Expenses and the day's result",
    body: "Adding an expense, editing one, and reading takings against what was spent.",
    to: "/features",
    hash: "expenses",
  },
  {
    icon: ReceiptText,
    title: "Receipts and refunds",
    body: "What the customer receives, shop details on the receipt, and how a refund is recorded.",
    to: "/features",
    hash: "sales",
  },
  {
    icon: KeyRound,
    title: "Signing in and staff access",
    body: "Forgotten passwords, access codes for staff, and what an employee account can and cannot see.",
    to: "/features",
    hash: "staff",
  },
] as const;

function SupportPage() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="Support"
        title="Something not working? Start here."
        aside={
          <div className="savo-glass-a rounded-3xl p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cream/50">
              Reach a person
            </p>
            <a
              href={`mailto:${BUSINESS_DETAILS.contactEmail}`}
              className="mt-4 flex items-center gap-3 text-sm font-medium text-cream"
            >
              <span className="grid size-9 place-items-center rounded-lg bg-white/8 text-[var(--savo-mint)]">
                <Mail className="size-4" aria-hidden />
              </span>
              {BUSINESS_DETAILS.contactEmail}
            </a>
            <a
              href={`tel:${CONTACT_PHONE}`}
              className="mt-3 flex items-center gap-3 text-sm font-medium text-cream"
            >
              <span className="grid size-9 place-items-center rounded-lg bg-white/8 text-[var(--savo-mint)]">
                <Phone className="size-4" aria-hidden />
              </span>
              {CONTACT_PHONE.replace(/^(\d{4})(\d{3})(\d{3})$/, "$1 $2 $3")}
            </a>
            <p className="mt-4 border-t border-white/10 pt-3 text-xs leading-relaxed text-cream/55">
              Working hours in Nairobi. Leave the shop name and what you were doing.
            </p>
          </div>
        }
      >
        <p>
          Most questions are answered faster inside the app than by email. If none of this helps,
          the contact details at the bottom reach a person.
        </p>
      </PageHero>

      <section className="bg-background">
        <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:py-16">
          <div className="rounded-3xl border border-border bg-card p-7 sm:p-9">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="max-w-lg">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft">
                  <MessageSquare className="size-4" aria-hidden />
                  Fastest
                </p>
                <h2 className="mt-3 font-display text-2xl font-semibold text-ink">
                  Ask SAVO AI, inside the app.
                </h2>
                <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted-foreground">
                  The assistant can answer questions about this shop&rsquo;s own records —
                  today&rsquo;s takings, what is running low, who owes you — and explain how a
                  screen works. Sign in, then tap the assistant button in the corner.
                </p>
              </div>
              <Link
                to="/auth/login"
                className="group inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-primary-foreground"
              >
                Open the app
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
              It reads your records under your own session, so it can only see what you can see. It
              cannot change a price, a balance or a permission.
            </p>
          </div>

          <h2 className="mt-14 font-display text-2xl font-semibold text-ink">Common topics</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TOPICS.map((topic) => (
              <Link
                key={topic.title}
                to={topic.to}
                hash={topic.hash}
                className="group rounded-2xl border border-border bg-card p-5 transition-colors hover:border-ink/25"
              >
                <topic.icon className="size-5 text-ink-soft" aria-hidden />
                <h3 className="mt-3 text-[0.9375rem] font-semibold text-ink">{topic.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{topic.body}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-ink-soft">
                  Read
                  <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>

          <div className="mt-14 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
            <div className="rounded-2xl border border-border bg-sunken p-6">
              <h2 className="font-display text-xl font-semibold text-ink">Talking to a person</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Include the shop name, what you were doing, and what you expected to happen. Please
                never send your password — nobody here needs it.
              </p>
              <div className="mt-5 space-y-3">
                <a
                  href={`mailto:${BUSINESS_DETAILS.contactEmail}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-ink hover:border-ink/25"
                >
                  <Mail className="size-4 text-ink-soft" aria-hidden />
                  {BUSINESS_DETAILS.contactEmail}
                </a>
                <a
                  href={`tel:${CONTACT_PHONE}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-ink hover:border-ink/25"
                >
                  <Phone className="size-4 text-ink-soft" aria-hidden />
                  {CONTACT_PHONE.replace(/^(\d{4})(\d{3})(\d{3})$/, "$1 $2 $3")}
                </a>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                This is a small team. Replies come during working hours in Nairobi, as soon as
                someone can look properly at the problem.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="font-display text-xl font-semibold text-ink">Before you write</h2>
              <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-muted-foreground">
                {[
                  "Try the same action once more; a second failure is a better clue.",
                  "Check whether the screen still shows a figure you expected — screenshots help.",
                  "Note the time it happened and which account was signed in.",
                  "If a receipt did not print, say whether it printed before that day.",
                ].map((line) => (
                  <li key={line} className="flex gap-2.5">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-soft" />
                    {line}
                  </li>
                ))}
              </ul>
              <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
                Data and account questions are answered in the{" "}
                <Link to="/legal/privacy" className="font-medium text-ink underline">
                  privacy policy
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
