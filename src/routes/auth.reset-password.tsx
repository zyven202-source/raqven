import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Field, PasswordField } from "@/components/app/fields";
import { Button } from "@/components/ui/button";
import { updatePassword, verifyRecoveryToken } from "@/services/auth.service";
import { AuthHeading, AuthSwitchLink, SubmitButton } from "./-auth-parts";

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
  return new URLSearchParams(hash).get("token_hash");
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
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
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
          message:
            error instanceof Error
              ? error.message
              : "This link is invalid or has expired. Ask for a new one.",
        });
      });
    return () => {
      active = false;
    };
  }, [tokenHash]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const next: Record<string, string | undefined> = {};
    if (password.length < 8) next["password"] = "Use at least 8 characters.";
    if (password !== confirm) next["confirm"] = "The two passwords do not match.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      await updatePassword(password);
      setPhase({ kind: "done" });
    } catch (error) {
      setErrors({
        ["form"]: error instanceof Error ? error.message : "Could not update the password.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (phase.kind === "verifying") {
    return (
      <>
        <AuthHeading title="Checking your link" subtitle="One moment…" />
        <div className="flex justify-center py-10">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  if (phase.kind === "invalid") {
    return (
      <>
        <AuthHeading title="That link did not work" subtitle={phase.message} />
        <div className="mt-7 space-y-2">
          <Button asChild className="h-12 w-full">
            <Link to="/auth/forgot-password">Send me a new link</Link>
          </Button>
          <Button asChild variant="ghost" className="h-11 w-full">
            <Link to="/auth/login">Use my current password</Link>
          </Button>
        </div>
      </>
    );
  }

  if (phase.kind === "done") {
    return (
      <>
        <AuthHeading
          title="Password updated"
          subtitle="Your new password is active. Sign in to continue."
        />
        <Button className="mt-7 h-12 w-full" onClick={() => void navigate({ to: "/auth/login" })}>
          Sign in
        </Button>
      </>
    );
  }

  return (
    <>
      <AuthHeading
        title="Set a new password"
        subtitle="Choose something you have not used here before."
      />
      <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
        <PasswordField
          id="reset-password"
          label="New password"
          value={password}
          error={errors["password"]}
          onChange={(value) => {
            setPassword(value);
            setErrors((c) => ({ ...c, password: undefined, form: undefined }));
          }}
          autoComplete="new-password"
        />
        <PasswordField
          id="reset-confirm"
          label="Repeat new password"
          value={confirm}
          error={errors["confirm"]}
          onChange={(value) => {
            setConfirm(value);
            setErrors((c) => ({ ...c, confirm: undefined, form: undefined }));
          }}
          autoComplete="new-password"
        />

        {errors["form"] ? (
          <p className="rounded-lg border border-negative/30 bg-negative-soft/60 px-3.5 py-2.5 text-sm text-negative">
            {errors["form"]}
          </p>
        ) : null}

        <SubmitButton busy={busy} label="Save new password" busyLabel="Saving…" />
      </form>
      <AuthSwitchLink leading="Remembered it?" to="/auth/login" linkLabel="Sign in" />
    </>
  );
}
