import { createFileRoute, Link } from "@tanstack/react-router";
import { Banknote, Boxes, HandCoins, ScanLine, ShieldCheck, Users } from "lucide-react";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { BUSINESS_DETAILS, CONTACT_PHONE } from "@/config/legal";
import { HOME_HEADLINE, HOME_META, SITE_URL, webApplicationJsonLd } from "@/lib/seo";

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
      React hydrates are the same element by construction. That matters here:
      hand-written head descriptors have already shipped a `<link>`-versus-
      `<meta>` mismatch that threw a hydration error on every page load.

      The JSON has to arrive as a string `children`, not as a
      `dangerouslySetInnerHTML` attribute. The router renders a src-less head
      script only when `children` is a string, so the attribute form is dropped
      in silence — no tag in the HTML, no error anywhere, and the structured data
      simply does not exist. Putting it through `children` also keeps React from
      escaping it: an escaped `&` or `<` inside a `<script>` is not decoded by
      the HTML parser, so it would corrupt the JSON.
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
 * The public page makes one promise: this is the record book your shop runs on.
 * It shows the work Pith actually does, with no invented statistics and no
 * decorative dashboards — if a number cannot be real, it is not on this page.
 *
 * **One `<h1>`, and it carries the term people search for.** The heading is the
 * keyword, the `<title>` and the JSON-LD `name` all read from
 * `src/lib/seo.ts`, so the page cannot claim one thing to a reader and another
 * to a crawler. Everything below it is a `<h2>` section, and every card or step
 * inside one is an `<h3>`, so the document outline is the page read aloud.
 */
function Landing() {
  return (
    <div className="min-h-dvh bg-background/30">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-3.5">
          <Link to="/" aria-label="Pith home">
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
        {/* ------------------------------------------------------------ hero */}
        <section className="mx-auto w-full max-w-3xl px-5 py-14 sm:py-20">
          <p className="text-sm font-medium text-ink-soft">Built for Kenyan shops</p>
          <h1 className="mt-3 max-w-xl text-balance-tight text-[2.25rem] leading-[1.08] sm:text-5xl">
            {HOME_HEADLINE}
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground">
            Pith replaces the till notebook, the stock book and the &ldquo;who owes what&rdquo;
            list. It works on an Android phone, at the counter, in the sun.
          </p>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
            No advertising, no tracking, no analytics. Your shop&rsquo;s records stay in your shop
            &mdash; see the{" "}
            <Link to="/legal/privacy" className="font-medium text-ink underline underline-offset-4">
              privacy policy
            </Link>
            .
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild className="h-12 px-6 text-base">
              <Link to="/auth/signup">Create your shop</Link>
            </Button>
            <Button asChild variant="outline" className="h-12 px-6 text-base">
              <Link to="/auth/login">I already have an account</Link>
            </Button>
          </div>
        </section>

        {/* ----------------------------------------------------- daily work */}
        <section className="border-t border-border">
          <div className="mx-auto w-full max-w-3xl px-5 py-14">
            <h2 className="text-xl">A day at the counter</h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
              The order these happen in is the order they happen in at the shop.
            </p>
            <ol className="mt-6 list-divided">
              {[
                {
                  icon: ScanLine,
                  title: "Scan and sell",
                  body: "Scan a barcode or tap the product. Cash, M-Pesa, card or credit. Stock comes off the shelf and the receipt prints.",
                },
                {
                  icon: Boxes,
                  title: "Book in a delivery",
                  body: "Receive stock by scanning the boxes. Every unit that arrives is recorded, so the count on screen matches the shelf.",
                },
                {
                  icon: HandCoins,
                  title: "Take a repayment",
                  body: "Credit sales create a debtor, not a customer record. Take part of the payment or settle it in full — the balance updates itself.",
                },
                {
                  icon: Banknote,
                  title: "Log what you spent",
                  body: "Lunch, transport, rent, packaging. Expenses sit beside the takings so the day's result is honest.",
                },
                {
                  icon: Users,
                  title: "Bring in your staff",
                  body: "Give them one access code. They sign up and land in your shop — no accounts to create, nothing technical to explain.",
                },
              ].map((step) => (
                <li key={step.title} className="flex items-start gap-4 py-4">
                  <span
                    className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-sunken text-ink-soft"
                    aria-hidden
                  >
                    <step.icon className="size-4.5" />
                  </span>
                  <div>
                    <h3 className="text-[0.9375rem] font-semibold">{step.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {step.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ------------------------------------------------------- honesty */}
        <section className="border-t border-border bg-sunken">
          <div className="mx-auto w-full max-w-3xl px-5 py-14">
            <h2 className="text-xl">Numbers you can defend</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="glass-1 rounded-xl backdrop-blur-2xl backdrop-saturate-150 p-5">
                <ShieldCheck className="size-5 text-ink-soft" aria-hidden />
                <h3 className="mt-3 text-[0.9375rem] font-semibold">
                  One shop, one set of numbers
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  Every record belongs to one shop and nobody can read another shop's data, even by
                  changing the request. That is enforced where the data lives, not in the app.
                </p>
              </div>
              <div className="glass-1 rounded-xl backdrop-blur-2xl backdrop-saturate-150 p-5">
                <Boxes className="size-5 text-ink-soft" aria-hidden />
                <h3 className="mt-3 text-[0.9375rem] font-semibold">Stock that explains itself</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  Each unit that moves leaves a note saying what it was for — a sale, a delivery, a
                  count, a return. If the number looks wrong, the reason is one tap away.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- cta */}
        <section className="border-t border-border">
          <div className="mx-auto w-full max-w-3xl px-5 py-14 text-center">
            <h2 className="text-2xl leading-tight">Start your shop&rsquo;s book today</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Create your shop, add a few products and make the first sale. Pith keeps the stock,
              the debtors and the expenses from there.
            </p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild className="h-12 px-6 text-base">
                <Link to="/auth/signup">Create your shop</Link>
              </Button>
              <Button asChild variant="outline" className="h-12 px-6 text-base">
                <Link to="/auth/login">Sign in</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-3xl px-5 py-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Logo showTagline />
            <p className="text-sm text-muted-foreground">&copy; {new Date().getFullYear()} Pith</p>
          </div>
          {/*
            The three policies are linked from every public page, not buried on a
            legal sub-page. There is no cookie banner, because there is no
            non-essential tracking to consent to — the Privacy Policy says so
            in those words rather than leaving a reader to work it out.
          */}
          <nav aria-label="Policies" className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
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
          {/*
            The two contact details the operator supplied, on every public page.
            `tel:` carries the bare digits — grouping them for the eye would put
            spaces into the href and break dialling on some Android phones — and
            the number on show is grouped only if it really is the shape that
            grouping assumes, so a changed number degrades to itself rather than
            to a mangled string.
          */}
          <nav aria-label="Contact" className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <a
              href={`mailto:${BUSINESS_DETAILS.contactEmail}`}
              className="text-muted-foreground hover:text-ink hover:underline"
            >
              {BUSINESS_DETAILS.contactEmail}
            </a>
            <a
              href={`tel:${CONTACT_PHONE}`}
              className="text-muted-foreground hover:text-ink hover:underline"
            >
              {CONTACT_PHONE.replace(/^(\d{4})(\d{3})(\d{3})$/, "$1 $2 $3")}
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
