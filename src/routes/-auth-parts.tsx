import { Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { useStorageAvailable } from "@/hooks/useStorageAvailable";

/** Every auth screen sits in the same frame: mark, title, form, one link out. */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  const storageAvailable = useStorageAvailable();

  return (
    <div className="flex min-h-dvh flex-col bg-background/30">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 pb-10 pt-14">
        <Link to="/" className="mx-auto" aria-label="Pith home">
          <Logo markSize="size-12" />
        </Link>

        {storageAvailable === false ? (
          <p className="mt-6 rounded-lg border border-caution/40 bg-caution-soft/60 px-3.5 py-2.5 text-center text-xs leading-relaxed text-caution">
            This browser is blocking website storage, so signing in here will not stick. Open Pith
            in its own tab instead of inside an embedded preview.
          </p>
        ) : null}

        {children}
      </div>
    </div>
  );
}

/** The heading block shared by sign-in and sign-up. */
export function AuthHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mt-8 text-center">
      <h1 className="text-xl leading-tight">{title}</h1>
      <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
        {subtitle}
      </p>
    </div>
  );
}

export function SubmitButton({
  busy,
  label,
  busyLabel = "Working…",
}: {
  busy: boolean;
  label: string;
  busyLabel?: string;
}) {
  return (
    <Button type="submit" className="h-12 w-full text-[0.9375rem]" disabled={busy}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
      {busy ? busyLabel : label}
    </Button>
  );
}

/** Footer link row: switches mode or steps back. */
export function AuthSwitchLink({
  leading,
  to,
  linkLabel,
}: {
  leading: string;
  to: "/auth/login" | "/auth/signup" | "/auth/forgot-password";
  linkLabel: string;
}) {
  return (
    <p className="mt-6 text-center text-sm text-muted-foreground">
      {leading}{" "}
      <Link to={to} className="font-medium text-ink hover:underline">
        {linkLabel}
      </Link>
    </p>
  );
}
