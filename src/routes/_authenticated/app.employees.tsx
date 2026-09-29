import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Copy, KeyRound, Loader2, RefreshCw, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
} from "@/components/app/AppChrome";
import { ToggleRow } from "@/components/app/fields";
import { OwnerOnly } from "@/components/app/OwnerOnly";
import { StatusBadge, SectionLabel } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useAccessCodes,
  useCreateAccessCode,
  useDeactivateAccessCode,
  useRegenerateAccessCode,
  useSetEmployeeJoining,
  useShopMembers,
  useShopSettings,
  useUpdateMember,
} from "@/hooks/useShopAdmin";
import { useActiveShop } from "@/hooks/useActiveShop";
import { useSession } from "@/hooks/useSession";
import { formatDateTime } from "@/lib/format";
import { isAccessCodeTakenElsewhere, suggestAccessCode } from "@/services/shops.service";

export const Route = createFileRoute("/_authenticated/app/employees")({
  head: () => ({ meta: [{ title: "Staff access — RAVQEN" }] }),
  component: () => (
    <OwnerOnly title="Staff access">
      <EmployeesPage />
    </OwnerOnly>
  ),
});

/**
 * Staff access.
 *
 * The owner never handles an account id. They run one access code; any staff
 * member who signs up and enters it joins this shop as an employee. Individual
 * staff are then suspended or restored by name.
 */
