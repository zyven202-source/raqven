import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateShop } from "@/hooks/useShops";
import type { Shop } from "@/types/ravqen";

const shopSchema = z.object({
  name: z.string().trim().min(2, "Give the shop a name of at least 2 characters."),
  business_type: z.string().min(1),
  location: z.string().trim().max(120).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?254|0)[17]\d{8}$/, "Use a Kenyan number, e.g. 0712 345 678."),
});

type ShopForm = z.infer<typeof shopSchema>;

const BUSINESS_TYPES = [
  { value: "general", label: "General retail / duka" },
  { value: "grocery", label: "Grocery / greens" },
  { value: "hardware", label: "Hardware" },
  { value: "boutique", label: "Boutique / clothing" },
  { value: "pharmacy", label: "Pharmacy / chemist" },
  { value: "other", label: "Other" },
] as const;

export function CreateShopDialog({ children }: { children: React.ReactNode }) {
  const createShop = useCreateShop();
  const form = useForm<ShopForm>({
    resolver: zodResolver(shopSchema),
    defaultValues: { name: "", business_type: "general", location: "", phone: "" },
  });

  async function onSubmit(values: ShopForm) {
    try {
      await createShop.mutateAsync({
        name: values.name,
        businessType: values.business_type,
        location: values.location || null,
        phone: values.phone || null,
      });
      toast.success("Shop created", {
        description: `${values.name} is ready. You are the owner.`,
      });
      form.reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the shop.");
    }
  }

  const busy = createShop.isPending;

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create your shop</DialogTitle>
          <DialogDescription>
            You become the owner. Staff are added later with their own access codes.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="shop-name">Shop name</Label>
            <Input
              id="shop-name"
              placeholder="e.g. Mama Njeri Stores"
              autoComplete="organization"
              {...form.register("name")}
            />
            {form.formState.errors.name ? (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shop-type">Business type</Label>
            <Select
              value={form.watch("business_type")}
              onValueChange={(value) => form.setValue("business_type", value)}
            >
              <SelectTrigger id="shop-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shop-location">Location (optional)</Label>
            <Input
              id="shop-location"
              placeholder="e.g. Gikomba, Nairobi"
              {...form.register("location")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shop-phone">M-Pesa phone (optional)</Label>
            <Input
              id="shop-phone"
              inputMode="tel"
              placeholder="0712 345 678"
              autoComplete="tel"
              {...form.register("phone")}
            />
            {form.formState.errors.phone ? (
              <p className="text-xs text-destructive">{form.formState.errors.phone.message}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="submit" className="w-full sm:w-auto" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              Create shop
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ShopCard({ shop }: { shop: Shop }) {
  return (
    <div className="surface-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{shop.name}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {[shop.business_type, shop.location].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
          {shop.currency}
        </span>
      </div>
    </div>
  );
}
