import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Compass, Eye, HeartHandshake, Scale } from "lucide-react";

import { ClosingCta } from "@/components/marketing/Scene";
import { PageHero, SiteShell } from "@/components/marketing/SiteShell";
import { BUSINESS_DETAILS, CONTACT_PHONE } from "@/config/legal";
import { pageMeta } from "@/lib/seo";

export const Route = createFileRoute("/about")({
  head: () =>
    pageMeta({
      title: "About SAVO — shop software for Kenyan retailers",
      description:
        "Why SAVO exists: a shop's records should belong to the shop, stay readable on a cheap phone, and be honest about what they show.",
      path: "/about",
    }),
  component: AboutPage,
});

/**
 * The about page.
 *
 * It tells a **product-mission story**, not a company history. No founding date,
 * no headcount, no user numbers, no awards — none of those are facts this
 * project can stand behind, and an invented one is a correction waiting to be
 * filed. What it can state is how the software behaves and why.
 */
function AboutPage() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="About"
        title="A shop's records should belong to the shop."
        aside={
          <div className="savo-glass-a rounded-3xl p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cream/50">
              In short
            </p>
            <dl className="mt-4 space-y-4">
              {[
                { term: "Built for", detail: "Shops and small retailers in Kenya" },
                { term: "Cost", detail: "Free — no tier, no trial, no card" },
                { term: "Data", detail: "Visible only to that shop's members" },
                { term: "Based", detail: "Nairobi, Kenya" },
              ].map((item) => (
                <div key={item.term}>
                  <dt className="text-[11px] uppercase tracking-[0.14em] text-cream/40">
                    {item.term}
                  </dt>
                  <dd className="mt-0.5 text-sm text-cream/90">{item.detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        }
      >
        <p>
          SAVO began from a plain observation: in many small shops the day&rsquo;s truth lives in a
          notebook, a phone gallery and one person&rsquo;s memory. The figures exist — they are just
          not written anywhere two people can read together.
        </p>
      </PageHero>

      <section className="bg-background">
        <div className="mx-auto w-full max-w-3xl px-5 py-16 sm:py-20">
          <div className="space-y-5 text-[1.0625rem] leading-[1.75] text-muted-foreground">
            <p>
              The software that was supposed to fix this usually arrived as an enterprise system
              with a training course attached, or as a spreadsheet nobody maintained after the
              second week. Both assume a shop has a back office and a person in it. Most shops have
              a counter, a phone, and a queue.
            </p>
            <p className="text-ink">
              So SAVO starts at the counter and works outward: a sale first, then the stock it
              moved, then the debt it created, then the day it belongs to.
            </p>
            <p>
              Everything else follows from that order. The screens are built to be used with one
              thumb in daylight. The numbers are formatted to line up so a column can be read at a
              glance. The stock ledger keeps a reason beside every movement, because a number
              without a cause can only be trusted or distrusted — never checked.
            </p>
          </div>

          <div className="my-12 h-px bg-border" />

          <h2 className="font-display text-2xl font-semibold text-ink">What we hold to</h2>
          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            {[
              {
                icon: Eye,
                title: "Honest figures",
                body: "Revenue is not profit. An estimate is labelled as one. An empty month is shown empty, not smoothed into a chart that implies activity that did not happen.",
              },
              {
                icon: Compass,
                title: "The shop's rhythm",
                body: "The software follows the day the shop already has. Nothing is renamed into corporate vocabulary, and no workflow asks the shopkeeper to change how the shop works.",
              },
              {
                icon: HeartHandshake,
                title: "Free, without a catch",
                body: "There is no paid tier, no trial clock and no advertising. A shop that cannot pay should still keep its own books.",
              },
              {
                icon: Scale,
                title: "The shop owns its data",
                body: "Records are readable only by that shop's members, enforced in the database. There is no analytics script of ours watching the counter.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-border bg-card p-6">
                <item.icon className="size-5 text-ink-soft" aria-hidden />
                <h3 className="mt-4 text-base font-semibold text-ink">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>

          <div className="my-12 h-px bg-border" />

          <h2 className="font-display text-2xl font-semibold text-ink">What SAVO is not</h2>
          <ul className="mt-5 space-y-3 text-[0.9375rem] leading-relaxed text-muted-foreground">
            {[
              "Not an accounting package. It keeps the shop's records; your accountant still does the accounts.",
              "Not a payments processor. It records M-Pesa, cash, card and credit; it does not move money.",
              "Not a forecasting tool. It reports what happened, not what might.",
              "Not a marketplace. There is nothing to buy here except the software, and that is free.",
            ].map((line) => (
              <li key={line} className="flex gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-soft" />
                {line}
              </li>
            ))}
          </ul>

          <div className="mt-12 rounded-2xl border border-border bg-sunken p-6">
            <h2 className="text-lg font-semibold text-ink">Talk to the people who build it</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Questions, a bug, or a workflow that does not fit your shop — write or call. It
              reaches the same small team that writes the code.
            </p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <a
                href={`mailto:${BUSINESS_DETAILS.contactEmail}`}
                className="font-medium text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink"
              >
                {BUSINESS_DETAILS.contactEmail}
              </a>
              <a
                href={`tel:${CONTACT_PHONE}`}
                className="font-medium text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink"
              >
                {CONTACT_PHONE.replace(/^(\d{4})(\d{3})(\d{3})$/, "$1 $2 $3")}
              </a>
              <Link
                to="/support"
                className="font-medium text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink"
              >
                Support
              </Link>
            </div>
          </div>

          <div className="mt-10">
            <Link
              to="/features"
              className="group inline-flex items-center gap-2 text-sm font-semibold text-ink"
            >
              See what the software actually does
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </section>

      <ClosingCta
        title="Keep the shop's books in the shop's hands."
        description="Open an account, add your products and record the next sale. It costs nothing and it stays yours."
        secondary={{ to: "/about", label: "Read about SAVO" }}
      />
    </SiteShell>
  );
}
