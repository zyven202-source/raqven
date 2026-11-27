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
import { PHOTOGRAPHY, creditLine } from "@/lib/photography";
import { SiteShell } from "@/components/marketing/SiteShell";
import { PAGE_BODY, SectionHeading } from "@/components/marketing/Sections";
import { HOME_EYEBROW, HOME_HEADLINE, HOME_META, SITE_URL, webApplicationJsonLd } from "@/lib/seo";

const SCREEN_SHOTS = [
  "/showcase/showcase-pos.png",
  "/showcase/showcase-stock.png",
  "/showcase/showcase-debtors.png",
  "/showcase/showcase-reports.png",
] as const;

/*
 * The gallery at the end of the page.
 *
 * Every file here is a capture of the deployed application at 412×728, taken
 * with the shop's header bar cropped off so the screen — not the test shop's
 * name — is what a visitor sees. They are deliberately unretouched: the same
 * cards, the same empty states and the same numbers the app shows.
 */
const GALLERY = [
  { src: "/showcase/showcase-pos.png", label: "Point of sale", note: "Till" },
  { src: "/showcase/showcase-stock.png", label: "Stock", note: "Inventory" },
  { src: "/showcase/showcase-reports.png", label: "Reports", note: "Period" },
  { src: "/showcase/showcase-debtors.png", label: "Customer accounts", note: "Credit" },
  { src: "/showcase/showcase-expenses.png", label: "Expenses", note: "Costs" },
  { src: "/showcase/showcase-sales.png", label: "Transactions", note: "Sales" },
] as const;

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
 * The photograph is a real boutique interior by Clark Street Mercantile on
 * Unsplash, used under the Unsplash License (free for commercial use, no
 * attribution required). Its source page is recorded in `src/lib/photography.ts`
 * and the credit is shown in the hero anyway, because a photograph is
 * somebody's work.
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
          <img
            src={PHOTOGRAPHY.hero.src}
            alt={PHOTOGRAPHY.hero.alt}
            width={PHOTOGRAPHY.hero.width}
            height={PHOTOGRAPHY.hero.height}
            fetchPriority="high"
            decoding="async"
            className="size-full object-cover"
            style={{ objectPosition: PHOTOGRAPHY.hero.focal }}
          />

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
                className="inline-flex h-12 items-center justify-center rounded-full border border-[var(--brand-line)] bg-[var(--brand-raised)] px-6 text-[0.9375rem] font-medium text-cream transition-colors hover:bg-[var(--brand-surface)]"
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
          {creditLine(PHOTOGRAPHY.hero)}
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

          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {PAGE_BODY.map((step, index) => (
              <article
                key={step.title}
                className="flex flex-col overflow-hidden rounded-2xl border border-[var(--brand-line)] bg-card"
              >
                <div className="flex items-center justify-between gap-3 border-b border-[var(--brand-line)] px-5 py-3">
                  <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cream/65">
                    <step.icon className="size-4 text-[var(--savo-mint)]" aria-hidden />
                    {step.screen}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-cream/30">
                    {String(index + 1).padStart(2, "0")} · {step.time}
                  </span>
                </div>

                <div className="bg-[var(--brand-surface)] px-5 py-5">
                  <img
                    src={SCREEN_SHOTS[index] ?? SCREEN_SHOTS[0]}
                    alt={`SAVO ${step.screen} screen`}
                    width={412}
                    height={728}
                    loading="lazy"
                    decoding="async"
                    className="mx-auto block w-full max-w-[16rem] rounded-lg border border-[var(--brand-line)]"
                  />
                </div>

                <div className="flex flex-1 flex-col px-5 pt-5 pb-5">
                  <h3 className="font-display text-xl font-semibold leading-tight text-cream sm:text-2xl">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                  <ul className="mt-4 space-y-2">
                    {step.points.map((point) => (
                      <li key={point} className="flex items-start gap-2.5 text-sm text-cream/85">
                        <Check className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden />
                        {point}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-auto border-t border-[var(--brand-line)] pt-3 text-[11px] leading-relaxed text-cream/40">
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
                <h3 className="mt-4 text-base font-semibold text-cream">{card.title}</h3>
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
          <div className="rounded-3xl border border-[var(--brand-line)] bg-card p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--savo-mint)]">
              SAVO
            </p>
            <p className="mt-3 font-display text-4xl font-semibold text-cream">Free</p>
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

      {/* ------------------------------------------------- real product screens */}
      <section className="border-t border-[var(--brand-line)] bg-[var(--brand-surface)] py-16 sm:py-24">
        <div className="mx-auto w-full max-w-6xl px-5">
          <SectionHeading
            eyebrow="The real app"
            title="The same screens you get on day one."
            description="Captured from the running application on a phone: the till, the stock ledger, reports, customer balances, expenses and transactions. Not illustrations, and no invented figures."
          />

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {GALLERY.map((shot, index) => (
              <figure
                key={shot.src}
                /*
                  Phones get three screens, not six. Six full-height captures
                  put another four thousand pixels between a reader and the
                  footer, and the first three already make the point.
                */
                className={`overflow-hidden rounded-2xl border border-[var(--brand-line)] bg-card ${
                  index > 2 ? "hidden sm:block" : ""
                }`}
              >
                <div className="flex items-baseline justify-between gap-3 border-b border-[var(--brand-line)] px-4 py-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cream/65">
                    {shot.label}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-cream/30">
                    {shot.note}
                  </span>
                </div>
                <img
                  src={shot.src}
                  alt={`SAVO ${shot.label} screen`}
                  width={412}
                  height={728}
                  loading="lazy"
                  decoding="async"
                  className="block w-full"
                />
              </figure>
            ))}
          </div>
          <p className="mt-6 text-[11px] text-muted-foreground">
            Screenshots taken from the deployed application. Photograph in the hero:
            {` ${creditLine(PHOTOGRAPHY.hero)}`}
          </p>
        </div>
      </section>
    </SiteShell>
  );
}
