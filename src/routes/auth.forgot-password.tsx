import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "@/services/auth.service";
import { AuthCard, AuthSwitchLink, SubmitButton } from "./-auth-parts";

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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the reset email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Forgot password" subtitle="We'll email you a link to set a new password.">
      {sent ? (
        <div className="mt-6 space-y-4">
          <p className="rounded-lg bg-secondary px-4 py-3 text-sm">
            If an account exists for <span className="font-medium">{email}</span>, a reset link is
            on its way. It expires shortly, so use it soon.
          </p>
          <AuthSwitchLink leading="Back to" to="/auth/login" linkLabel="Sign in" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="forgot-email">Email</Label>
            <Input
              id="forgot-email"
              type="email"
              className="h-11"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              inputMode="email"
            />
          </div>
          <SubmitButton busy={busy} label="Send reset link" />
          <AuthSwitchLink leading="Remembered it?" to="/auth/login" linkLabel="Sign in" />
        </form>
      )}
    </AuthCard>
  );
}
