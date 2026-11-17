import { useState } from "react";
import { Download, FileDown, Loader2, LogOut, ShieldCheck, Trash2 } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { ErrorState, LoadingState, NoticeState } from "@/components/app/AppChrome";
import { ToggleRow } from "@/components/app/fields";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  BUSINESS_DETAILS,
  POLICY_VERSION,
  RETENTION_ROWS,
  UNCONFIGURED_FIELDS,
} from "@/config/legal";
import { useActiveShop } from "@/hooks/useActiveShop";
import {
  useConsentState,
  useDeleteAccount,
  useExportMyData,
  useLodgeDataRequest,
  useMyDataRequests,
  useRecordConsent,
  useWithdrawDataRequest,
} from "@/hooks/usePrivacy";
import { useQueryClient } from "@tanstack/react-query";
import { signOut } from "@/services/auth.service";

/**
 * Settings › Data & privacy.
 *
 * Every control here does real work or says plainly why it is disabled. There
 * is no "contact support" mailto with a dead address, and no button that opens
 * a modal promising a human will call.
 *
 * The section is split into four things a person actually wants:
 *
 *   1. **See it** — download everything SAVO holds about them, right now.
 *   2. **Fix it** — the fields they can correct themselves, and where.
 *   3. **Ask for it** — a request form that files a dated record.
 *   4. **Delete it** — with the boundary explained before the button, not after.
 *
 * Plus two smaller things that belong in the same place: the optional
 * product-updates consent, and a checklist of the business/legal values that
 * still need to be filled in before SAVO launches publicly.
 */
