import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Banknote,
  Boxes,
  Check,
  FileSpreadsheet,
  HandCoins,
  ReceiptText,
  Users,
} from "lucide-react";

import { ClosingCta } from "@/components/marketing/Scene";
import { PageHero, SiteShell } from "@/components/marketing/SiteShell";
import { SectionHeading } from "@/components/marketing/Sections";
import { FAQ_ITEMS } from "@/lib/faq";
import { pageMeta } from "@/lib/seo";

/**
 * Pricing, and the questions a shop owner asks before signing up.
 *
 * **Why one page and not two.** A pricing page with no paid plan has nothing to
 * compare, so a separate "features" page would be the same sentences with a
 * different heading. The features are the argument *for* the price, so they sit
 * under it, and the FAQ answers what the sections above do not.
 *
 * **Why the FAQ is structured data, and where it is written.** `FAQPage` can
 * earn a result that expands in place, and Google only accepts it when the
 * question and answer are visible on the page — both come from
 * `src/lib/faq.json`, so the markup and the screen cannot disagree. The script
 * is written into this page's *static* head by `scripts/prerender-heads.mjs`
 * rather than declared here: this app clones one shell per public route, and a
 * route-level `scripts` entry would not reach the bytes a crawler reads.
 */
export const Route = createFileRoute("/pricing")({
  head: () =>
    pageMeta({
      title: "SAVO Pricing — a free shop POS for Kenyan shops",
      description:
        "SAVO costs nothing: sales, stock, debtors, expenses, receipts, staff codes and reports on one free account. No subscription, no trial, no card. See what is included.",
      path: "/pricing",
    }),
  component: Pricing,
});

const INCLUDED = [
  "Unlimited sales and products",
  "Stock, debtors and expenses",
  "Reports and CSV export",
  "Staff access codes with roles",
  "Receipts with your shop logo",
  "As many shops as you run",
  "SAVO AI included",
  "No adverts, no tracking scripts",
] as const;

function Pricing() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="Pricing"
        title="A free shop POS, with nothing held back for a paid plan."
        aside={
          <div className="savo-glass-a rounded-3xl p-6">
            <p className="font-display text-5xl font-semibold text-cream">Free</p>
            <p className="mt-2 text-sm text-cream/65">One account, every feature.</p>
            <ul className="mt-5 space-y-2.5 text-sm text-cream/85">
              {[
                "No subscription",
                "No expiring trial",
                "No card details",
                "No feature behind an upgrade",
              ].map((line) => (
                <li key={line} className="flex items-center gap-2.5">
                  <Check className="size-4 shrink-0 text-[var(--savo-mint)]" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        }
      >
        <p>
          SAVO has one account and one price: nothing. No subscription, no trial that expires, no
          feature locked behind an upgrade and no card details asked for.
        </p>
      </PageHero>

      <section className="bg-background">
        <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:py-16">
          <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-start">
            <div className="rounded-3xl border border-border bg-card p-7 sm:p-9">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <h2 className="font-display text-xl font-semibold text-ink">
                  Everything, on one account
                </h2>
                <p className="font-display text-3xl font-semibold text-ink">Free</p>
              </div>
              <ul className="mt-6 grid gap-2.5 text-sm text-muted-foreground sm:grid-cols-2">
                {INCLUDED.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
                You pay for your own phone and data, as you already do. SAVO itself charges nothing.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/auth/signup"
                  className="group inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-primary-foreground"
                >
                  Create your shop
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  to="/auth/login"
                  className="inline-flex h-11 items-center justify-center rounded-full border border-border px-5 text-sm font-medium text-ink hover:bg-sunken"
                >
                  I already have an account
                </Link>
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-sunken p-7 sm:p-9">
              <h2 className="font-display text-xl font-semibold text-ink">What that covers</h2>
              <div className="mt-5 space-y-4">
                {[
                  {
                    icon: Banknote,
                    title: "The counter",
                    body: "Sales, M-Pesa, card, credit and receipts — with no limit on how many.",
                  },
                  {
                    icon: Boxes,
                    title: "The shelves",
                    body: "A stock ledger with a reason beside every movement, and deliveries received by scan.",
                  },
                  {
                    icon: HandCoins,
                    title: "The debts",
                    body: "Customer balances, part payments and reminders, kept with the sale that created them.",
                  },
                  {
                    icon: FileSpreadsheet,
                    title: "The numbers",
                    body: "Reports over any period, CSV export, and expenses beside takings.",
                  },
                  {
                    icon: Users,
                    title: "The staff",
                    body: "Access codes and roles enforced in the database, at no extra cost.",
                  },
                  {
                    icon: ReceiptText,
                    title: "The paperwork",
                    body: "Receipts carrying your shop's name and logo, ready to print or share.",
                  },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-card text-ink-soft ring-1 ring-border">
                      <item.icon className="size-4" aria-hidden />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-ink">{item.title}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                        {item.body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-sunken" id="faq">
        <div className="mx-auto w-full max-w-3xl px-5 py-14 sm:py-16">
          <SectionHeading
            eyebrow="Questions"
            title="What shop owners ask before signing up."
            description="Short answers, written from how the software actually behaves."
          />
          <dl className="mt-9 space-y-7">
            {FAQ_ITEMS.map((item) => (
              <div key={item.question}>
                <dt>
                  <h3 className="text-[0.9375rem] font-semibold text-ink">{item.question}</h3>
                </dt>
                <dd className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  {item.answer}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <ClosingCta
        title="Nothing to pay, nothing to cancel later."
        description="Create a shop, add a few products and make the first sale. If it does not fit your shop, you have lost nothing."
        secondary={{ to: "/support", label: "Ask a question" }}
      />
    </SiteShell>
  );
}
