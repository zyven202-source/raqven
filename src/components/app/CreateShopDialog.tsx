import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, Copy, Loader2, Store } from "lucide-react";
import { toast } from "sonner";

import { Field, ToggleRow } from "@/components/app/fields";
import { StorageImage } from "@/components/app/StorageImage";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateShop } from "@/hooks/useShops";
import { updateReceiptSettings } from "@/services/receipts.service";
import { BUSINESS_TYPES, suggestAccessCode, updateShop } from "@/services/shops.service";
import { uploadImage } from "@/services/storage.service";
import { STORAGE_BUCKETS, type Shop } from "@/types/savo";

/**
 * Creates a shop and configures it in one pass.
 *
 * Everything here is written to Supabase before the sheet closes: details,
 * logo, the refund policy, receipt layout and a staff access code. Opening the
 * shop again after a refresh shows exactly what was saved. The access code is
 * shown once afterwards because the shop owner has to write it down.
 */
export function CreateShopDialog({ children }: { children: ReactNode }) {
  const createShop = useCreateShop();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "done">("form");
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("general");
  const [location, setLocation] = useState("");
  const [phone, setPhone] = useState("");
  const [acceptsRefunds, setAcceptsRefunds] = useState(false);
  const [showLogo, setShowLogo] = useState(true);
  const [footerText, setFooterText] = useState("");
  const [receiptPrefix, setReceiptPrefix] = useState("SV");
  const [accessCode, setAccessCode] = useState(() => suggestAccessCode());
  const [generateCode, setGenerateCode] = useState(true);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [created, setCreated] = useState<{ shop: Shop; code: string | null } | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("form");
    setName("");
    setBusinessType("general");
    setLocation("");
    setPhone("");
    setAcceptsRefunds(false);
    setShowLogo(true);
    setFooterText("");
    setReceiptPrefix("SV");
    setAccessCode(suggestAccessCode());
    setGenerateCode(true);
    setLogoFile(null);
    setErrors({});
    setCreated(null);
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    const next: Record<string, string | undefined> = {};
    if (name.trim().length < 2) next["name"] = "Give the shop a name of at least 2 characters.";
    if (phone && !/^(\+?254|0)\d{9}$/.test(phone.replace(/\s+/g, ""))) {
      next["phone"] = "Include your country code, e.g. +254 712 345 678.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    try {
      // The logo is uploaded under the shop id, so it must wait until the shop
      // exists to satisfy the storage policy `<shop_id>/<filename>`.
      const result = await createShop.mutateAsync({
        name: name.trim(),
        businessType,
        location: location.trim() || null,
        phone: phone.trim() || null,
        acceptsRefunds,
        receipt: {
          footerText: footerText.trim() || null,
          showLogo: showLogo && Boolean(logoFile),
          receiptPrefix: receiptPrefix.trim() || "SV",
        },
        employeeAccessCode: generateCode ? accessCode : null,
      });

      if (logoFile) {
        setUploading(true);
        try {
          const logoPath = await uploadImage(STORAGE_BUCKETS.shopLogos, result.shop.id, logoFile);
          await updateShop(result.shop.id, { logo_url: logoPath });
          await updateReceiptSettings(result.shop.id, { logoUrl: logoPath, showLogo: true });
        } catch (error) {
          toast.error(
            error instanceof Error
              ? `Shop created, but the logo could not be saved: ${error.message}`
              : "Shop created, but the logo could not be saved.",
          );
        } finally {
          setUploading(false);
        }
      }

      setCreated({ shop: result.shop, code: generateCode ? accessCode : null });
      setStep("done");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create the shop.";
      setErrors({ form: message });
      toast.error(message, { duration: 8000 });
    }
  }

  const busy = createShop.isPending || uploading;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto px-5 pb-8 pt-5">
        {step === "done" && created ? (
          <ShopCreated
            shop={created.shop}
            code={created.code}
            onOpen={() => {
              setOpen(false);
              void navigate({ to: "/app", search: { shop: created.shop.id } });
            }}
          />
        ) : (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="text-base">Set up your shop</SheetTitle>
              <SheetDescription className="text-sm">
                These details print on your receipts. You can change any of them later.
              </SheetDescription>
            </SheetHeader>

            <form onSubmit={submit} className="mt-5 space-y-5" noValidate>
              <Field label="Shop name" error={errors["name"]} htmlFor="shop-name">
                <Input
                  id="shop-name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setErrors((c) => ({ ...c, name: undefined }));
                  }}
                  placeholder="e.g. Mama Njeri Stores"
                  className="h-12"
                  autoComplete="organization"
                  autoFocus
                />
              </Field>

              <Field label="What kind of shop" htmlFor="shop-type">
                <Select value={businessType} onValueChange={setBusinessType}>
                  <SelectTrigger id="shop-type" className="h-12">
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
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Location" hint="Town or area" htmlFor="shop-location">
                  <Input
                    id="shop-location"
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    placeholder="City centre"
                    className="h-12"
                    autoComplete="off"
                  />
                </Field>
                <Field label="Phone" error={errors["phone"]} htmlFor="shop-phone">
                  <Input
                    id="shop-phone"
                    value={phone}
                    onChange={(event) => {
                      setPhone(event.target.value);
                      setErrors((c) => ({ ...c, phone: undefined }));
                    }}
                    inputMode="tel"
                    placeholder="+1 555 0100"
                    className="h-12"
                    autoComplete="tel"
                  />
                </Field>
              </div>

              <Field
                label="Shop logo"
                hint="Optional. Shown on your receipts if you turn that on below."
                htmlFor="shop-logo"
              >
                <div className="flex items-center gap-3">
                  {logoFile ? (
                    <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-sunken text-[10px] uppercase text-muted-foreground">
                      {logoFile.name.slice(-4)}
                    </span>
                  ) : null}
                  <Input
                    id="shop-logo"
                    type="file"
                    accept="image/*"
                    className="h-12"
                    onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
                  />
                </div>
              </Field>

              {/* ----------------------------------------------------- policy */}
              <div className="glass-2 rounded-xl backdrop-blur-md backdrop-saturate-150 px-4">
                <ToggleRow
                  title="Does your shop accept refunds?"
                  description="When this is off, nobody at the counter can process a refund. Staff will see why instead of guessing."
                  checked={acceptsRefunds}
                  onCheckedChange={setAcceptsRefunds}
                />
              </div>

              {/* ---------------------------------------------------- receipts */}
              <div className="glass-2 rounded-xl backdrop-blur-md backdrop-saturate-150 px-4">
                <ToggleRow
                  title="Show the logo on receipts"
                  description="Requires a logo above."
                  checked={showLogo}
                  disabled={!logoFile}
                  onCheckedChange={setShowLogo}
                />
              </div>

              <Field
                label="Receipt footer"
                hint="A thank-you line printed at the bottom. Optional."
                htmlFor="shop-footer"
              >
                <Input
                  id="shop-footer"
                  value={footerText}
                  onChange={(event) => setFooterText(event.target.value)}
                  placeholder="Thank you for your business!"
                  className="h-12"
                  autoComplete="off"
                />
              </Field>

              <Field
                label="Receipt numbers start with"
                hint={`Your receipts will read ${(receiptPrefix || "SV").toUpperCase()}-00001, ${(receiptPrefix || "SV").toUpperCase()}-00002, and so on.`}
                htmlFor="shop-prefix"
              >
                <Input
                  id="shop-prefix"
                  value={receiptPrefix}
                  onChange={(event) => setReceiptPrefix(event.target.value.toUpperCase())}
                  maxLength={6}
                  className="tnum h-12"
                  autoComplete="off"
                />
              </Field>

              {/* ------------------------------------------------ staff access */}
              <div className="glass-2 rounded-xl backdrop-blur-md backdrop-saturate-150 px-4">
                <ToggleRow
                  title="Give my staff an access code"
                  description="They enter it once when they sign up and land straight in this shop. No account ids to copy around."
                  checked={generateCode}
                  onCheckedChange={setGenerateCode}
                />
                {generateCode ? (
                  <div className="pb-4">
                    <Field
                      label="Your access code"
                      hint="Write it down — you will not be able to read it back."
                      htmlFor="shop-code"
                    >
                      <Input
                        id="shop-code"
                        value={accessCode}
                        onChange={(event) => setAccessCode(event.target.value.replace(/\D/g, ""))}
                        inputMode="numeric"
                        className="tnum h-14 text-center text-xl font-semibold tracking-[0.35em]"
                        autoComplete="off"
                      />
                    </Field>
                  </div>
                ) : null}
              </div>

              {errors["form"] ? (
                <p className="rounded-lg border border-negative/30 bg-negative-soft/60 px-3.5 py-2.5 text-sm text-negative">
                  {errors["form"]}
                </p>
              ) : null}

              <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Store className="size-4" />}
                {busy ? "Setting up…" : "Create shop"}
              </Button>
            </form>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** The confirmation step: the shop exists, and here is the code, once. */
