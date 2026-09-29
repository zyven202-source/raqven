import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/app/fields";
import { Input } from "@/components/ui/input";
import { requestPasswordReset } from "@/services/auth.service";
import { AuthHeading, AuthSwitchLink, SubmitButton } from "./-auth-parts";

export const Route = createFileRoute("/auth/forgot-password")({
  head: () => ({
    meta: [{ title: "Reset password — RAVQEN" }],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not send the reset email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AuthHeading
        title="Reset your password"
        subtitle="We will email you a link to choose a new one."
      />

      {sent ? (
        <div className="mt-7">
          <p className="rounded-lg border border-border bg-sunken px-4 py-3 text-sm leading-relaxed">
            If an account exists for <span className="font-medium">{email}</span>, a reset link is
            on its way. It expires shortly, so use it soon.
          </p>
          <AuthSwitchLink leading="Back to" to="/auth/login" linkLabel="Sign in" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
          <Field label="Email" error={error} htmlFor="forgot-email">
            <Input
              id="forgot-email"
              type="email"
              className="h-12"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(undefined);
              }}
              autoComplete="email"
              inputMode="email"
            />
          </Field>
          <SubmitButton busy={busy} label="Send reset link" busyLabel="Sending…" />
          <AuthSwitchLink leading="Remembered it?" to="/auth/login" linkLabel="Sign in" />
        </form>
      )}
    </>
  );
}
