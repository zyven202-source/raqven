import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/hooks/useSession";
import { signUpWithEmail } from "@/services/auth.service";
import { AuthCard, AuthSwitchLink, SubmitButton } from "./-auth-parts";

export const Route = createFileRoute("/auth/signup")({
  head: () => ({
    meta: [
      { title: "Create your account — RAVQEN" },
      {
        name: "description",
        content: "Create a RAVQEN owner account for your shop.",
      },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = Route.useNavigate();
  const { session, loading } = useSession();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Already signed in? Straight to the app.
  useEffect(() => {
    if (!loading && session) {
      void navigate({ to: "/dashboard", replace: true });
    }
  }, [loading, session, navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { hasSession } = await signUpWithEmail({
        email,
        password,
        fullName,
        phone: phone || null,
      });
      if (hasSession) {
        toast.success("Account created", { description: "Welcome to RAVQEN." });
        await navigate({ to: "/dashboard", replace: true });
        return;
      }
      toast.success("Account created", {
        description: "Check your email to confirm the address, then sign in.",
      });
      await navigate({ to: "/auth/login", replace: true });
    } catch (error) {
      setBusy(false);
      toast.error(error instanceof Error ? error.message : "Could not create the account.");
    }
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Set up your account, then create your shop. You start as the owner."
    >
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="signup-name">Full name</Label>
          <Input
            id="signup-name"
            className="h-11"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoComplete="name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="signup-phone">Phone number</Label>
          <Input
            id="signup-phone"
            className="h-11"
            inputMode="tel"
            placeholder="07xx xxx xxx"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="signup-email">Email</Label>
          <Input
            id="signup-email"
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
          <Label htmlFor="signup-password">Password</Label>
          <Input
            id="signup-password"
            type="password"
            className="h-11"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        </div>
        <SubmitButton busy={busy} label="Create account" />
      </form>
      <AuthSwitchLink leading="Already have an account?" to="/auth/login" linkLabel="Sign in" />
    </AuthCard>
  );
}
