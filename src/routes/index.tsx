import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Banknote,
  Boxes,
  Check,
  HandCoins,
  ScanLine,
  ShieldCheck,
  Store,
} from "lucide-react";

import { ClosingCta, TillScene } from "@/components/marketing/Scene";
import { PageHero, SiteShell } from "@/components/marketing/SiteShell";
import { PAGE_BODY, SectionHeading } from "@/components/marketing/Sections";
import { HOME_EYEBROW, HOME_HEADLINE, HOME_META, SITE_URL, webApplicationJsonLd } from "@/lib/seo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [...HOME_META],
    /*
      Structured data is emitted from `head()` rather than from a `<script>`
      tag in the component, and it goes in `scripts` rather than `meta`.

      Both choices are forced by how this app builds. It prerenders a static
      shell, and that shell carries the `head()` descriptors but **not** the
      route's rendered markup — a `<script>` written inside `Landing` would only
      exist after JavaScript ran, which is no use to a crawler that does not
      execute it. And the router types `head().meta` as React `<meta>` props,
      where the `script:ld+json` descriptor does not fit; `head().scripts` maps
      to `headScripts`, which is rendered by one shared function for the
      prerender and for the client, so the tag in the static HTML and the tag
      React hydrates are the same element by construction.

      The JSON has to arrive as a string `children`, not as a
      `dangerouslySetInnerHTML` attribute. The router renders a src-less head
      script only when `children` is a string, so the attribute form is dropped
      in silence — no tag in the HTML, no error anywhere, and the structured data
      simply does not exist.
    */
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(webApplicationJsonLd()),
      },
    ],
    // The home page is the URL a crawler is most likely to reach through a
    // variant — a trailing slash, a campaign parameter, a shared link — so it
    // names its own canonical rather than relying on the host to normalise.
    links: [{ rel: "canonical", href: `${SITE_URL}/` }],
  }),
  component: Landing,
});

/**
 * The public home page.
 *
 * The composition is deliberate: an emerald hero with one object in focus, then
 * paper sections where the reading happens, then the field again to close. The
 * page alternates ground so a visitor can feel where one movement ends and the
 * next begins — the same reason a printed prospectus changes stock between
 * chapters.
 *
 * **One `<h1>`.** It is the human sentence, not a keyword list; the search term
 * lives in the eyebrow, the title tag and the copy, which is where it can be
 * read by a person and still indexed.
 *
 * **Nothing here invents a number.** No customer counts, no testimonials, no
 * fake dashboard figures. Every claim below is a property of the code.
 */
