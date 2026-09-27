import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePassword, verifyRecoveryToken } from "@/services/auth.service";
import { AuthCard, SubmitButton } from "./-auth-parts";

export const Route = createFileRoute("/auth/reset-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    token_hash: typeof search["token_hash"] === "string" ? search["token_hash"] : undefined,
    type: search["type"] === "recovery" ? ("recovery" as const) : undefined,
  }),
  head: () => ({
    meta: [{ title: "Set a new password — RAVQEN" }],
  }),
  component: ResetPasswordPage,
});

type Phase =
  | { kind: "verifying" }
  | { kind: "form" }
  | { kind: "done" }
  | { kind: "invalid"; message: string };

/**
 * Recovery links deliver the token either as a query param (configurable in the
 * email template) or in the URL fragment (`#token_hash=…&type=recovery`), which
 * TanStack search does not parse. Accept both.
 */
function readTokenFromHash(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  return params.get("token_hash");
}

function ResetPasswordPage() {
  const { token_hash: queryToken } = Route.useSearch();
  const navigate = useNavigate();

  const [tokenHash] = useState(() => queryToken ?? readTokenFromHash());
  const [phase, setPhase] = useState<Phase>(() =>
    (queryToken ?? readTokenFromHash())
      ? { kind: "verifying" }
      : { kind: "invalid", message: "This reset link is missing its token." },
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!tokenHash) return;
    let active = true;
    verifyRecoveryToken(tokenHash)
      .then(() => {
        if (active) setPhase({ kind: "form" });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setPhase({
          kind: "invalid",
          message: error instanceof Error ? error.message : "This link is invalid or has expired.",
        });
      });
    return () => {
      active = false;
    };
  }, [tokenHash]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("The two passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await updatePassword(password);
      setPhase({ kind: "done" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the password.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoSignIn() {
    // The recovery session authenticates the user; sign in properly so the
    // session starts clean.
    await navigate({ to: "/auth/login" });
  }

  if (phase.kind === "verifying") {
    return (
      <AuthCard title="Checking your link" subtitle="One moment…">
        <div className="mt-8 flex justify-center pb-4">
          <Loader2 className="size-6 animate-spin text-ink-soft" />
        </div>
      </AuthCard>
    );
  }

  if (phase.kind === "invalid") {
    return (
      <AuthCard title="Link problem" subtitle={phase.message}>
        <div className="mt-6">
          <Button asChild variant="outline" className="h-11 w-full">
            <Link to="/auth/forgot-password">Request a new link</Link>
          </Button>
          <div className="mt-4">
            <AuthSwitchLinkOrSignIn onSignIn={handleGoSignIn} />
          </div>
        </div>
      </AuthCard>
    );
  }

  if (phase.kind === "done") {
    return (
      <AuthCard
        title="Password updated"
        subtitle="Your new password is active. Sign in to continue."
      >
        <div className="mt-6">
          <Button className="h-11 w-full" onClick={() => void navigate({ to: "/auth/login" })}>
            Sign in
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Set a new password"
      subtitle="Choose a password you have not used here before."
    >
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="reset-password">New password</Label>
          <Input
            id="reset-password"
            type="password"
            className="h-11"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reset-confirm">Repeat new password</Label>
          <Input
            id="reset-confirm"
            type="password"
            className="h-11"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        <SubmitButton busy={busy} label="Save new password" />
        <p className="text-center text-xs text-muted-foreground">
          Or{" "}
          <Link to="/auth/login" className="underline underline-offset-4">
            use your current password
          </Link>{" "}
          if you remembered it.
        </p>
      </form>
    </AuthCard>
  );
}

function AuthSwitchLinkOrSignIn({ onSignIn }: { onSignIn: () => void }) {
  return (
    <p className="text-center text-sm text-muted-foreground">
      Or{" "}
      <button
        type="button"
        onClick={onSignIn}
        className="font-medium text-ink-soft underline-offset-4 hover:underline"
      >
        sign in with your current password
      </button>
      .
    </p>
  );
}
