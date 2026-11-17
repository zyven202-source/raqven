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

import { ClosingCta } from "@/components/marketing/Scene";
import { SiteShell } from "@/components/marketing/SiteShell";
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
      route's rendered markup — a `<script>` written inside the route component
      would only exist after JavaScript ran, which is no use to a crawler that
      does not execute it. And the router types `head().meta` as React `<meta>`
      props, where the `script:ld+json` descriptor does not fit; `head().scripts`
      maps to `headScripts`, which is rendered by one shared function for the
      prerender and for the client, so the tag in the static HTML and the tag
      React hydrates are the same element by construction.

      The JSON has to arrive as a string `children`, not as a
      `dangerouslySetInnerHTML` attribute. The router renders a src-less head
      script only when `children` is a string, so the attribute form is dropped
      in silence — no tag in the HTML, no error anywhere.
    */
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(webApplicationJsonLd()),
      },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/` }],
  }),
  component: Landing,
});

/**
 * The public home page.
 *
 * **The photograph.** A real, licensed shop interior — a ceramics and homeware
 * store lit by a single paper lantern — carries the whole opening. It is not a
 * decorative gradient behind a headline: the warm light is the focal point, the
 * shelves of real stock are the subject, and the deep shadow at the left of the
 * frame is where the copy sits. Two crops are shipped so neither screen gets a
 * bad one: a 2000×1250 landscape for desktop, where the lantern and the shelves
 * both survive, and the tall original for phones, where the lantern stays in
 * frame instead of being cropped to a strip.
 *
 * The photograph is by Jason Leung on Unsplash, used under the Unsplash License
 * (free for commercial use, no attribution required). The credit is shown in
 * the hero anyway, because a photograph is somebody's work.
 *
 * **Nothing here invents a number.** No customer counts, no testimonials, no
 * fake dashboard figures, and no simulated product screenshot. Every claim
 * below is a property of the code.
 */
function Landing() {
  return (
    <SiteShell>
      <section className="relative isolate overflow-hidden bg-[var(--savo-night)] text-cream">
        {/* ---------------------------------------------------- photograph */}
        <div aria-hidden className="absolute inset-0 -z-10">
          <picture>
            <source media="(min-width: 1024px)" srcSet="/hero/shop-wide.jpg" />
            <img
              src="/hero/shop-tall.jpg"
              alt=""
              width={1100}
              height={1468}
              fetchPriority="high"
              decoding="async"
              className="size-full object-cover object-[52%_72%] lg:object-center"
            />
          </picture>

          {/*
            The overlays are doing two jobs, and they are separate on purpose.
            The first is legibility: cream text over a photograph needs a floor
            under it, and on a phone that floor has to sit at the bottom where
            the copy is. The second is composition: on desktop the gradient runs
            left to right, so the headline stands on the shadowed shelving while
            the lantern and the shop stay fully visible on the right.
          */}
          <div className="absolute inset-0 bg-[linear-gradient(to_top,var(--savo-night)_6%,color-mix(in_oklab,var(--savo-night)_86%,transparent)_42%,color-mix(in_oklab,var(--savo-night)_40%,transparent)_74%,color-mix(in_oklab,var(--savo-night)_22%,transparent)_100%)] lg:hidden" />
          <div className="absolute inset-0 hidden bg-[linear-gradient(96deg,var(--savo-night)_0%,color-mix(in_oklab,var(--savo-night)_95%,transparent)_34%,color-mix(in_oklab,var(--savo-night)_80%,transparent)_56%,color-mix(in_oklab,var(--savo-night)_26%,transparent)_78%,transparent_94%)] lg:block" />
          {/* A last, very light scrim: pulls the mid-tones down without dimming
              the lantern, so the highlight still reads as a light source. */}
          <div className="absolute inset-0 bg-[var(--savo-night)]/18" />
        </div>

        <div className="mx-auto flex min-h-[88svh] w-full max-w-6xl flex-col justify-end px-5 pb-16 pt-24 sm:min-h-[86svh] lg:min-h-[92vh] lg:justify-center lg:pb-24 lg:pt-28">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--savo-mint)]">
              {HOME_EYEBROW}
            </p>
            <h1 className="mt-4 text-balance-tight font-display text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.025em] sm:text-6xl lg:text-[4.25rem]">
              {HOME_HEADLINE}
            </h1>
            <p className="mt-5 max-w-md text-[1.0625rem] leading-relaxed text-cream/80">
              Manage sales, inventory, expenses and customer accounts in one connected workspace —
              from the counter, the stockroom or wherever the day takes you.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/auth/signup"
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--savo-mint)] px-6 text-[0.9375rem] font-semibold text-[var(--savo-night)] transition-transform duration-200 hover:-translate-y-0.5"
              >
                Start free
                <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/features"
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/25 bg-[color-mix(in_oklab,var(--savo-night)_40%,transparent)] px-6 text-[0.9375rem] font-medium text-cream backdrop-blur-sm transition-colors hover:bg-white/10"
              >
                See how it works
              </Link>
            </div>
            <p className="mt-5 text-[13px] text-cream/60">
              No subscription, no trial clock, no card.
            </p>
          </div>
        </div>

        {/* Attribution — discreet, and a real link to the photographer's page. */}
        <a
          href="https://unsplash.com/photos/cozy-shop-interior-with-shelves-and-warm-lighting-uGPIn14r0GM"
          target="_blank"
          rel="noopener noreferrer"
          className="absolute right-4 bottom-3 z-10 text-[10px] text-cream/45 underline-offset-2 transition-colors hover:text-cream/80 hover:underline"
        >
          Photograph: Jason Leung / Unsplash
        </a>
      </section>

      {/* ------------------------------------------------------------ promise */}
      <section className="border-b border-border bg-background">
        <div className="mx-auto grid w-full max-w-6xl gap-x-8 gap-y-5 px-5 py-8 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Store, label: "For shops of any size" },
            { icon: ScanLine, label: "Sell from any device" },
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
            title="The order things happen in is the order they happen in the business."
            description="SAVO follows the working day rather than asking the business to follow the software. Each step below is a screen that already exists."
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
                  {/* Illustrative structure only — no invented figures, no fake
                      transactions, nothing that reads as a live dashboard. */}
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
            description="Not a dashboard that looks busy — a record that answers the question a business owner actually asks: why is this number what it is?"
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
                title: "Credit is a balance, not a note",
                body: "A credit sale creates a customer balance. Part payments and repayments update it, and the original sale stays attached.",
              },
              {
                icon: Banknote,
                title: "Expenses sit beside takings",
                body: "Rent, transport, packaging. The period's result is worked out with what was spent, not just what came in.",
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
              description="Sales, inventory, customer accounts, expenses, receipts, staff access and reports all work on the free account. There is no paid tier to be sold later."
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
                "Inventory, customer accounts and expenses",
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
        title="Run your business with greater clarity."
        description="Open an account, add a few products and record the first sale. SAVO keeps the stock, the balances and the numbers from there."
      />
    </SiteShell>
  );
}
