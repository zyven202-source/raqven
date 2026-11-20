import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Mail, ShieldCheck, Store } from "lucide-react";
import { toast } from "sonner";

import { ErrorState, LoadingState, PageContainer, PageHeader } from "@/components/app/AppChrome";
import { Field } from "@/components/app/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActiveShop } from "@/hooks/useActiveShop";
import { useMyProfile, useUpdateMyProfile } from "@/hooks/useProfile";
import { useSession } from "@/hooks/useSession";
import { BUILD_ID } from "@/lib/build";
import { requestPasswordReset } from "@/services/auth.service";

export const Route = createFileRoute("/_authenticated/app/profile")({
  head: () => ({ meta: [{ title: "SAVO — Your profile" }] }),
  component: ProfilePage,
});

/**
 * The signed-in person, not the shop.
 *
 * Name and phone live on `profiles`; the email address belongs to the account
 * and is shown read-only, because changing it has to go through a confirmation
 * link rather than a text field. Nothing on this screen is editable by anyone
 * else: the database serves and accepts these rows for this account only.
 */
function ProfilePage() {
  const { user } = useSession();
  const { shops, role, activeShop } = useActiveShop();
  const profile = useMyProfile(Boolean(user));
  const update = useUpdateMyProfile();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!profile.data) return;
    setFullName(profile.data.full_name ?? "");
    setPhone(profile.data.phone ?? "");
  }, [profile.data]);

  const email = user?.email ?? "";
  const initials = (fullName.trim() || email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (fullName.trim().length < 2) {
      toast.error("Enter the name your shops should see.");
      return;
    }
    if (phone.trim() && (phone.trim().length < 7 || phone.trim().length > 20)) {
      toast.error("Enter a phone number between 7 and 20 digits.");
      return;
    }
    try {
      await update.mutateAsync({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
      });
      toast.success("Profile saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Your profile could not be saved.");
    }
  }

  async function sendReset() {
    if (!email) return;
    setSending(true);
    try {
      await requestPasswordReset(email);
      toast.success("Reset link sent", {
        description: `Check ${email}. The link opens a page where you set a new password.`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The reset email could not be sent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Account"
        title="Your profile"
        subtitle="The details your shops see, and the email that protects this account."
      />

      {profile.isLoading ? (
        <LoadingState label="Loading your profile…" />
      ) : profile.isError ? (
        <ErrorState message={profile.error.message} onRetry={() => void profile.refetch()} />
      ) : (
        <div className="space-y-4">
          <section className="flex items-center gap-3 rounded-xl border border-[var(--brand-line)] bg-[var(--brand-raised)] p-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--brand-primary)] text-base font-semibold text-background">
              {initials || "S"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {fullName.trim() || email || "Your account"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {activeShop
                  ? `${role === "owner" ? "Owner" : "Staff"} at ${activeShop.name}`
                  : "No shop selected"}
              </p>
            </div>
          </section>

          <form
            onSubmit={save}
            className="space-y-3 rounded-xl border border-[var(--brand-line)] bg-[var(--brand-raised)] p-4"
          >
            <h2 className="text-sm font-semibold">Details</h2>

            <Field
              label="Full name"
              hint="Shown to your team and on shop records you sign."
              htmlFor="profile-name"
            >
              <Input
                id="profile-name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="h-12"
                autoComplete="name"
                placeholder="e.g. Wambui Kamau"
                maxLength={120}
              />
            </Field>

            <Field
              label="Phone"
              hint="Optional. Used where a phone is needed on shop documents."
              htmlFor="profile-phone"
            >
              <Input
                id="profile-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="tnum h-12"
                inputMode="tel"
                autoComplete="tel"
                placeholder="e.g. 0712 345 678"
                maxLength={20}
              />
            </Field>

            <Button type="submit" className="h-12 w-full" disabled={update.isPending}>
              {update.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save profile
            </Button>
          </form>

          <section className="space-y-3 rounded-xl border border-[var(--brand-line)] bg-[var(--brand-raised)] p-4">
            <div className="flex items-center gap-2">
              <Mail className="size-4 text-muted-foreground" aria-hidden />
              <h2 className="text-sm font-semibold">Sign-in email</h2>
            </div>
            <p className="tnum break-all rounded-md bg-[var(--brand-surface)] px-3 py-2 text-sm">
              {email || "Unknown"}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Your email is the account key, so it is changed through a confirmation link rather
              than this form.
            </p>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              onClick={() => void sendReset()}
              disabled={sending || !email}
            >
              {sending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ShieldCheck className="size-4" />
              )}
              Send a password reset link
            </Button>
          </section>

          <section className="space-y-2 rounded-xl border border-[var(--brand-line)] bg-[var(--brand-raised)] p-4">
            <div className="flex items-center gap-2">
              <Store className="size-4 text-muted-foreground" aria-hidden />
              <h2 className="text-sm font-semibold">Your shops</h2>
            </div>
            {shops.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                You do not belong to a shop yet. Create one or join with an access code from the
                shops screen.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--brand-line)]">
                {shops.map((shop) => (
                  <li key={shop.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{shop.name}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {shop.role === "owner" ? "You own this shop" : "You work here"}
                      </span>
                    </span>
                    {shop.id === activeShop?.id ? (
                      <span className="shrink-0 rounded-full bg-[var(--brand-primary)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--brand-primary)]">
                        Open
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <Button asChild variant="ghost" className="h-10 w-full justify-start px-0 text-sm">
              <Link to="/dashboard">All my shops</Link>
            </Button>
          </section>

          {role === "owner" ? (
            <section className="rounded-xl border border-[var(--brand-line)] bg-[var(--brand-raised)] p-4">
              <h2 className="text-sm font-semibold">Product photos</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Cut out a plain background and save a new photo to a product without replacing the
                original. Runs on this device with no AI model.
              </p>
              <Button asChild variant="outline" className="mt-3 h-11 w-full">
                <Link to="/app/studio" search={{ shop: undefined }}>
                  Open photo studio
                </Link>
              </Button>
            </section>
          ) : null}

          {/* Which release this phone is running. Support can ask for it, and
              the update check compares it with /version.json. */}
          <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
            App build <span className="tnum">{BUILD_ID}</span>
          </p>
        </div>
      )}
    </PageContainer>
  );
}