function Landing() {
  return (
    <SiteShell>
      <PageHero eyebrow={HOME_EYEBROW} title={HOME_HEADLINE} aside={<TillScene />}>
        <p>
          SAVO is the Kenyan shop POS that brings sales, stock, expenses and customer debts into one
          dependable workspace — on the phone behind the counter, or the laptop in the back office.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            to="/auth/signup"
            className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--savo-mint)] px-6 text-[0.9375rem] font-semibold text-[var(--savo-night)] transition-transform duration-200 hover:-translate-y-0.5"
          >
            Open your shop
            <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
          <Link
            to="/features"
            className="inline-flex h-12 items-center justify-center rounded-full border border-white/20 px-6 text-[0.9375rem] font-medium text-cream transition-colors hover:bg-white/8"
          >
            See what&rsquo;s inside
          </Link>
        </div>
        <p className="mt-5 text-[13px] text-cream/55">
          Free to use. No subscription, no trial clock, no card.
        </p>
      </PageHero>

      {/* ------------------------------------------------------------ promise */}
      <section className="border-b border-border bg-background">
        <div className="mx-auto grid w-full max-w-6xl gap-x-8 gap-y-5 px-5 py-8 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Store, label: "Built for Kenyan shops" },
            { icon: ScanLine, label: "Sell from any phone" },
            { icon: Boxes, label: "A stock ledger, not a guess" },
            { icon: ShieldCheck, label: "One shop, one set of books" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2.5 text-sm text-ink">
              <item.icon className="size-4 shrink-0 text-ink-soft" aria-hidden />
              {item.label}
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------- the day's work */}
      <section className="bg-background">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
          <SectionHeading
            eyebrow="A day at the counter"
            title="The order things happen in is the order they happen at the shop."
            description="SAVO follows the day rather than asking the shop to follow the software. Each step below is a screen that already exists."
          />

          <div className="mt-12 space-y-14">
            {PAGE_BODY.map((step, index) => (
              <article
                key={step.title}
                className={`grid items-center gap-8 lg:grid-cols-2 ${
                  index % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""
                }`}
              >
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-soft">
                    {String(index + 1).padStart(2, "0")} · {step.time}
                  </p>
                  <h3 className="mt-3 font-display text-2xl font-semibold leading-tight text-ink sm:text-[1.75rem]">
                    {step.title}
                  </h3>
                  <p className="mt-3 max-w-md text-[0.9375rem] leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                  <ul className="mt-5 space-y-2">
                    {step.points.map((point) => (
                      <li key={point} className="flex items-start gap-2.5 text-sm text-ink">
                        <Check className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="savo-glass-paper rounded-3xl p-6 sm:p-8">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
                    <step.icon className="size-4" aria-hidden />
                    {step.screen}
                  </div>
                  <div className="mt-5 space-y-2.5">
                    {[72, 88, 64, 80].map((width, rowIndex) => (
                      <div
                        key={width}
                        className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/70 px-3 py-2.5"
                      >
                        <span
                          className="size-7 shrink-0 rounded-lg"
                          style={{
                            background:
                              rowIndex % 2 === 0
                                ? "color-mix(in oklab, var(--mint) 70%, white)"
                                : "color-mix(in oklab, var(--ink-soft) 16%, white)",
                          }}
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className="block h-2 rounded-full bg-ink/12"
                            style={{ width: `${width}%` }}
                          />
                          <span className="mt-1.5 block h-1.5 w-1/3 rounded-full bg-ink/8" />
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
                    {step.caption}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- proof */}
      <section className="border-y border-border bg-sunken">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
          <SectionHeading
            eyebrow="Numbers you can defend"
            title="Every figure can be traced back to what caused it."
            description="Not a dashboard that looks busy — a record that answers the question a shop owner actually asks: why is this number what it is?"
          />
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              {
                icon: Boxes,
                title: "Stock explains itself",
                body: "Each unit that moves leaves a reason — a sale, a delivery, a count, a return. When a count looks wrong, the history says why.",
              },
              {
                icon: HandCoins,
                title: "Debt is a balance, not a note",
                body: "A credit sale creates a debtor with a balance. Part payments and repayments update it, and the original sale stays attached.",
              },
              {
                icon: Banknote,
                title: "Expenses sit beside takings",
                body: "Rent, transport, packaging. The day's result is worked out with what was spent, not just what came in.",
              },
            ].map((card) => (
              <div key={card.title} className="rounded-2xl border border-border bg-card p-6">
                <card.icon className="size-5 text-ink-soft" aria-hidden />
                <h3 className="mt-4 text-base font-semibold text-ink">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- free plan */}
      <section className="bg-background">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-16 sm:py-20 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <SectionHeading
              eyebrow="Pricing"
              title="One account. Nothing to upgrade."
              description="Sales, stock, debtors, expenses, receipts, staff codes and reports all work on the free account. There is no paid tier to be sold later."
            />
            <Link
              to="/pricing"
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink"
            >
              What&rsquo;s included
              <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="savo-glass-paper rounded-3xl p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft">SAVO</p>
            <p className="mt-3 font-display text-4xl font-semibold text-ink">Free</p>
            <p className="mt-2 text-sm text-muted-foreground">
              No card, no trial, no subscription.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-ink">
              {[
                "Unlimited sales and products",
                "Stock, debtors and expenses",
                "Receipts and CSV reports",
                "Staff access codes with roles",
                "SAVO AI included",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <ClosingCta
        title="Run your shop with greater clarity."
        description="Open a shop, add a few products and make the first sale. SAVO keeps the stock, the debts and the numbers from there."
      />
    </SiteShell>
  );
}
