import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { KeyRound, Plus, Users } from "lucide-react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
} from "@/components/app/AppChrome";
import { OwnerOnly } from "@/components/app/OwnerOnly";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAccessCodes,
  useAddMember,
  useCreateAccessCode,
  useDeactivateAccessCode,
  useShopMembers,
  useUpdateMember,
} from "@/hooks/useShopAdmin";
import { useActiveShop } from "@/hooks/useActiveShop";
import { useSession } from "@/hooks/useSession";
import { formatDateTime } from "@/lib/format";
import { suggestAccessCode } from "@/services/shops.service";

export const Route = createFileRoute("/_authenticated/app/employees")({
  head: () => ({ meta: [{ title: "Employees — RAVQEN" }] }),
  component: () => (
    <OwnerOnly title="Employees">
      <EmployeesPage />
    </OwnerOnly>
  ),
});

function EmployeesPage() {
  const { activeShop } = useActiveShop();
  const shopId = activeShop?.id ?? "";
  const { user } = useSession();

  const membersQuery = useShopMembers(shopId);
  const codesQuery = useAccessCodes(shopId);
  const updateMember = useUpdateMember(shopId);
  const createCode = useCreateAccessCode(shopId);
  const deactivateCode = useDeactivateAccessCode(shopId);

  const [label, setLabel] = useState("Till one");
  const [code, setCode] = useState(() => suggestAccessCode());
  const [justCreated, setJustCreated] = useState<string | null>(null);

  async function changeRole(memberId: string, role: "owner" | "employee") {
    try {
      await updateMember.mutateAsync({ memberId, patch: { role } });
      toast.success(`Role changed to ${role}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change the role.");
    }
  }

  async function changeStatus(memberId: string, status: "active" | "suspended") {
    try {
      await updateMember.mutateAsync({ memberId, patch: { status } });
      toast.success(status === "suspended" ? "Access suspended" : "Access restored");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update access.");
    }
  }

  async function mintCode(event: React.FormEvent) {
    event.preventDefault();
    if (code.trim().length < 4) {
      toast.error("An access code needs at least 4 characters.");
      return;
    }
    try {
      await createCode.mutateAsync({ label, code: code.trim() });
      setJustCreated(code.trim());
      toast.success("Access code created", {
        description: "Copy it now — only a digest is stored, so it cannot be shown again.",
      });
      setCode(suggestAccessCode());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the code.");
    }
  }

  return (
    <PageContainer>
      <PageHeader title="Employees" subtitle="Who can work in this shop, and as what." />

      <div className="mt-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          <Users className="size-4" /> Team
        </h2>

        {membersQuery.isPending ? (
          <LoadingState label="Loading the team…" />
        ) : membersQuery.isError ? (
          <ErrorState
            message={membersQuery.error.message}
            onRetry={() => void membersQuery.refetch()}
          />
        ) : (
          <ul className="mt-3 space-y-2.5">
            {(membersQuery.data ?? []).map((member) => (
              <li key={member.id} className="surface-panel space-y-3 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {member.display_name || "Team member"}
                      {member.user_id === user?.id ? " (you)" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Joined {formatDateTime(member.created_at)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium capitalize">
                    {member.role}
                  </span>
                </div>

                {member.user_id !== user?.id ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className="h-9"
                      disabled={updateMember.isPending}
                      onClick={() =>
                        void changeRole(member.id, member.role === "owner" ? "employee" : "owner")
                      }
                    >
                      Make {member.role === "owner" ? "employee" : "owner"}
                    </Button>
                    <Button
                      variant="outline"
                      className="h-9"
                      disabled={updateMember.isPending}
                      onClick={() =>
                        void changeStatus(
                          member.id,
                          member.status === "active" ? "suspended" : "active",
                        )
                      }
                    >
                      {member.status === "active" ? "Suspend access" : "Restore access"}
                    </Button>
                  </div>
                ) : null}

                {member.status !== "active" ? (
                  <p className="text-xs text-destructive">Status: {member.status}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-xs text-muted-foreground">
          Adding a person requires their account to exist first — they sign up in RAVQEN, then you
          add them here by their user id.
        </p>
      </div>

      <div className="mt-8">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          <KeyRound className="size-4" /> Access codes
        </h2>
        <p className="mt-2 text-xs text-muted-foreground">
          The plaintext is shown once and never stored — the database keeps a SHA-256 digest only.
        </p>

        {justCreated ? (
          <div className="surface-panel mt-3 border-primary/40 p-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">New code</p>
            <p className="mt-1 font-mono text-2xl font-semibold tracking-widest">{justCreated}</p>
            <Button
              variant="outline"
              className="mt-3 h-10"
              onClick={() => {
                void navigator.clipboard?.writeText(justCreated);
                toast.success("Copied");
              }}
            >
              Copy code
            </Button>
          </div>
        ) : null}

        <form onSubmit={mintCode} className="surface-panel mt-3 space-y-3 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="code-label">Label</Label>
            <Input
              id="code-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              className="h-11"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="code-value">Code</Label>
            <Input
              id="code-value"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              className="h-11 font-mono tracking-widest"
              autoComplete="off"
            />
          </div>
          <Button type="submit" className="h-11 w-full" disabled={createCode.isPending}>
            <Plus /> {createCode.isPending ? "Creating…" : "Create access code"}
          </Button>
        </form>

        {codesQuery.isPending ? (
          <LoadingState label="Loading codes…" />
        ) : (codesQuery.data ?? []).length === 0 ? (
          <EmptyState
            title="No access codes yet"
            description="Create one to give staff a till code."
          />
        ) : (
          <ul className="mt-3 space-y-2">
            {(codesQuery.data ?? []).map((entry) => (
              <li key={entry.id} className="surface-panel flex items-center gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{entry.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.is_active ? "Active" : "Retired"}
                    {entry.expires_at ? ` · expires ${formatDateTime(entry.expires_at)}` : ""}
                    {entry.last_used_at ? ` · last used ${formatDateTime(entry.last_used_at)}` : ""}
                  </p>
                </div>
                {entry.is_active ? (
                  <Button
                    variant="outline"
                    className="h-9 shrink-0"
                    disabled={deactivateCode.isPending}
                    onClick={() => void deactivateCode.mutateAsync(entry.id)}
                  >
                    Retire
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Add a staff member
        </h2>
        <AddMemberForm shopId={shopId} />
      </div>
    </PageContainer>
  );
}

/**
 * Staff are added by user id: their account must exist first. `shop_members`
 * only exposes rows to the owner, so this cannot be used to browse users.
 */
function AddMemberForm({ shopId }: { shopId: string }) {
  const addMember = useAddMember(shopId);
  const [userId, setUserId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"owner" | "employee">("employee");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const id = userId.trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      toast.error("Paste the staff member's user id (a UUID).");
      return;
    }
    try {
      await addMember.mutateAsync({ userId: id, role, displayName: displayName.trim() || null });
      toast.success("Staff member added");
      setUserId("");
      setDisplayName("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the member.");
    }
  }

  return (
    <form onSubmit={submit} className="surface-panel mt-3 space-y-3 p-4">
      <div className="space-y-1.5">
        <Label htmlFor="member-id">User id</Label>
        <Input
          id="member-id"
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
          placeholder="00000000-0000-0000-0000-000000000000"
          className="h-11 font-mono text-xs"
          autoComplete="off"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="member-name">Display name</Label>
        <Input
          id="member-name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="e.g. Peter"
          className="h-11"
          autoComplete="off"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="member-role">Role</Label>
        <Select value={role} onValueChange={(value) => setRole(value as "owner" | "employee")}>
          <SelectTrigger id="member-role" className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="employee">Employee</SelectItem>
            <SelectItem value="owner">Owner</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="h-11 w-full" disabled={addMember.isPending}>
        {addMember.isPending ? "Adding…" : "Add member"}
      </Button>
    </form>
  );
}
