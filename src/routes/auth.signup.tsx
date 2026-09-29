import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Field, PasswordField } from "@/components/app/fields";
import { Input } from "@/components/ui/input";
import { useSession } from "@/hooks/useSession";
import { signUpWithEmail } from "@/services/auth.service";
import { AuthHeading, AuthSwitchLink, SubmitButton } from "./-auth-parts";

export const Route = createFileRoute("/auth/signup")({
  head: () => ({
    meta: [
      { title: "Create your account — RAVQEN" },
      { name: "description", content: "Create a RAVQEN account for your shop." },
    ],
  }),
  component: SignupPage,
});

/**
 * New accounts go straight into setup. There is no fake "check your inbox"
 * interlude: if the project has email confirmation off, the session is live and
 * the user is one tap from their shop; if it is on, the real confirmation email
 * is the only honest thing to say.
 */
function SignupPage() {
  const navigate = Route.useNavigate();
  const { session, loading } = useSession();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) {
      void navigate({ to: "/onboarding", replace: true });
    }
  }, [loading, session, navigate]);

  const passwordChecks = useMemo(
    () => [
      { ok: password.length >= 8, label: "At least 8 characters" },
      { ok: /\d/.test(password), label: "A number" },
    ],
    [password],
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const next: Record<string, string | undefined> = {};
    if (fullName.trim().length < 2) next["fullName"] = "Enter the name you will be known by.";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next["email"] = "Enter a valid email address.";
    if (phone && !/^(\+?254|0)\d{9}$/.test(phone.replace(/\s+/g, ""))) {
      next["phone"] = "Use a Kenyan number, e.g. 0712345678.";
    }
    if (password.length < 8) next["password"] = "Use at least 8 characters.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      const { hasSession } = await signUpWithEmail({
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        phone: phone.trim() || null,
      });
      if (hasSession) {
        await navigate({ to: "/onboarding", replace: true });
        return;
      }
      toast.success("Account created", {
        description: "Confirm your email address, then sign in.",
      });
      await navigate({ to: "/auth/login", replace: true });
    } catch (error) {
      setBusy(false);
      const message = error instanceof Error ? error.message : "Could not create the account.";
      setErrors({ form: message });
      toast.error(message);
    }
  }

  return (
    <>
      <AuthHeading
        title="Create your account"
        subtitle="One account for you and your staff. Takes about a minute."
      />

      <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
        <Field label="Full name" error={errors["fullName"]} htmlFor="signup-name">
          <Input
            id="signup-name"
            className="h-12"
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              setErrors((c) => ({ ...c, fullName: undefined }));
            }}
            autoComplete="name"
            placeholder="e.g. Wanjiru Kamau"
          />
        </Field>

        <Field
          label="Phone"
          hint="Optional. Used for your own receipts."
          error={errors["phone"]}
          htmlFor="signup-phone"
        >
          <Input
            id="signup-phone"
            className="h-12"
            inputMode="tel"
            placeholder="0712 345 678"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setErrors((c) => ({ ...c, phone: undefined }));
            }}
            autoComplete="tel"
          />
        </Field>

        <Field label="Email" error={errors["email"]} htmlFor="signup-email">
          <Input
            id="signup-email"
            type="email"
            className="h-12"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErrors((c) => ({ ...c, email: undefined, form: undefined }));
            }}
            autoComplete="email"
            inputMode="email"
          />
        </Field>

        <PasswordField
          id="signup-password"
          label="Password"
          value={password}
          error={errors["password"]}
          onChange={(value) => {
            setPassword(value);
            setErrors((c) => ({ ...c, password: undefined, form: undefined }));
          }}
          autoComplete="new-password"
        />

        {password ? (
          <ul className="-mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {passwordChecks.map((check) => (
              <li
                key={check.label}
                className={"text-xs " + (check.ok ? "text-positive" : "text-muted-foreground")}
              >
                {check.ok ? "✓ " : "○ "}
                {check.label}
              </li>
            ))}
          </ul>
        ) : null}

        {errors["form"] ? (
          <p className="rounded-lg border border-negative/30 bg-negative-soft/60 px-3.5 py-2.5 text-sm text-negative">
            {errors["form"]}
          </p>
        ) : null}

        <SubmitButton busy={busy} label="Create account" busyLabel="Creating…" />
      </form>

      <AuthSwitchLink leading="Already have an account?" to="/auth/login" linkLabel="Sign in" />
    </>
  );
}
