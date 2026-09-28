import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/hooks/useSession";
import { useStorageAvailable } from "@/hooks/useStorageAvailable";
import { STORAGE_BLOCKED_MESSAGE } from "@/lib/storage";
import { signInWithEmail } from "@/services/auth.service";
import { AuthCard, AuthSwitchLink, SubmitButton } from "./-auth-parts";

export const Route = createFileRoute("/auth/login")({
  head: () => ({
    meta: [
      { title: "Sign in — RAVQEN" },
      {
        name: "description",
        content: "Sign in to RAVQEN to manage your shop's sales, stock and daily numbers.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = Route.useNavigate();
  const { session, loading } = useSession();

  const storageAvailable = useStorageAvailable();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // A signed-in user has no business on this page.
  useEffect(() => {
    if (!loading && session) {
      void navigate({ to: "/dashboard", replace: true });
    }
  }, [loading, session, navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { hasSession } = await signInWithEmail(email, password);
      if (!hasSession) {
        // Credentials were accepted but the browser dropped the session: say so
        // instead of navigating to a page that will bounce straight back.
        throw new Error(STORAGE_BLOCKED_MESSAGE);
      }
      await navigate({ to: "/dashboard", replace: true });
    } catch (error) {
      setBusy(false);
      toast.error(error instanceof Error ? error.message : "Could not sign in.", {
        duration: 8000,
      });
    }
  }

  return (
    <AuthCard title="Welcome back" subtitle="Sign in to open your shop records.">
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            className="h-11"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            inputMode="email"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="login-password">Password</Label>
          <Input
            id="login-password"
            type="password"
            className="h-11"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        <div className="text-right">
          <Link
            to="/auth/forgot-password"
            className="text-sm font-medium text-ink-soft underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <SubmitButton busy={busy} label="Sign in" />
        {storageAvailable === false ? (
          <p className="text-center text-xs text-destructive">
            Storage is blocked in this browser, so signing in will not stick.
          </p>
        ) : null}
      </form>
      <AuthSwitchLink leading="New to RAVQEN?" to="/auth/signup" linkLabel="Create one" />
    </AuthCard>
  );
}