function ShopCreated({
  shop,
  code,
  onOpen,
}: {
  shop: Shop;
  code: string | null;
  onOpen: () => void;
}) {
  return (
    <div className="py-2">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="grid size-11 place-items-center rounded-full bg-positive-soft text-positive">
          <Check className="size-5" aria-hidden />
        </span>
        <div>
          <p className="text-base font-semibold">{shop.name} is ready</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You are the owner. Start with your first product, then sell.
          </p>
        </div>
      </div>

      {code ? (
        <div className="mt-6 rounded-xl border border-positive/40 bg-positive-soft/50 p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-positive">
            Staff access code
          </p>
          <p className="tnum mt-1.5 text-3xl font-semibold tracking-[0.3em]">{code}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Write this down now. Give it to your staff — they type it when they sign up.
          </p>
          <Button
            variant="outline"
            className="mt-3 h-10"
            onClick={() => {
              void navigator.clipboard?.writeText(code);
              toast.success("Copied", { description: code });
            }}
          >
            <Copy className="size-4" /> Copy
          </Button>
        </div>
      ) : null}

      <Button className="mt-6 h-12 w-full text-base" onClick={onOpen}>
        Open my shop
      </Button>
    </div>
  );
}

export function ShopCard({ shop, role }: { shop: Shop; role?: string }) {
  return (
    <div className="flex items-center gap-3 p-4">
      <StorageImage
        bucket={STORAGE_BUCKETS.shopLogos}
        path={shop.logo_url}
        alt={`${shop.name} logo`}
        className="size-11 shrink-0 rounded-lg"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{shop.name}</p>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">
          {[shop.business_type, shop.location].filter(Boolean).join(" · ") || "No details yet"}
        </p>
      </div>
      {role ? (
        <span className="shrink-0 text-[11px] capitalize text-muted-foreground">{role}</span>
      ) : null}
    </div>
  );
}