function EmployeesPage() {
  const { activeShop } = useActiveShop();
  const shopId = activeShop?.id ?? "";
  const { user } = useSession();

  const shopQuery = useShopSettings(shopId);
  const membersQuery = useShopMembers(shopId);
  const codesQuery = useAccessCodes(shopId);
  const setJoining = useSetEmployeeJoining(shopId);
  const updateMember = useUpdateMember(shopId);
  const createCodeMutation = useCreateAccessCode(shopId);
  const regenerateCodeMutation = useRegenerateAccessCode(shopId);
  const deactivateCode = useDeactivateAccessCode(shopId);

  const [newCode, setNewCode] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "regenerate" | null>(null);

  const activeCode = (codesQuery.data ?? []).find((entry) => entry.is_active) ?? null;
  const joiningOpen = shopQuery.data?.employee_joining_enabled ?? true;

  /** The plaintext exists only in this session — the database keeps a digest. */
  function reveal(code: string) {
    setNewCode(code);
    void navigator.clipboard?.writeText(code).then(
      () => toast.success("Copied", { description: code }),
      () => toast.success("Access code", { description: code }),
    );
  }

  /**
   * Suggests a code that no other shop is already using.
   *
   * A code shared by two shops cannot be redeemed — the database refuses rather
   * than risk enrolling a staff member into the wrong shop — so a collision
   * would leave the owner holding a dead code. Six digits from eight digits is
   * a large space, so a retry settles it in practice.
   */
  async function suggestFreeCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = suggestAccessCode();
      if (!(await isAccessCodeTakenElsewhere(code))) return code;
    }
    return suggestAccessCode();
  }

  async function createCode() {
    setBusy("create");
    try {
      const code = await suggestFreeCode();
      await createCodeMutation.mutateAsync(code);
      reveal(code);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the code.");
    } finally {
      setBusy(null);
    }
  }

  async function regenerateCode() {
    setBusy("regenerate");
    try {
      const code = await suggestFreeCode();
      await regenerateCodeMutation.mutateAsync(code);
      reveal(code);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change the code.");
    } finally {
      setBusy(null);
    }
  }

  async function retireCode(codeId: string) {
    try {
      await deactivateCode.mutateAsync(codeId);
      toast.success("Code turned off", {
        description: "Staff who already joined keep their access.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not turn the code off.");
    }
  }

  async function toggleJoining(next: boolean) {
    try {
      await setJoining.mutateAsync(next);
      toast.success(next ? "Staff can now join with the code" : "New staff can no longer join");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change that.");
    }
  }

  async function setStatus(memberId: string, status: "active" | "suspended") {
    try {
      await updateMember.mutateAsync({ memberId, patch: { status } });
      toast.success(status === "suspended" ? "Access paused" : "Access restored");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update that person.");
    }
  }

  async function setRole(memberId: string, role: "owner" | "employee") {
    try {
      await updateMember.mutateAsync({ memberId, patch: { role } });
      toast.success(role === "owner" ? "Made an owner" : "Changed to staff");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change that role.");
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Staff access"
        subtitle="One code brings your staff in. Nobody needs a technical account id."
      />

      {/* ---------------------------------------------------------- access code */}
      <section className="mb-8">
        <SectionLabel>Access code</SectionLabel>

        {newCode ? (
          <div className="rounded-xl border border-positive/40 bg-positive-soft/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-positive">
              New code — show it now
            </p>
            <p className="tnum mt-1.5 text-3xl font-semibold tracking-[0.3em]">{newCode}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Give this to your staff. It works until you change it, and you will not be able to
              read it back later.
            </p>
            <Button
              variant="outline"
              className="mt-3 h-10"
              onClick={() => {
                void navigator.clipboard?.writeText(newCode);
                toast.success("Copied");
              }}
            >
              <Copy className="size-4" /> Copy
            </Button>
            <Button variant="ghost" className="mt-2 ml-2 h-10" onClick={() => setNewCode(null)}>
              Done
            </Button>
          </div>
        ) : (
          <div className="glass-1 rounded-xl backdrop-blur-2xl backdrop-saturate-150 p-4">
            {codesQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Checking the code…</p>
            ) : activeCode ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">A code is active</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {activeCode.last_used_at
                        ? `Last used ${formatDateTime(activeCode.last_used_at)}`
                        : "Not used yet — share it with your staff."}
                    </p>
                  </div>
                  <StatusBadge tone="positive">Active</StatusBadge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" className="h-10" onClick={() => void regenerateCode()}>
                    {busy === "regenerate" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                    Change code
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-10"
                    onClick={() => void retireCode(activeCode.id)}
                  >
                    <X className="size-4" /> Turn off
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">No code yet</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Create a code, then your staff enter it when they sign up.
                </p>
                <Button
                  className="mt-3 h-10"
                  onClick={() => void createCode()}
                  disabled={busy === "create"}
                >
                  {busy === "create" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <KeyRound className="size-4" />
                  )}
                  Create a code
                </Button>
              </>
            )}
          </div>
        )}

        <div className="list-divided mt-3">
          <ToggleRow
            title="Allow staff to join with the code"
            description="Turn this off when you have all the staff you need. Staff who already joined keep their access."
            checked={joiningOpen}
            disabled={setJoining.isPending || shopQuery.isLoading}
            onCheckedChange={(next) => void toggleJoining(next)}
          />
        </div>
      </section>

      {/* ------------------------------------------------------------- the team */}
      <section>
        <SectionLabel>Who works here</SectionLabel>

        {membersQuery.isLoading ? (
          <LoadingState label="Loading your team…" />
        ) : membersQuery.isError ? (
          <ErrorState
            message={membersQuery.error.message}
            onRetry={() => void membersQuery.refetch()}
          />
        ) : (membersQuery.data ?? []).length === 0 ? (
          <EmptyState
            title="No one here yet"
            description="You are the owner. Share the access code above and your staff will appear here when they join."
          />
        ) : (
          <ul className="list-divided">
            {(membersQuery.data ?? []).map((member) => {
              const isMe = member.user_id === user?.id;
              const name = member.display_name || (isMe ? "You" : "Team member");
              const active = member.status === "active";

              return (
                <li key={member.id} className="py-3">
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-sunken text-xs font-semibold uppercase text-muted-foreground"
                      aria-hidden
                    >
                      {name.slice(0, 2)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {name}
                          {isMe ? " (you)" : ""}
                        </p>
                        <StatusBadge tone={member.role === "owner" ? "info" : "neutral"}>
                          {member.role === "owner" ? "Owner" : "Staff"}
                        </StatusBadge>
                        {!active ? <StatusBadge tone="negative">Paused</StatusBadge> : null}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Joined {formatDateTime(member.created_at)}
                      </p>

                      {!isMe ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            className="h-9 text-xs"
                            disabled={updateMember.isPending}
                            onClick={() =>
                              void setStatus(
                                member.id,
                                member.status === "active" ? "suspended" : "active",
                              )
                            }
                          >
                            {member.status === "active" ? (
                              <>
                                <X className="size-3.5" /> Pause
                              </>
                            ) : (
                              <>
                                <Check className="size-3.5" /> Restore
                              </>
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            className="h-9 text-xs"
                            disabled={updateMember.isPending}
                            onClick={() =>
                              void setRole(
                                member.id,
                                member.role === "owner" ? "employee" : "owner",
                              )
                            }
                          >
                            <UserPlus className="size-3.5" />
                            {member.role === "owner" ? "Make staff" : "Make owner"}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          To bring someone in, send them the access code. They sign up in RAVQEN, choose &ldquo;I
          have an access code&rdquo;, and they land straight in this shop.
        </p>
      </section>
    </PageContainer>
  );
}
