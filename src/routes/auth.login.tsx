import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Field, PasswordField } from "@/components/app/fields";
import { Input } from "@/components/ui/input";
import { useSession } from "@/hooks/useSession";
import { useStorageAvailable } from "@/hooks/useStorageAvailable";
import { pageMeta } from "@/lib/seo";
import { STORAGE_BLOCKED_MESSAGE } from "@/lib/storage";
import { signInWithEmail } from "@/services/auth.service";
import { AuthHeading, AuthSwitchLink, SubmitButton } from "./-auth-parts";

export const Route = createFileRoute("/auth/login")({
  head: () =>
    pageMeta({
      title: "Pith — Sign in",
      description: "Sign in to Pith to manage your shop's sales, stock and daily numbers.",
      path: "/auth/login",
    }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = Route.useNavigate();
  const { session, loading } = useSession();
  const storageAvailable = useStorageAvailable();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);

  // A signed-in user has no business on this page.
  useEffect(() => {
    if (!loading && session) {
      void navigate({ to: "/onboarding", replace: true });
    }
  }, [loading, session, navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const next: Record<string, string | undefined> = {};
    if (!email.trim()) next["email"] = "Enter your email address.";
    else if (!/^\S+@\S+\.\S+$/.test(email.trim()))
      next["email"] = "That does not look like an email address.";
    if (!password) next["password"] = "Enter your password.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      const { hasSession } = await signInWithEmail(email.trim(), password);
      if (!hasSession) {
        // Credentials were accepted but the browser dropped the session: say so
        // instead of navigating to a page that bounces straight back.
        throw new Error(STORAGE_BLOCKED_MESSAGE);
      }
      await navigate({ to: "/onboarding", replace: true });
    } catch (error) {
      setBusy(false);
      const message = error instanceof Error ? error.message : "Could not sign in.";
      setErrors({ ["form"]: message });
      toast.error(message, { duration: 8000 });
    }
  }

  return (
    <>
      <AuthHeading title="Sign in" subtitle="Open your shop's till, stock and numbers." />

      <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
        <Field label="Email" error={errors["email"]} htmlFor="login-email">
          <Input
            id="login-email"
            type="email"
            className="h-12"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErrors((current) => ({ ...current, email: undefined, form: undefined }));
            }}
            autoComplete="email"
            inputMode="email"
            enterKeyHint="next"
          />
        </Field>

        <PasswordField
          id="login-password"
          label="Password"
          error={errors["password"]}
          value={password}
          onChange={(value) => {
            setPassword(value);
            setErrors((current) => ({ ...current, password: undefined, form: undefined }));
          }}
          autoComplete="current-password"
        />

        <div className="text-right">
          <Link
            to="/auth/forgot-password"
            className="text-sm font-medium text-ink-soft underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        {errors["form"] ? (
          <p className="rounded-lg border border-negative/30 bg-negative-soft/60 px-3.5 py-2.5 text-sm text-negative">
            {errors["form"]}
          </p>
        ) : null}

        <SubmitButton busy={busy} label="Sign in" busyLabel="Signing in…" />

        {storageAvailable === false ? (
          <p className="text-center text-xs text-caution">
            Signing in will not be remembered in this browser.
          </p>
        ) : null}
      </form>

      <AuthSwitchLink leading="New to Pith?" to="/auth/signup" linkLabel="Create an account" />
    </>
  );
}
