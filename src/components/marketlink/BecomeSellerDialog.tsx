import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/app/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useBecomeSeller } from "@/hooks/useSellerOnboarding";

/**
 * The whole of open-seller onboarding: a public name, and whatever else the
 * seller wants a buyer to see. Nothing about a business licence, a shop
 * dashboard or a staff code — that is the point.
 *
 * Underneath, SAVO opens a personal stall, which is a real shop record so that
 * stock, settlement and reviews behave exactly as they do everywhere else. The
 * copy says so plainly instead of pretending otherwise.
 */
export function BecomeSellerDialog({ children }: { children: ReactNode }) {
  const becomeSeller = useBecomeSeller();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [about, setAbout] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    if (!open) return;
    setName("");
    setPhone("");
    setCity("");
    setAbout("");
    setErrors({});
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const next: Record<string, string | undefined> = {};
    if (name.trim().length < 2) next["name"] = "Give the stall a name buyers will recognise.";
    if (about.trim().length > 600) next["about"] = "Keep it under 600 characters.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    try {
      const stall = await becomeSeller.mutateAsync({
        displayName: name,
        contactPhone: phone,
        city,
        about,
      });
      toast.success(stall.created ? "Your stall is open" : "You already have a stall", {
        description: `${stall.displayName} is live at /shop/${stall.slug}. Add your first product next.`,
      });
      setOpen(false);
      void navigate({ to: "/app", search: { shop: stall.shopId } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not open the stall.";
      setErrors({ form: message });
      toast.error(message, { duration: 8000 });
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto px-5 pb-8 pt-5">
        <SheetHeader className="text-left">
          <SheetTitle className="text-base">Sell on SAVO Market</SheetTitle>
          <SheetDescription className="text-sm">
            No shop to set up. Name your stall, and it is live with a public page the same minute.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={submit} className="mt-5 space-y-5" noValidate>
          <Field
            label="Stall name"
            hint="What buyers see, e.g. “Wanjiku’s Fresh Greens”."
            error={errors["name"]}
            htmlFor="stall-name"
          >
            <Input
              id="stall-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setErrors((current) => ({ ...current, name: undefined }));
              }}
              placeholder="e.g. Wanjiku’s Fresh Greens"
              className="h-12"
              autoComplete="organization"
              autoFocus
              maxLength={80}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" hint="Optional" htmlFor="stall-phone">
              <Input
                id="stall-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                inputMode="tel"
                placeholder="+254 712 345 678"
                className="h-12"
                autoComplete="tel"
                maxLength={40}
              />
            </Field>
            <Field label="Town" hint="Optional" htmlFor="stall-city">
              <Input
                id="stall-city"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder="Nairobi"
                className="h-12"
                autoComplete="address-level2"
                maxLength={80}
              />
            </Field>
          </div>

          <Field
            label="What do you sell?"
            hint="Optional. Two sentences is plenty."
            error={errors["about"]}
            htmlFor="stall-about"
          >
            <textarea
              id="stall-about"
              value={about}
              onChange={(event) => setAbout(event.target.value)}
              rows={3}
              maxLength={600}
              placeholder="Fresh vegetables from my farm, delivered around town."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>

          <p className="rounded-lg bg-[var(--brand-surface)] px-3.5 py-3 text-[11px] leading-relaxed text-muted-foreground">
            SAVO keeps a stall as a small shop record internally — that is what makes stock counts
            and order settlement correct. You will only ever see the stall: products, requests and
            payouts recorded by you.
          </p>

          {errors["form"] ? (
            <p className="rounded-lg border border-negative/30 bg-negative-soft/60 px-3.5 py-2.5 text-sm text-negative">
              {errors["form"]}
            </p>
          ) : null}

          <Button type="submit" className="h-12 w-full text-base" disabled={becomeSeller.isPending}>
            {becomeSeller.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShoppingBag className="size-4" />
            )}
            Open my stall
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