export function DataPrivacySection() {
  const { activeShop } = useActiveShop();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const consent = useConsentState();
  const requests = useMyDataRequests();
  const record = useRecordConsent();
  const lodge = useLodgeDataRequest();
  const withdraw = useWithdrawDataRequest();
  const exportData = useExportMyData();
  const removeAccount = useDeleteAccount();

  const [requestKind, setRequestKind] = useState<
    "access" | "correction" | "deletion" | "privacy_contact"
  >("access");
  const [details, setDetails] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function handleExport() {
    try {
      const payload = await exportData.mutateAsync();
      toast.success("Your data has been downloaded", {
        description: `${payload.shops.length} shop${payload.shops.length === 1 ? "" : "s"}, ${payload.consent.length} consent record${payload.consent.length === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The export could not be built.");
    }
  }

  async function handleToggleUpdates(granted: boolean) {
    try {
      await record.mutateAsync({ type: "product_updates", granted });
      toast.success(granted ? "Product updates switched on" : "Product updates switched off", {
        description: granted
          ? "We will email you about changes to SAVO. Every email has a one-tap unsubscribe."
          : "You will not get product-update emails. Nothing about the app changes.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save that choice.");
    }
  }

  async function handleLodge() {
    try {
      await lodge.mutateAsync({ type: requestKind, details: details || null });
      setDetails("");
      toast.success("Request recorded", {
        description: "It is in your privacy requests below, with today's date.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The request could not be filed.");
    }
  }

  async function handleDelete() {
    try {
      const outcome = await removeAccount.mutateAsync();
      await signOut().catch(() => undefined);
      await navigate({ to: "/", replace: true });
      const memberships = `${outcome.memberships_removed} team membership${outcome.memberships_removed === 1 ? "" : "s"} removed.`;
      toast.success(
        outcome.identity_deleted ? "Your account has been deleted" : "Your account data has been deleted",
        {
          description: outcome.identity_deleted
            ? `${memberships} Your sign-in is gone too, so the old password no longer works. Your consent record is kept without your name.`
            : `${memberships} Your consent record is kept without your name.`,
        },
      );
    } catch (error) {
      setConfirmingDelete(false);
      const message = error instanceof Error ? error.message : "The account could not be deleted.";
      toast.error(message, { duration: 10_000 });
    }
  }

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------------------ export */}
      <Block icon={<Download className="size-4" aria-hidden />} title="Take a copy of your data">
        <p className="text-sm leading-relaxed text-muted-foreground">
          This downloads a file with your account, your profile, the shops you belong to and your
          role in each, every consent decision you have made, and any requests you have filed. It
          happens now, on your device — there is nothing to wait for and no email to wait for.
        </p>
        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Not included:</span> your password
            (hashed, never readable), and the sales, stock, expense and debtor records of your
            shops. Those are the shop&rsquo;s business records, not your personal data — the owner
            exports those as CSV from the Reports screen.
          </li>
        </ul>
        <Button
          className="mt-3 h-11 w-full"
          onClick={() => void handleExport()}
          disabled={exportData.isPending}
        >
          {exportData.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <FileDown className="size-4" aria-hidden />
          )}
          {exportData.isPending ? "Building your file…" : "Download everything we hold about you"}
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Stored on this device only. Nothing is uploaded and nothing is sent anywhere.
        </p>
      </Block>

      {/* ------------------------------------------------------------- shop */}
      <Block icon={<ShieldCheck className="size-4" aria-hidden />} title="Your shop's records">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Sales, refunds, expenses, stock movements and debtor balances are{" "}
          {activeShop?.name ?? "your shop"}
          &rsquo;s accounting records, not personal data about you. They belong to the business,
          they are needed to defend or enforce its position, and Kenyan tax and accounting rules set
          a floor for keeping them that this app does not get to choose. They are not deleted when
          you delete your account, and that is not a loophole — it is the line between your data and
          somebody else&rsquo;s records.
        </p>
        {activeShop ? (
          <Button asChild variant="outline" className="mt-3 h-11 w-full">
            <Link to="/app/reports" search={{ shop: activeShop.id }} params={{}}>
              <FileDown className="size-4" aria-hidden />
              Export {activeShop.name}&rsquo;s records as CSV
            </Link>
          </Button>
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">
          The Reports screen exports sales, debtors, expenses and stock for any period you pick.
        </p>
      </Block>

      {/* ---------------------------------------------------------- correct */}
      <Block icon={<FileDown className="size-4" aria-hidden />} title="Correct something">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Most of what SAVO holds about you, you can fix yourself, and fixing it yourself is faster
          than asking.
        </p>
        <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Your name, email and phone</span> — the
            profile above, and the sign-in screen.
          </li>
          <li>
            <span className="font-medium text-foreground">Your shop&rsquo;s details</span> — the
            section above.
          </li>
          <li>
            <span className="font-medium text-foreground">A debtor&rsquo;s name or number</span> —
            Debtors, editable by anyone in the shop.
          </li>
        </ul>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          For anything else, use the request form below.
        </p>
      </Block>

      {/* ---------------------------------------------------------- consent */}
      <Block icon={<ShieldCheck className="size-4" aria-hidden />} title="What you agreed to">
        {consent.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="glass-2 rounded-xl backdrop-blur-md backdrop-saturate-150 px-4">
              <ToggleRow
                title="Product updates"
                description="News about SAVO itself — new features, changes, the occasional notice. Off unless you turn it on. Every email carries a one-tap unsubscribe, and turning this off never affects the app."
                checked={consent.state.product_updates}
                onCheckedChange={(next) => void handleToggleUpdates(next)}
                disabled={record.isPending}
              />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">
                No analytics switch, because there is no analytics.
              </span>{" "}
              SAVO sets no tracking cookies, runs no analytics SDK and no advertising pixel, so
              there is nothing to consent to. If that ever changes, it will ship switched off and
              you will be asked first.{" "}
              <span className="font-medium text-foreground">Account emails</span> — password resets,
              security notices — are not marketing and carry no unsubscribe link, because
              unsubscribing from a password reset would lock you out of your own shop.
            </p>
            {consent.data && consent.data.length > 0 ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-ink">
                  Your consent history ({consent.data.length})
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {consent.data.slice(0, 10).map((row) => (
                    <li key={row.id}>
                      {new Date(row.created_at).toLocaleDateString("en-KE")} —{" "}
                      {row.consent_type.replace("_", " ")} {row.granted ? "accepted" : "withdrawn"}{" "}
                      (policy {row.policy_version})
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </>
        )}
      </Block>

      {/* ---------------------------------------------------------- request */}
      <Block icon={<FileDown className="size-4" aria-hidden />} title="Ask us about your data">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Anything the buttons above do not cover, you can put in writing here. It files a dated
          record you can quote back, and you do not need to give a reason.
        </p>
        <fieldset className="mt-3">
          <legend className="text-sm font-medium text-foreground">What is this about?</legend>
          <div className="mt-2 space-y-2">
            {(
              [
                ["access", "Get a copy of my data"],
                ["correction", "Correct something"],
                ["deletion", "Delete something"],
                ["privacy_contact", "Ask a privacy question"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm"
              >
                <input
                  type="radio"
                  name="data-request-kind"
                  value={value}
                  checked={requestKind === value}
                  onChange={() => setRequestKind(value)}
                  className="size-4 accent-primary"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label
          htmlFor="data-request-details"
          className="mt-4 block text-sm font-medium text-foreground"
        >
          Anything you want to add{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          id="data-request-details"
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="e.g. The phone number on an old sale is wrong."
          className="mt-1.5"
        />
        <Button
          className="mt-3 h-11 w-full"
          onClick={() => void handleLodge()}
          disabled={lodge.isPending}
        >
          {lodge.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          File this request
        </Button>

        {requests.isLoading ? (
          <LoadingState label="Loading your requests…" timeoutMs={8000} />
        ) : requests.isError ? (
          <ErrorState message={requests.error.message} onRetry={() => void requests.refetch()} />
        ) : requests.data && requests.data.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {requests.data.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-border bg-sunken px-3 py-2.5 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium capitalize">
                      {row.request_type.replace("_", " ")} request
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Filed {new Date(row.created_at).toLocaleDateString("en-KE")} ·{" "}
                      <span className="font-medium">{row.status.replace("_", " ")}</span>
                    </p>
                    {row.details ? (
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {row.details}
                      </p>
                    ) : null}
                  </div>
                  {row.status === "received" || row.status === "in_progress" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() => void withdraw.mutateAsync(row.id)}
                      disabled={withdraw.isPending}
                    >
                      Withdraw
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">No requests filed yet.</p>
        )}
      </Block>

      {/* --------------------------------------------------------- deletion */}
      <Block icon={<Trash2 className="size-4" aria-hidden />} title="Delete my account">
        <NoticeState
          tone="danger"
          title="This does not delete your shop's books"
          description="Your profile, your team memberships and any access codes you minted are removed. The shop's sales, refunds, expenses, stock movements and debtor balances stay, because they are the business's accounting record. If you still own a shop, this button will refuse and tell you which one — delete that shop first, further down this page."
        />
        {!confirmingDelete ? (
          <Button
            variant="outline"
            className="mt-3 h-11 w-full text-negative"
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2 className="size-4" aria-hidden />
            Delete my account
          </Button>
        ) : (
          <div className="mt-3 rounded-lg border border-negative/30 bg-negative-soft/50 p-3.5">
            <p className="text-sm font-medium text-negative">Delete your SAVO account?</p>
            <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
              <li>Your profile, memberships and minted access codes are deleted.</li>
              <li>Your consent record is kept, with your name removed.</li>
              <li>Any shop you own is kept, along with everything in it.</li>
            </ul>
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                className="h-11 flex-1"
                onClick={() => setConfirmingDelete(false)}
              >
                Keep my account
              </Button>
              <Button
                className="h-11 flex-1 bg-negative text-negative-foreground hover:bg-negative/90"
                onClick={() => void handleDelete()}
                disabled={removeAccount.isPending}
              >
                {removeAccount.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                Yes, delete it
              </Button>
            </div>
          </div>
        )}
      </Block>

      {/* -------------------------------------------------------- retention */}
      <Block title="How long things are kept">
        <p className="text-sm leading-relaxed text-muted-foreground">
          These are SAVO&rsquo;s own rules, not a claim about what the law requires. The windows for
          accounting records are set by Kenyan tax and accounting practice, and a qualified Kenyan
          lawyer should confirm them before commercial launch.
        </p>
        {/*
          Deliberately not a `<table>`.

          It was three columns wide, and on the 412 px phone this app is actually
          used on it needed a horizontal scroll to read — so a shopkeeper could
          not see how long their own records are kept without discovering a
          gesture the app never teaches. `verify-contrast.mjs` surfaced it as an
          unmeasurable element, and the real problem underneath that was the
          layout, not the measurement.

          The row/column pairing is unchanged and the association is intact: each
          record name is a `<dt>` and its period and reason are `<dd>`s beneath
          it, which a screen reader announces as clearly as a table row.
        */}
        <dl className="mt-3 space-y-2.5">
          {RETENTION_ROWS.map((row) => (
            <div key={row.data} className="rounded-lg border border-border bg-sunken px-3 py-2.5">
              <dt className="text-sm font-medium text-foreground">{row.data}</dt>
              <dd className="tnum mt-0.5 text-xs font-medium text-ink-soft">
                Kept for {row.period}
              </dd>
              <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">{row.why}</dd>
            </div>
          ))}
        </dl>
      </Block>

      {/* ----------------------------------------------------------- policy */}
      <Block title="The policies themselves">
        <p className="text-sm leading-relaxed text-muted-foreground">
          SAVO&rsquo;s own terms, at version {POLICY_VERSION}.
        </p>
        <nav className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link to="/legal/privacy" className="font-medium text-ink hover:underline">
            Privacy policy
          </Link>
          <Link to="/legal/terms" className="font-medium text-ink hover:underline">
            Terms of service
          </Link>
          <Link to="/legal/refunds" className="font-medium text-ink hover:underline">
            Refund policy
          </Link>
        </nav>
      </Block>

      {/* ------------------------------------------------- configure banner */}
      {UNCONFIGURED_FIELDS.length > 0 ? (
        <Block title="Not ready to launch yet" icon={<LogOut className="size-4" aria-hidden />}>
          <NoticeState
            tone="danger"
            title={`${UNCONFIGURED_FIELDS.length} business detail${UNCONFIGURED_FIELDS.length === 1 ? "" : "s"} still to fill in`}
            description="These are placeholders in the code, marked TODO_. They are not real values, and the public policy pages show them as unconfigured. SAVO should not be offered commercially until they are set."
          />
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {UNCONFIGURED_FIELDS.map((field) => (
              <li key={field.key}>
                <span className="font-medium text-foreground">{field.label}</span> —{" "}
                <code className="text-[0.6875rem]">{BUSINESS_DETAILS[field.key]}</code>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            All of them live in one file: <code>src/config/legal.ts</code>. Fill them in there and
            the three policy pages, the site footer and this list all update at once.
          </p>
        </Block>
      ) : null}

      {/* ------------------------------------------------------------- out */}
      <div className="border-t border-border pt-6">
        <Button
          variant="outline"
          className="h-12 w-full"
          onClick={async () => {
            await signOut();
            queryClient.clear();
            await navigate({ to: "/auth/login", replace: true });
          }}
        >
          <LogOut className="size-4" aria-hidden /> Sign out of SAVO
        </Button>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Signing out clears this device&rsquo;s session. Your data is untouched.
        </p>
      </div>
    </div>
  );
}

/** A titled sub-block inside the section, with an optional leading icon. */
function Block({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon ? <span className="text-ink-soft">{icon}</span> : null}
        {title}
      </h3>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}
