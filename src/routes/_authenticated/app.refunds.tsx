import { createFileRoute, Link } from "@tanstack/react-router";
import { Receipt, RotateCcw } from "lucide-react";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  NoticeState,
  PageContainer,
  PageHeader,
} from "@/components/app/AppChrome";
import { MetricCard, StatusBadge } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { useActiveShop } from "@/hooks/useActiveShop";
import { useTransactions } from "@/hooks/useLedger";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PHOTOGRAPHY } from "@/lib/photography";
import { kindLabel } from "@/services/transactions.service";

export const Route = createFileRoute("/_authenticated/app/refunds")({
  head: () => ({ meta: [{ title: "SAVO — Refunds" }] }),
  component: RefundsPage,
});

/**
 * Refunds, on their own screen.
 *
 * A refund used to be reachable only by finding the sale it belonged to and
 * opening its detail sheet. That answers "what happened to this sale", but not
 * "what have I given back this month" — the question an owner actually asks.
 * This screen reads the same ledger rows (`kind = refund`) and adds nothing to
 * the schema; recording a refund still happens from the sale, where the items
 * and quantities that can be returned are known.
 */
function RefundsPage() {
  const { activeShop } = useActiveShop();
  const shopId = activeShop?.id ?? "";
  const currency = activeShop?.currency ?? "KES";
  const acceptsRefunds = Boolean(activeShop?.accepts_refunds);

  const refundsQuery = useTransactions({ shopId, limit: 80, kinds: ["refund"] });
  const refunds = refundsQuery.data ?? [];

  const total = refunds.reduce((sum, row) => sum + row.amount, 0);
  const latest = refunds[0]?.occurredAt;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Money"
        title="Refunds"
        subtitle="Goods taken back, and what each one cost the shop."
        action={
          <Button asChild variant="outline" className="h-10">
            <Link to="/app/transactions" search={{ shop: undefined }}>
              <Receipt className="size-4" /> Sales
            </Link>
          </Button>
        }
      />

      {refunds.length > 0 ? (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <MetricCard label="Refunds" value={refunds.length} hint="In this list" />
          <MetricCard label="Given back" value={formatMoney(total, currency)} hint="In this list" />
          <MetricCard
            label="Latest"
            value={latest ? formatDateTime(latest).split(",")[0] : "—"}
            hint={latest ? formatDateTime(latest) : "No refunds yet"}
            className="col-span-2 sm:col-span-1"
          />
        </div>
      ) : null}

      {!acceptsRefunds ? (
        <div className="mb-4">
          <NoticeState
            title="Refunds are switched off for this shop"
            description="Nothing here can be refunded until an owner turns refunds on in Settings. Existing refunds stay visible."
          />
        </div>
      ) : null}

      {refundsQuery.isLoading ? (
        <LoadingState label="Loading refunds…" />
      ) : refundsQuery.isError ? (
        <ErrorState
          message={refundsQuery.error.message}
          onRetry={() => void refundsQuery.refetch()}
        />
      ) : refunds.length === 0 ? (
        <div className="card-surface overflow-hidden">
          <img
            src={PHOTOGRAPHY.customers.src}
            alt={PHOTOGRAPHY.customers.alt}
            aria-hidden
            width={PHOTOGRAPHY.customers.width}
            height={PHOTOGRAPHY.customers.height}
            loading="lazy"
            decoding="async"
            className="h-32 w-full object-cover opacity-70"
            style={{ objectPosition: PHOTOGRAPHY.customers.focal }}
          />
          <div className="p-4">
            <EmptyState
              title="No refunds recorded"
              description="When you take goods back at the counter, the refund appears here with the sale it came from."
              action={
                <Button asChild variant="outline">
                  <Link to="/app/transactions" search={{ shop: undefined }}>
                    Open sales history
                  </Link>
                </Button>
              }
            />
          </div>
        </div>
      ) : (
        <ul className="list-divided">
          {refunds.map((row) => (
            <li key={row.id} className="flex items-start gap-3 py-3.5">
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-negative-soft text-negative">
                <RotateCcw className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{row.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {kindLabel(row.kind)}
                  {row.subtitle ? ` · ${row.subtitle}` : ""} · {formatDateTime(row.occurredAt)}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {row.reference ? (
                    <StatusBadge tone="neutral">{row.reference}</StatusBadge>
                  ) : null}
                  {row.status ? <StatusBadge tone="caution">{row.status}</StatusBadge> : null}
                  {row.userName ? (
                    <span className="text-[11px] text-muted-foreground">{row.userName}</span>
                  ) : null}
                </div>
              </div>
              <span className="tnum shrink-0 text-sm font-semibold text-negative">
                {formatMoney(row.amount, currency)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        A refund is recorded from the sale it belongs to, so the items and quantities going back on
        the shelf are known. Open a sale in{" "}
        <Link to="/app/transactions" search={{ shop: undefined }} className="underline">
          sales history
        </Link>{" "}
        to take goods back.
      </p>
    </PageContainer>
  );
}
