import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Phone, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  NoticeState,
  PageContainer,
  PageHeader,
} from "@/components/app/AppChrome";
import { Field, MoneyField } from "@/components/app/fields";
import { Money, StatusBadge, WhatsAppIcon } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useActiveShop } from "@/hooks/useActiveShop";
import { useDebtorDetail, useDebtors, useRecordDebtorPayment } from "@/hooks/useDebtors";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PAYMENT_METHODS } from "@/services/shops.service";
import { methodLabel } from "@/services/transactions.service";
import type { Debtor, PaymentMethod } from "@/types/savo";

export const Route = createFileRoute("/_authenticated/app/debtors")({
  head: () => ({ meta: [{ title: "Pith — Debtors" }] }),
  component: DebtorsPage,
});

/**
 * Debtors are not customers. A person is on this screen because they took
 * goods on credit, and they leave it when the balance reaches zero. There is no
 * "add customer" anywhere in Pith.
 */
function DebtorsPage() {
  const { activeShop } = useActiveShop();
  const shopId = activeShop?.id ?? "";
  const currency = activeShop?.currency ?? "KES";

  const [includeSettled, setIncludeSettled] = useState(false);
  const [selected, setSelected] = useState<Debtor | null>(null);

  const debtorsQuery = useDebtors(shopId, includeSettled);
  const debtors = debtorsQuery.data ?? [];
  const owing = debtors.filter((debtor) => Number(debtor.total_owed) > 0);
  const total = owing.reduce((sum, debtor) => sum + Number(debtor.total_owed), 0);

  return (
    <PageContainer>
      <PageHeader
        title="Debtors"
        subtitle="Only people who took goods on credit."
        action={
          <Button
            variant="outline"
            className="h-10"
            aria-pressed={includeSettled}
            onClick={() => setIncludeSettled((value) => !value)}
          >
            {includeSettled ? "Hide settled" : "Show settled"}
          </Button>
        }
      />

      {/*
        A debtor record is personal data about a real person, and this screen is
        the shop&rsquo;s own notice of what it is holding and why. The shop — not
        Pith — is the party that decided to collect it, so this is the shop
        explaining itself to its own customer, not a consent box Pith could
        collect on someone else's behalf.
      */}
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
        A name and phone number on this screen is {activeShop?.name ?? "your shop"}&rsquo;s record
        of who owes money. Everyone in the shop can see it, nothing is sent to Pith&rsquo;s servers
        beyond this shop&rsquo;s own database, and it stays until you delete the record.
      </p>

      {owing.length > 0 ? (
        <div className="glass-1 mb-4 rounded-xl p-4 backdrop-blur-2xl backdrop-saturate-150">
          <p className="text-sm text-muted-foreground">Still owed to you</p>
          <p className="tnum mt-0.5 text-[1.75rem] font-semibold leading-none">
            {formatMoney(total, currency)}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            from {owing.length} {owing.length === 1 ? "person" : "people"}
          </p>
        </div>
      ) : null}

      {debtorsQuery.isLoading ? (
        <LoadingState label="Loading debtors…" />
      ) : debtorsQuery.isError ? (
        <ErrorState
          message={debtorsQuery.error.message}
          onRetry={() => void debtorsQuery.refetch()}
        />
      ) : debtors.length === 0 ? (
        <EmptyState
          title="No outstanding debt"
          description="A debtor appears here the first time you record a credit sale at the till."
        />
      ) : (
        <ul className="list-divided">
          {debtors.map((debtor) => {
            const owed = Number(debtor.total_owed);
            return (
              <li key={debtor.id}>
                <button
                  type="button"
                  onClick={() => setSelected(debtor)}
                  className="flex w-full items-center gap-3 py-3 text-left active:opacity-70"
                >
                  <span
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-sunken text-xs font-semibold uppercase text-muted-foreground"
                    aria-hidden
                  >
                    {debtor.name.slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{debtor.name}</span>
                    {debtor.phone ? (
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="size-3" aria-hidden /> {debtor.phone}
                      </span>
                    ) : (
                      <span className="mt-0.5 block text-xs text-muted-foreground">No phone</span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <Money amount={owed} currency={currency} className="text-sm font-semibold" />
                    <span className="mt-0.5 block">
                      <StatusBadge tone={owed > 0 ? "caution" : "positive"}>
                        {owed > 0 ? "Owed" : "Settled"}
                      </StatusBadge>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <DebtorSheet
        debtor={selected}
        shopId={shopId}
        shopName={activeShop?.name ?? "this shop"}
        currency={currency}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </PageContainer>
  );
}

/* --------------------------------------------------------------------------- */
/* Reminder templates — editable, regenerated from the live balance on open.    */
/* --------------------------------------------------------------------------- */

type ReminderTemplate = "friendly" | "due" | "overdue" | "custom";

const TEMPLATES: { value: ReminderTemplate; label: string }[] = [
  { value: "friendly", label: "Friendly Reminder" },
  { value: "due", label: "Payment Due" },
  { value: "overdue", label: "Overdue Reminder" },
  { value: "custom", label: "Custom Message" },
];

function reminderBody(
  template: ReminderTemplate,
  parts: { debtorName: string; shopName: string; balance: string },
): string {
  const { debtorName, shopName, balance } = parts;
  switch (template) {
    case "due":
      return (
        `Hello ${debtorName},\n\n` +
        `A quick note from ${shopName}: your outstanding balance is currently ${balance}.\n\n` +
        `Kindly settle it at your earliest convenience.\n\n` +
        `Thank you.`
      );
    case "overdue":
      return (
        `Hello ${debtorName},\n\n` +
        `Your account with ${shopName} has an outstanding balance of ${balance}.\n\n` +
        `We kindly ask that you clear this amount as soon as possible. If you have already ` +
        `paid, please disregard this message.\n\n` +
        `Thank you.`
      );
    // "custom" opens as the friendly text so the owner edits from a real
    // message rather than an empty box.
    default:
      return (
        `Hello ${debtorName},\n\n` +
        `This is a friendly payment reminder from ${shopName}.\n\n` +
        `Your current outstanding balance is ${balance}.\n\n` +
        `Kindly clear your balance when convenient.\n\n` +
        `Thank you for your business.`
      );
  }
}

/** 0712 345 678 / +254… / 254… → the form wa.me accepts. */
function whatsappPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith("7")) return `254${digits}`;
  return digits;
}

function DebtorSheet({
  debtor,
  shopId,
  shopName,
  currency,
  onOpenChange,
}: {
  debtor: Debtor | null;
  shopId: string;
  shopName: string;
  currency: string;
  onOpenChange: (open: boolean) => void;
}) {
  const detail = useDebtorDetail(debtor?.id ?? null);
  const recordPayment = useRecordDebtorPayment(shopId);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");

  const [reminderOpen, setReminderOpen] = useState(false);

  const owed = Number(detail.data?.debtor.total_owed ?? debtor?.total_owed ?? 0);
  const entered = Number(amount.replace(/[^0-9.]/g, ""));
  const overpay = owed > 0 && Number.isFinite(entered) && entered > owed;
  const canSubmit = entered > 0 && !overpay && !recordPayment.isPending;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!debtor) return;

    const value = Number(amount.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter an amount above zero.");
      return;
    }

    try {
      const result = await recordPayment.mutateAsync({
        debtorId: debtor.id,
        amount: value,
        method,
        reference: reference || null,
      });
      toast.success(`Payment recorded · ${formatMoney(value, currency)}`, {
        description:
          result.balanceRemaining > 0
            ? `${formatMoney(result.balanceRemaining, currency)} still owed.`
            : "This debt is settled.",
      });
      setAmount("");
      setReference("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The payment was refused.", {
        duration: 8000,
      });
    }
  }

  return (
    <>
      <Sheet
        open={debtor !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAmount("");
            setReference("");
          }
          onOpenChange(open);
        }}
      >
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto px-5 pb-8 pt-5">
          <SheetHeader className="text-left">
            <SheetTitle className="text-base">{debtor?.name ?? "Debtor"}</SheetTitle>
          </SheetHeader>

          {detail.isLoading ? (
            <LoadingState label="Loading the account…" />
          ) : detail.isError ? (
            <ErrorState message={detail.error.message} onRetry={() => void detail.refetch()} />
          ) : detail.data ? (
            <div className="mt-4 space-y-5">
              <div className="glass-1 rounded-xl backdrop-blur-2xl backdrop-saturate-150 p-4">
                <p className="text-sm text-muted-foreground">Still owed</p>
                <p
                  className={
                    "tnum mt-0.5 text-2xl font-semibold " +
                    (owed > 0 ? "text-caution" : "text-positive")
                  }
                >
                  {formatMoney(owed, currency)}
                </p>
                {detail.data.debtor.phone ? (
                  <p className="mt-1 text-xs text-muted-foreground">{detail.data.debtor.phone}</p>
                ) : null}
              </div>

              {/* ---------------------------------------------------- remind */}
              {owed > 0 ? (
                <div>
                  <Button className="h-12 w-full text-base" onClick={() => setReminderOpen(true)}>
                    <WhatsAppIcon /> Remind on WhatsApp
                  </Button>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    Opens WhatsApp with a message written from this account&rsquo;s current balance.
                    You read it, edit it, and press send — nothing goes out on its own.
                  </p>
                </div>
              ) : null}

              {/* ------------------------------------------------- repayment */}
              {owed > 0 ? (
                <form onSubmit={submit} className="space-y-4 border-t border-border pt-4">
                  <p className="text-sm font-medium">Record a repayment</p>

                  <MoneyField
                    id="debt-amount"
                    label="Amount received"
                    value={amount}
                    onChange={setAmount}
                    currency={currency}
                    error={overpay ? "That is more than they owe." : null}
                    placeholder={String(owed)}
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 px-0 text-xs"
                    onClick={() => setAmount(String(owed))}
                  >
                    Settle the full {formatMoney(owed, currency)}
                  </Button>

                  <Field label="How was it paid" htmlFor="debt-method">
                    <Select
                      value={method}
                      onValueChange={(value) => setMethod(value as PaymentMethod)}
                    >
                      <SelectTrigger id="debt-method" className="h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.filter((option) => option.value !== "credit").map(
                          (option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field
                    label="Reference"
                    hint="Optional. An M-Pesa code or a receipt note."
                    htmlFor="debt-reference"
                  >
                    <Input
                      id="debt-reference"
                      value={reference}
                      onChange={(event) => setReference(event.target.value)}
                      placeholder="e.g. QJG8X2K1PL"
                      className="h-11"
                      autoComplete="off"
                    />
                  </Field>

                  <Button type="submit" className="h-12 w-full" disabled={!canSubmit}>
                    {recordPayment.isPending ? "Recording…" : "Record repayment"}
                  </Button>
                </form>
              ) : (
                <p className="border-t border-border pt-4 text-sm text-muted-foreground">
                  Nothing is outstanding on this account.
                </p>
              )}

              {/* -------------------------------------------------- history */}
              <section className="border-t border-border pt-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">History</p>
                  <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
                    <Link to="/app/pos" search={{ shop: undefined }}>
                      <Plus className="size-3.5" /> Add debt
                    </Link>
                  </Button>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Every credit sale and repayment on this account, newest first, with the balance
                  after each one. New debt is added by making a credit sale at the till.
                </p>
                <DebtTimeline detail={detail.data} currentBalance={owed} currency={currency} />
              </section>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <ReminderSheet
        open={reminderOpen}
        onOpenChange={setReminderOpen}
        debtorName={debtor?.name ?? ""}
        phone={detail.data?.debtor.phone ?? debtor?.phone ?? null}
        balance={owed}
        shopName={shopName}
        currency={currency}
      />
    </>
  );
}

/* --------------------------------------------------------------------------- */
/* The unified debt + payment timeline, anchored to the live balance.           */
/* --------------------------------------------------------------------------- */

type TimelineEntry = {
  key: string;
  kind: "debt" | "payment";
  date: string;
  amount: number;
  note: string | null;
  balanceAfter: number;
};

/**
 * Merges credit sales and repayments into one chronological view.
 *
 * The running balance is anchored to the database's current total and walked
 * backwards through the events, so the newest entry always shows exactly what
 * the debtor row says right now — even if a refund or a correction outside
 * these events moved the total. No figure here is written back anywhere: this
 * is a read model over rows that are themselves append-only.
 */
function buildTimeline(
  sales: {
    id: string;
    sold_at: string;
    total_amount: number | string;
    amount_paid: number | string;
    receipt_number: string;
  }[],
  payments: {
    id: string;
    paid_at: string;
    amount: number | string;
    method: string;
    reference: string | null;
  }[],
  currentBalance: number,
  methodLabelFn: (method: string) => string,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...sales
      .filter(
        (sale) =>
          Number(sale.total_amount) - Number(sale.amount_paid) > 0 || Number(sale.total_amount) > 0,
      )
      .map((sale) => ({
        key: `sale-${sale.id}`,
        kind: "debt" as const,
        date: sale.sold_at,
        amount: Math.max(Number(sale.total_amount) - Number(sale.amount_paid), 0),
        note: sale.receipt_number,
        balanceAfter: 0,
      })),
    ...payments.map((payment) => ({
      key: `pay-${payment.id}`,
      kind: "payment" as const,
      date: payment.paid_at,
      amount: Number(payment.amount),
      note: methodLabelFn(payment.method) + (payment.reference ? ` · ${payment.reference}` : ""),
      balanceAfter: 0,
    })),
  ]
    .filter((entry) => entry.amount > 0)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  let running = currentBalance;
  for (const entry of entries) {
    entry.balanceAfter = running;
    running = running - (entry.kind === "debt" ? entry.amount : -entry.amount);
  }
  return entries;
}

function DebtTimeline({
  detail,
  currentBalance,
  currency,
}: {
  detail: {
    sales: Parameters<typeof buildTimeline>[0];
    payments: Parameters<typeof buildTimeline>[1];
  };
  currentBalance: number;
  currency: string;
}) {
  const entries = buildTimeline(detail.sales, detail.payments, currentBalance, methodLabel);

  if (entries.length === 0) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">Nothing recorded on this account yet.</p>
    );
  }

  return (
    <ol className="mt-3 space-y-2">
      {entries.map((entry) => (
        <li key={entry.key} className="rounded-lg border border-border bg-sunken px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {new Date(entry.date).toLocaleDateString("en-KE", {
                day: "2-digit",
                month: "short",
              })}
              {" · "}
              {new Date(entry.date).toLocaleTimeString("en-KE", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <p
              className={
                "tnum text-sm font-semibold " +
                (entry.kind === "debt" ? "text-caution" : "text-positive")
              }
            >
              {entry.kind === "debt" ? "+ " : "− "}
              {formatMoney(entry.amount, currency)}
            </p>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium">
              {entry.kind === "debt" ? "Debt added" : "Payment received"}
              {entry.note ? (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  {entry.note}
                </span>
              ) : null}
            </p>
            <p className="tnum text-xs text-muted-foreground">
              Balance {formatMoney(entry.balanceAfter, currency)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* --------------------------------------------------------------------------- */
/* The WhatsApp reminder sheet. Never sends; only prepares.                     */
/* --------------------------------------------------------------------------- */

function ReminderSheet({
  open,
  onOpenChange,
  debtorName,
  phone,
  balance,
  shopName,
  currency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debtorName: string;
  phone: string | null;
  balance: number;
  shopName: string;
  currency: string;
}) {
  const [template, setTemplate] = useState<ReminderTemplate>("friendly");
  const [message, setMessage] = useState("");

  const balanceText = formatMoney(balance, currency);

  function openWith(nextTemplate: ReminderTemplate) {
    setTemplate(nextTemplate);
    setMessage(
      reminderBody(nextTemplate, {
        debtorName: debtorName || "there",
        shopName,
        balance: balanceText,
      }),
    );
  }

  // Rebuild from the live balance every time the sheet opens: the number in
  // the message must be the debtor's current balance, not one captured earlier.
  function handleOpenChange(next: boolean) {
    if (next) openWith("friendly");
    onOpenChange(next);
  }

  const waPhone = phone ? whatsappPhone(phone) : null;

  function handleOpenWhatsApp() {
    const url = waPhone
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (!popup) {
      toast.error("WhatsApp could not be opened.", {
        description: "Allow popups for this site, or copy the message instead.",
      });
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Message copied", { description: "Paste it into WhatsApp." });
    } catch {
      toast.error("Could not copy. Select the text and copy it manually.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto px-5 pb-8 pt-5">
        <SheetHeader className="text-left">
          <SheetTitle className="text-base">WhatsApp reminder</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="glass-1 rounded-xl p-4 backdrop-blur-2xl backdrop-saturate-150">
            <p className="text-sm text-muted-foreground">{debtorName}&rsquo;s current balance</p>
            <p className="tnum mt-0.5 text-xl font-semibold text-caution">{balanceText}</p>
            {phone ? (
              <p className="mt-1 text-xs text-muted-foreground">{phone}</p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">No phone number on record.</p>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Template</p>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => openWith(option.value)}
                  aria-pressed={template === option.value}
                  className={
                    "press h-9 shrink-0 rounded-full border px-3.5 text-xs font-medium " +
                    (template === option.value
                      ? "border-ink bg-ink text-background"
                      : "border-border text-muted-foreground")
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <Field label="Message" hint="Edit anything before sending." htmlFor="reminder-body">
            <textarea
              id="reminder-body"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={9}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm leading-relaxed"
            />
          </Field>

          <Button className="h-12 w-full text-base" onClick={handleOpenWhatsApp}>
            <WhatsAppIcon /> {waPhone ? "Open in WhatsApp" : "Open WhatsApp"}
          </Button>
          <Button variant="outline" className="h-12 w-full" onClick={() => void handleCopy()}>
            Copy message
          </Button>

          <NoticeState
            title="You press send"
            description="WhatsApp opens with this message written in. Nothing is sent until you review it and send it yourself."
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
