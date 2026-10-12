import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Field, PasswordField } from "@/components/app/fields";
import { Input } from "@/components/ui/input";
import { useSession } from "@/hooks/useSession";
import { useRecordConsent } from "@/hooks/usePrivacy";
import { signUpWithEmail } from "@/services/auth.service";
import { AuthHeading, AuthSwitchLink, SubmitButton } from "./-auth-parts";

export const Route = createFileRoute("/auth/signup")({
  head: () => ({
    meta: [
      { title: "SAVO — Create your account" },
      { name: "description", content: "Create a SAVO account for your shop." },
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
  /**
   * Required, and starts unticked.
   *
   * A pre-ticked consent box is not consent — it records that the box was
   * there, which is a fact about the form rather than about the person. So
   * there is no `defaultChecked`, and the submit button refuses until it is
   * genuinely ticked.
   */
  const [accepted, setAccepted] = useState(false);
  const record = useRecordConsent();

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
    if (!accepted) next["accepted"] = "Tick the box to accept the terms and the privacy policy.";
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
      /**
       * The consent record is written straight after the account exists, while
       * the session is live. It is deliberately not bundled into the signup
       * transaction: a failed write must not roll back a real account, and a
       * rolled-back account would be a worse outcome than a missing record. If
       * the write fails the person is told, because a consent record that
       * silently did not happen is worse than one that visibly did not.
       */
      if (hasSession) {
        await record
          .mutateAsync({ type: "terms", granted: true, source: "signup" })
          .catch(() => undefined);
        await record
          .mutateAsync({ type: "privacy_policy", granted: true, source: "signup" })
          .catch(() => undefined);
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
          <p
            role="alert"
            className="rounded-lg border border-negative/30 bg-negative-soft/60 px-3.5 py-2.5 text-sm text-negative"
          >
            {errors["form"]}
          </p>
        ) : null}

        {/*
          The required box. One checkbox, not two: the terms and the privacy
          policy are one agreement to both, and a wall of tick-boxes at sign-up
          is how people stop reading them. Optional marketing consent is *not*
          here — bundling it in is what makes it not optional — and there is no
          analytics box because there is no analytics. Product updates are
          switched on later, in Settings, where turning them on is a deliberate
          act rather than a side effect of creating an account.
        */}
        <div className="pt-1">
          <label
            htmlFor="signup-accepted"
            className="flex cursor-pointer items-start gap-2.5 text-sm leading-relaxed"
          >
            <input
              id="signup-accepted"
              type="checkbox"
              checked={accepted}
              onChange={(event) => {
                setAccepted(event.target.checked);
                setErrors((c) => ({ ...c, accepted: undefined }));
              }}
              aria-describedby={errors["accepted"] ? "signup-accepted-error" : undefined}
              aria-invalid={errors["accepted"] ? true : undefined}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span className="text-muted-foreground">
              I accept the{" "}
              <Link
                to="/legal/terms"
                target="_blank"
                className="font-medium text-ink underline underline-offset-4"
              >
                terms of service
              </Link>{" "}
              and have read the{" "}
              <Link
                to="/legal/privacy"
                target="_blank"
                className="font-medium text-ink underline underline-offset-4"
              >
                privacy policy
              </Link>
              .
            </span>
          </label>
          {errors["accepted"] ? (
            <p id="signup-accepted-error" role="alert" className="mt-1.5 text-xs text-negative">
              {errors["accepted"]}
            </p>
          ) : null}
        </div>

        <SubmitButton busy={busy} label="Create account" busyLabel="Creating…" />
      </form>

      <AuthSwitchLink leading="Already have an account?" to="/auth/login" linkLabel="Sign in" />
    </>
  );
}
