import type { ReactNode } from "react";
import { Lock } from "lucide-react";

import { NoticeState, PageContainer, PageHeader } from "@/components/app/AppChrome";
import { useActiveShop } from "@/hooks/useActiveShop";

/**
 * Keeps an owner-only screen out of an employee's way.
 *
 * This is a courtesy, not the security boundary: the database refuses these
 * operations for an employee regardless of what the browser does. The message
 * says so in the user's terms without describing the mechanism.
 */
export function OwnerOnly({ title, children }: { title: string; children: ReactNode }) {
  const { isOwner, loading, activeShop } = useActiveShop();

  if (!loading && !activeShop) return null;

  if (!loading && !isOwner) {
    return (
      <PageContainer>
        <PageHeader title={title} />
        <div className="mt-6">
          <NoticeState
            icon={<Lock className="size-4" aria-hidden />}
            title="Owners only"
            description="Ask the shop owner if you need this. Pith keeps these settings with the owner so they cannot be changed from the counter."
          />
        </div>
      </PageContainer>
    );
  }

  return <>{children}</>;
}
