import { Link } from "@tanstack/react-router";
import { ArrowRight, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Logo } from "@/components/brand/Logo";
import { BUSINESS_DETAILS, CONTACT_PHONE } from "@/config/legal";
import { cn } from "@/lib/utils";

/**
 * The public site's frame: one glass navigation bar, one footer, on every
 * marketing page.
 *
 * **Why a shell rather than a layout route.** The landing page, features, about,
 * support and pricing all need the same bar and the same footer. A component
 * keeps the markup visible in the page that uses it (so a page can still choose
 * its own hero), while a route layout would have forced a shared `<Outlet />`
 * and a second place to look when a link is wrong.
 *
 * **The bar.** It carries its own emerald ground rather than starting
 * transparent. It used to be transparent and fade in on scroll — which assumed
 * the hero field was always directly beneath it. It is not: the bar is a sibling
 * above `<main>`, so at the top of every page the cream page background showed
 * through and cream-coloured links sat on cream. The bar now always has the
 * night ground (continuous with the hero below it), and scrolling only adds a
 * hairline and a deeper tone. Links are real `<Link>`s — crawlable,
 * middle-clickable, and they close the mobile panel when used.
 *
 * **The menu.** A disclosure, not a modal: it opens beneath the bar, closes on
 * Escape or on navigation, and `aria-expanded`/`aria-controls` say what it is.
 * No focus trap, because nothing is trapped — the page stays available.
 */

const NAV_LINKS = [
  { to: "/features", label: "Features" },
  { to: "/pricing", label: "Pricing" },
  { to: "/about", label: "About" },
  { to: "/support", label: "Support" },
] as const;

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteNav />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={cn(
        "on-field sticky top-0 z-50 bg-[var(--savo-night)] transition-colors duration-300",
        scrolled
          ? "border-b border-white/10 bg-[color-mix(in_oklab,var(--savo-night)_88%,black)] shadow-[0_10px_30px_-18px_rgba(0,0,0,0.8)]"
          : "border-b border-white/5",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5">
        <Link to="/" aria-label="SAVO home" className="shrink-0">
          <Logo tone="light" />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="rounded-full px-3.5 py-2 text-sm font-medium text-cream/80 transition-colors hover:bg-white/8 hover:text-cream"
              activeProps={{ className: "bg-white/10 text-cream" }}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            to="/auth/login"
            className="rounded-full px-3.5 py-2 text-sm font-medium text-cream/85 transition-colors hover:bg-white/8 hover:text-cream"
          >
            Sign in
          </Link>
          <Link
            to="/auth/signup"
            className="group inline-flex items-center gap-1.5 rounded-full bg-cream px-4 py-2 text-sm font-semibold text-[var(--savo-night)] transition-transform duration-200 hover:-translate-y-px"
          >
            Open your shop
            <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="site-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className="grid size-10 place-items-center rounded-full text-cream transition-colors hover:bg-white/10 md:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open ? (
        <div id="site-menu" className="savo-glass-b mx-3 mb-3 rounded-2xl p-2 md:hidden">
          <nav aria-label="Mobile" className="flex flex-col">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-2.5 text-sm font-medium text-cream/85 hover:bg-white/8"
                activeProps={{ className: "bg-white/10 text-cream" }}
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-1 grid grid-cols-2 gap-2 border-t border-white/10 p-1 pt-3">
              <Link
                to="/auth/login"
                onClick={() => setOpen(false)}
                className="grid h-10 place-items-center rounded-xl border border-white/15 text-sm font-medium text-cream"
              >
                Sign in
              </Link>
              <Link
                to="/auth/signup"
                onClick={() => setOpen(false)}
                className="grid h-10 place-items-center rounded-xl bg-cream text-sm font-semibold text-[var(--savo-night)]"
              >
                Open your shop
              </Link>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

/**
 * The page's opening band.
 *
 * Every public page starts on the same emerald field with the same composition
 * rules — an eyebrow, one `<h1>`, a short paragraph, then whatever the page
 * needs. Repeating it is the point: it is what makes five pages feel like one
 * site rather than five templates.
 */
export function PageHero({
  eyebrow,
  title,
  children,
  aside,
}: {
  eyebrow: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="savo-field on-field relative overflow-hidden">
      <div
        aria-hidden
        className="savo-halo -left-24 top-10 size-72 bg-[var(--savo-emerald-lit)]/40"
      />
      <div aria-hidden className="savo-halo right-0 top-32 size-56 bg-[var(--savo-mint)]/20" />
      <div
        className={cn(
          "relative mx-auto w-full max-w-6xl px-5 pb-16 pt-12 sm:pb-20 sm:pt-16",
          aside ? "grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]" : "",
        )}
      >
        <div className={aside ? "" : "max-w-2xl"}>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--savo-mint)]">
            {eyebrow}
          </p>
          <h1 className="mt-4 text-balance-tight font-display text-[2.15rem] font-semibold leading-[1.06] tracking-[-0.02em] sm:text-6xl">
            {title}
          </h1>
          {children ? (
            <div className="mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-cream/75">
              {children}
            </div>
          ) : null}
        </div>
        {aside ? <div className="min-w-0">{aside}</div> : null}
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="savo-field on-field mt-auto">
      <div className="mx-auto w-full max-w-6xl px-5 py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo tone="light" showTagline />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-cream/65">
              Sales, stock, expenses and customer debts in one calm workspace, built for shops in
              Kenya.
            </p>
          </div>

          <FooterColumn
            title="Product"
            links={[
              { to: "/features", label: "Features" },
              { to: "/pricing", label: "Pricing" },
              { to: "/auth/signup", label: "Open your shop" },
              { to: "/auth/login", label: "Sign in" },
            ]}
          />
          <FooterColumn
            title="Company"
            links={[
              { to: "/about", label: "About" },
              { to: "/support", label: "Support" },
            ]}
          />
          <FooterColumn
            title="Legal"
            links={[
              { to: "/legal/privacy", label: "Privacy" },
              { to: "/legal/terms", label: "Terms" },
              { to: "/legal/refunds", label: "Refunds" },
            ]}
          />
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 text-sm text-cream/60 sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {new Date().getFullYear()} {BUSINESS_DETAILS.tradingName} &middot; Nairobi, Kenya
          </p>
          <nav aria-label="Contact" className="flex flex-wrap gap-x-6 gap-y-2">
            <a href={`mailto:${BUSINESS_DETAILS.contactEmail}`} className="hover:text-cream">
              {BUSINESS_DETAILS.contactEmail}
            </a>
            <a href={`tel:${CONTACT_PHONE}`} className="hover:text-cream">
              {CONTACT_PHONE.replace(/^(\d{4})(\d{3})(\d{3})$/, "$1 $2 $3")}
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: readonly { to: string; label: string }[];
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cream/45">{title}</p>
      <ul className="mt-3 space-y-2 text-sm">
        {links.map((link) => (
          <li key={link.to + link.label}>
            <Link to={link.to} className="text-cream/75 transition-colors hover:text-cream">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
