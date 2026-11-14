import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Banknote,
  Boxes,
  FileSpreadsheet,
  HandCoins,
  ReceiptText,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  Wifi,
} from "lucide-react";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { BUSINESS_DETAILS } from "@/config/legal";
import { FAQ_ITEMS } from "@/lib/faq";
import { pageMeta } from "@/lib/seo";

/**
 * Pricing, features and the questions a shop owner asks before signing up.
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
 * route-level `scripts` entry would not reach the bytes a crawler reads. Each
 * question is an `<h3>` under a single `<h1>`, which is also how a screen
 * reader reads the page.
 */
export const Route = createFileRoute("/pricing")({
  head: () => ({
    ...pageMeta({
      title: "SAVO Pricing — a free shop POS for Kenyan shops",
      description:
        "SAVO costs nothing: sales, stock, debtors, expenses, receipts, staff codes and reports on one free account. No subscription, no trial, no card. See what is included.",
      path: "/pricing",
    }),
  }),
  component: Pricing,
});

/** The features that make up the free product, in the order they matter. */
const FEATURES = [
  {
    icon: ScanLine,
    title: "Point of sale",
    body: "Scan a barcode or tap the product, then take cash, M-Pesa, card or credit. Stock comes off the shelf and the receipt is written in the same step.",
  },
  {
    icon: Boxes,
    title: "Stock ledger",
    body: "Every unit that moves leaves a reason — a sale, a delivery, a stock count, a return. When a count looks wrong, the history says why.",
  },
  {
    icon: HandCoins,
    title: "Debtors book",
    body: "Credit sales become balances, not notebook lines. Take part payments or settle in full and the outstanding amount updates itself.",
  },
  {
    icon: Banknote,
    title: "Expenses",
    body: "Rent, transport, packaging, lunch. Expenses sit beside the day's takings so the result you read is the real one.",
  },
  {
    icon: FileSpreadsheet,
    title: "Reports and CSV",
    body: "Takings, product performance and profit over any period you choose, exportable as a CSV for your own records or your accountant.",
  },
  {
    icon: Users,
    title: "Staff access codes",
    body: "One code, and your staff are inside your shop with the role you gave them. Permissions are enforced in the database, not just hidden in the UI.",
  },
  {
    icon: ReceiptText,
    title: "Receipts",
    body: "A receipt with your shop's name and logo that you can print or share with the customer.",
  },
  {
    icon: Store,
    title: "More than one shop",
    body: "Own or work in several shops from one login and switch between them. Each shop's records stay separate.",
  },
  {
    icon: ShieldCheck,
    title: "Private by default",
    body: "Row-level security keeps every shop's numbers to its own members. No adverts, no tracking scripts of our own.",
  },
  {
    icon: Wifi,
    title: "Installs like an app",
    body: "Add SAVO to your home screen and it opens full screen on Android or iPhone. It tells you plainly when the connection drops.",
  },
  {
    icon: Sparkles,
    title: "SAVO AI",
    body: "Ask about today's takings, what is running low or who owes you, and get an answer read from your own records under your own access.",
  },
] as const;

function Pricing() {
  return (
    <div className="min-h-dvh bg-background/30">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-3.5">
          <Link to="/" aria-label="SAVO home">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto w-full max-w-3xl px-5 py-14 sm:py-16">
          <p className="text-sm font-medium text-ink-soft">Pricing</p>
          <h1 className="mt-3 max-w-xl text-balance-tight text-[2.25rem] leading-[1.08] sm:text-[2.75rem]">
            A free shop POS, with nothing held back for a paid plan.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground">
            SAVO has one account and one price: nothing. There is no subscription, no free trial
            that expires, no feature locked behind an upgrade and no card details asked for.
          </p>

          <div className="mt-9 rounded-xl border border-border bg-card p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <h2 className="text-lg">Everything, on one account</h2>
              <p className="font-display text-2xl font-semibold text-ink">Free</p>
            </div>
            <ul className="mt-5 grid gap-2.5 text-sm text-muted-foreground sm:grid-cols-2">
              {[
                "Unlimited sales and products",
                "Stock, debtors and expenses",
                "Reports and CSV export",
                "Staff access codes with roles",
                "Receipts with your shop logo",
                "As many shops as you run",
                "SAVO AI included",
                "No adverts, no tracking scripts",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink-soft" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
              You pay for your own phone and data, as you already do. SAVO itself charges nothing.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button asChild className="h-11 px-5">
                <Link to="/auth/signup">Create your shop</Link>
              </Button>
              <Button asChild variant="outline" className="h-11 px-5">
                <Link to="/auth/login">I already have an account</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="border-t border-border bg-sunken" id="features">
          <div className="mx-auto w-full max-w-3xl px-5 py-14">
            <h2 className="text-xl">What is included</h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Each of these is a working screen in the app, reading and writing your shop&rsquo;s
              own records.
            </p>
            <div className="mt-7 grid gap-4 sm:grid-cols-2">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="glass-1 rounded-xl p-5">
                  <feature.icon className="size-5 text-ink-soft" aria-hidden />
                  <h3 className="mt-3 text-[0.9375rem] font-semibold">{feature.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {feature.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border" id="faq">
          <div className="mx-auto w-full max-w-3xl px-5 py-14">
            <h2 className="text-xl">Questions shop owners ask</h2>
            <div className="mt-7 space-y-7">
              {FAQ_ITEMS.map((item) => (
                <div key={item.question}>
                  <h3 className="text-[0.9375rem] font-semibold">{item.question}</h3>
                  <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
                    {item.answer}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border bg-sunken">
          <div className="mx-auto w-full max-w-3xl px-5 py-14 text-center">
            <h2 className="text-2xl leading-tight">Open your shop&rsquo;s book</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Create a shop, add a few products and make the first sale. Nothing to pay, nothing to
              cancel later.
            </p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild className="h-12 px-6 text-base">
                <Link to="/auth/signup">Create your shop</Link>
              </Button>
              <Button asChild variant="outline" className="h-12 px-6 text-base">
                <Link to="/">Back to the home page</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-3xl px-5 py-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Logo showTagline />
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} {BUSINESS_DETAILS.tradingName}
            </p>
          </div>
          <nav aria-label="Pages" className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link to="/" className="text-muted-foreground hover:text-ink hover:underline">
              Home
            </Link>
            <Link
              to="/legal/privacy"
              className="text-muted-foreground hover:text-ink hover:underline"
            >
              Privacy policy
            </Link>
            <Link
              to="/legal/terms"
              className="text-muted-foreground hover:text-ink hover:underline"
            >
              Terms of service
            </Link>
            <Link
              to="/legal/refunds"
              className="text-muted-foreground hover:text-ink hover:underline"
            >
              Refund policy
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
