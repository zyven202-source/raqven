import { Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

/** The panel every auth form renders inside. */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface-panel mt-8 p-6">
      <h1 className="text-2xl">{title}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
      {children}
    </div>
  );
}

export function SubmitButton({ busy, label }: { busy: boolean; label: string }) {
  return (
    <Button type="submit" className="h-11 w-full text-base" disabled={busy}>
      {busy ? <Loader2 className="animate-spin" /> : null}
      {label}
    </Button>
  );
}

/** Footer link row: switches mode or goes back to the landing page. */
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
    <p className="mt-5 text-center text-sm text-muted-foreground">
      {leading}{" "}
      <Link to={to} className="font-medium text-ink-soft underline-offset-4 hover:underline">
        {linkLabel}
      </Link>
    </p>
  );
}
