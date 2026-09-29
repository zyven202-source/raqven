import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { useJoinWithAccessCode } from "@/hooks/useShops";

/**
 * Joins the signed-in user to a shop with the code their employer gave them.
 *
 * The user never chooses a shop or a role: the code is sent to the database,
 * which resolves it and enrols them as staff. A rejected code is reported with
 * the reason the database gave, because "invalid code" and "this shop is not
 * accepting staff" need different actions from the person holding the phone.
 */
export function JoinShopSheet({
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  children?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [joinedShop, setJoinedShop] = useState<string | null>(null);

  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const join = useJoinWithAccessCode();
  const navigate = useNavigate();

  function reset(next: boolean) {
    setOpen(next);
    if (!next) {
      // Give the sheet a moment to close before clearing, so the success state
      // does not flash away mid-animation.
      window.setTimeout(() => {
        setCode("");
        setError(null);
        setJoinedShop(null);
      }, 200);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) {
      setError("An access code is at least 4 characters.");
      return;
    }

    setError(null);
    try {
      const result = await join.mutateAsync(trimmed);
      setJoinedShop(result.shopName);
      toast.success(`You are now working at ${result.shopName}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "That code could not be used. Try again.",
      );
    }
  }

  if (joinedShop) {
    return (
      <Sheet open={open} onOpenChange={reset}>
        {children ? <SheetTrigger asChild>{children}</SheetTrigger> : null}
        <SheetContent side="bottom" className="px-5 pb-8 pt-5">
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="grid size-11 place-items-center rounded-full bg-positive-soft text-positive">
              <Check className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-base font-semibold">You are in</p>
              <p className="mt-1 text-sm text-muted-foreground">
                You now work at <span className="font-medium text-foreground">{joinedShop}</span>.
              </p>
            </div>
            <Button
              className="mt-2 h-12 w-full"
              onClick={() => {
                reset(false);
                void navigate({ to: "/app", search: { shop: undefined } });
              }}
            >
              Open the till
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={reset}>
      {children ? <SheetTrigger asChild>{children}</SheetTrigger> : null}
      <SheetContent side="bottom" className="px-5 pb-8 pt-5">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4" /> Join a shop
          </SheetTitle>
          <SheetDescription className="text-sm">
            Enter the access code your employer gave you. It connects you to their shop — you do not
            need to search for it.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="join-code" className="block text-sm font-medium">
              Access code
            </label>
            <Input
              id="join-code"
              value={code}
              onChange={(event) => {
                setCode(event.target.value.toUpperCase());
                setError(null);
              }}
              inputMode="numeric"
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="e.g. 482913"
              className="tnum h-14 text-center text-xl font-semibold tracking-[0.35em]"
            />
            {error ? <p className="text-sm text-negative">{error}</p> : null}
          </div>

          <Button type="submit" className="h-12 w-full" disabled={join.isPending}>
            {join.isPending ? <Loader2 className="animate-spin" /> : null}
            {join.isPending ? "Checking…" : "Join shop"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
