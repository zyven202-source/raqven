import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { BarChart3, Boxes, ReceiptText, ShieldCheck, Users, Wallet } from "lucide-react";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RAVQEN — Every sale. Every stock. Every number." },
      {
        name: "description",
        content:
          "RAVQEN keeps sales, stock, debtors and daily cash in one clear record for Kenyan small businesses.",
      },
      { property: "og:title", content: "RAVQEN — Every sale. Every stock. Every number." },
      {
        property: "og:description",
        content:
          "RAVQEN keeps sales, stock, debtors and daily cash in one clear record for Kenyan small businesses.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const capabilities = [
  {
    icon: ReceiptText,
    title: "Sales & receipts",
    body: "Record every sale with a receipt number, payment method and the person who served.",
  },
  {
    icon: Boxes,
    title: "Stock that moves",
    body: "Products, categories and a full movement trail so stock counts explain themselves.",
  },
  {
    icon: Wallet,
    title: "Debtors & expenses",
    body: "Track who owes what, log repayments, and keep daily spending beside the takings.",
  },
  {
    icon: Users,
    title: "Staff with limits",
    body: "Owners, managers and cashiers — each with their own access code and permissions.",
  },
  {
    icon: BarChart3,
    title: "Numbers you trust",
    body: "Cost and selling price on every line, so profit is measured and not guessed.",
  },
  {
    icon: ShieldCheck,
    title: "Locked to your shop",
    body: "Every record is tied to your shop and protected at the database level.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/auth" search={{ mode: "signup" }}>
              Get started
            </Link>
          </Button>
        </div>
      </header>

      <main>
        <section className="mx-auto w-full max-w-6xl px-5 pb-16 pt-8 sm:pt-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="max-w-2xl"
          >
            <span className="inline-flex items-center rounded-full bg-accent px-3 py-1 text-xs font-medium tracking-wide text-accent-foreground">
              Built for Kenyan small businesses
            </span>
            <h1 className="mt-5 text-balance-tight text-4xl leading-[1.08] sm:text-6xl">
              Every sale. Every stock. Every number.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              RAVQEN is the daily record book for your shop — sales, stock, debtors,
              expenses and staff, kept accurate in one place instead of five notebooks.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Create your shop
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/auth">I already have an account</Link>
              </Button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
            className="gradient-ink mt-14 grid gap-px overflow-hidden rounded-2xl p-px sm:grid-cols-3"
          >
            {[
              { label: "Today's sales", value: "Live from your till" },
              { label: "Stock on hand", value: "Counted every movement" },
              { label: "Money owed", value: "Debtor by debtor" },
            ].map((stat) => (
              <div key={stat.label} className="px-6 py-7">
                <p className="text-xs uppercase tracking-widest text-champagne/70">
                  {stat.label}
                </p>
                <p className="mt-2 font-display text-xl text-background">{stat.value}</p>
              </div>
            ))}
          </motion.div>
        </section>

        <section className="border-t border-border bg-secondary/60">
          <div className="mx-auto w-full max-w-6xl px-5 py-16">
            <h2 className="text-2xl sm:text-3xl">What RAVQEN keeps for you</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {capabilities.map((item) => (
                <div key={item.title} className="surface-panel p-5">
                  <item.icon className="size-5 text-ink-soft" aria-hidden />
                  <h3 className="mt-3 text-base font-semibold">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <Logo showTagline />
        <p>&copy; {new Date().getFullYear()} RAVQEN</p>
      </footer>
    </div>
  );
}
