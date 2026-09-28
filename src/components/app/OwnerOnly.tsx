import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";

import { LoadingState, PageContainer, PageHeader } from "@/components/app/AppChrome";
import { useActiveShop } from "@/hooks/useActiveShop";

/**
 * Hides an owner-only screen from employees.
 *
 * This is deliberately a UX affordance, not the security boundary. Every
 * owner-only operation is refused by the database (RLS policies and the
 * `is_shop_owner` checks inside the RPCs), so an employee who reaches this data
 * another way still gets nothing, and the message below says exactly that
 * rather than implying the UI is the protection.
 */
export function OwnerOnly({ title, children }: { title: string; children: ReactNode }) {
  const { isOwner, loading } = useActiveShop();

  if (loading) return <LoadingState label="Checking your access…" />;

  if (!isOwner) {
    return (
      <PageContainer>
        <PageHeader title={title} />
        <div className="surface-panel mt-6 flex flex-col items-center gap-2 p-8 text-center">
          <ShieldAlert className="size-6 text-ink-soft" aria-hidden />
          <p className="font-medium">Owners only</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            You are signed in as an employee, so this screen is not available. The database refuses
            these operations for your account as well — it is not only hidden here.
          </p>
        </div>
      </PageContainer>
    );
  }

  return <>{children}</>;
}
