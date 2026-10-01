import { Link } from "@tanstack/react-router";

import { Logo } from "@/components/brand/Logo";
import {
  BUSINESS_DETAILS,
  displayValue,
  POLICY_EFFECTIVE_DATE,
  POLICY_VERSION,
  businessDetailsAreComplete,
} from "@/config/legal";

/**
 * The frame every public policy page shares: a back link, a title, the version
 * and effective date the copy is stamped with, the body, and a footer that
 * names the three policies.
 *
 * Two rules this component exists to enforce:
 *
 * 1. **One `<h1>`, and every section is an `<h2>`.** A policy read aloud by a
 *    screen reader is a long linear document; the heading outline is the only
 *    navigation it has. `LegalSection` is the only way to start one.
 * 2. **An unconfigured value is visible as unconfigured.** A `TODO_` value
 *    renders through `ConfigValue`, which says so on the page in words. Nothing
 *    here can quietly print a plausible-looking registration number.
 */
export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background/30">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-3.5">
          <Link to="/" aria-label="RAVQEN home">
            <Logo />
          </Link>
          <Link to="/auth/signup" className="text-sm font-medium text-ink hover:underline">
            Create a shop
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-5 py-12">
        <article>
          <h1 className="text-[1.75rem] leading-tight text-balance-tight">{title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Version {POLICY_VERSION} · In effect since {POLICY_EFFECTIVE_DATE}
          </p>
          <p className="mt-5 text-[0.9375rem] leading-relaxed text-muted-foreground">{intro}</p>

          {businessDetailsAreComplete ? null : (
            <div
              className="mt-6 rounded-lg border border-caution/40 bg-caution-soft/60 px-3.5 py-3 text-sm"
              role="note"
            >
              <p className="font-medium text-caution">This page is not finished.</p>
              <p className="mt-1 leading-relaxed text-muted-foreground">
                Some details below are still marked{" "}
                <span className="font-medium text-caution">&ldquo;not yet set&rdquo;</span>. They
                are placeholders, not real values, and they must be filled in before this page is
                published as RAVQEN&rsquo;s policy. See{" "}
                <LegalAnchor href="/legal/terms#not-legal-advice">what that means</LegalAnchor>.
              </p>
            </div>
          )}

          {children}
        </article>
      </main>

      <LegalFooter />
    </div>
  );
}

/** A top-level section. The only heading level a policy body may use. */
export function LegalSection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10" id={id}>
      <h2 className="text-lg leading-snug">{title}</h2>
      <div className="mt-3 space-y-3 text-[0.9375rem] leading-relaxed text-muted-foreground [&_a]:font-medium [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-4 [&_li]:leading-relaxed [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

/** A subsection, one level below `LegalSection`. */
export function LegalSubhead({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h3 className="text-[0.9375rem] font-semibold text-foreground">{title}</h3>
      <div className="mt-1.5 space-y-2 text-[0.9375rem] leading-relaxed text-muted-foreground [&_a]:font-medium [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-4 [&_li]:leading-relaxed [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </div>
  );
}

/**
 * A business value that may still be a placeholder.
 *
 * A configured value renders as text. An unconfigured one renders as a marked
 * chip, so a reader — and a reviewer — can both see that the number is missing.
 * There is no code path where a placeholder prints as if it were real.
 */
export function ConfigValue({ field }: { field: keyof typeof BUSINESS_DETAILS }) {
  const { text, placeholder } = displayValue(BUSINESS_DETAILS[field]);
  if (!placeholder) return <>{text}</>;
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-caution/50 bg-caution-soft/50 px-1.5 py-0.5 align-baseline text-[0.8125rem] font-medium text-caution">
      <span aria-hidden>⚠</span>
      <span>{text}</span>
    </span>
  );
}

/** An in-page link, so a policy can point at its own section. */
export function LegalAnchor({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="font-medium text-ink underline underline-offset-4">
      {children}
    </a>
  );
}

function LegalFooter() {
  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto w-full max-w-3xl px-5 py-8">
        <nav aria-label="Policies" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link to="/legal/privacy" className="text-ink hover:underline">
            Privacy policy
          </Link>
          <Link to="/legal/terms" className="text-ink hover:underline">
            Terms of service
          </Link>
          <Link to="/legal/refunds" className="text-ink hover:underline">
            Refund policy
          </Link>
        </nav>
        <p className="mt-4 text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} {BUSINESS_DETAILS.tradingName}
        </p>
      </div>
    </footer>
  );
}
