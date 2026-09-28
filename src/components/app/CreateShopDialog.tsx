import { useEffect, useState } from "react";
import { KeyRound, Loader2, Plus, Store } from "lucide-react";
import { toast } from "sonner";

import { StorageImage } from "@/components/app/StorageImage";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCreateShop } from "@/hooks/useShops";
import { updateReceiptSettings } from "@/services/receipts.service";
import { BUSINESS_TYPES, suggestAccessCode, updateShop } from "@/services/shops.service";
import { uploadImage } from "@/services/storage.service";
import { STORAGE_BUCKETS, type Shop } from "@/types/ravqen";

/**
 * Creates a shop and configures it in the same pass.
 *
 * Everything here is written to Supabase before the dialog closes: details,
 * logo, the refund policy, receipt layout and an optional staff access code.
 * Opening the shop again after a refresh shows exactly what was saved.
 */
export function CreateShopDialog({ children }: { children: React.ReactNode }) {
  const createShop = useCreateShop();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("general");
  const [location, setLocation] = useState("");
  const [phone, setPhone] = useState("");
  const [acceptsRefunds, setAcceptsRefunds] = useState(false);
  const [showLogo, setShowLogo] = useState(true);
  const [footerText, setFooterText] = useState("Asante kwa biashara!");
  const [receiptPrefix, setReceiptPrefix] = useState("RV");
  const [generateCode, setGenerateCode] = useState(true);
  const [accessCode, setAccessCode] = useState(() => suggestAccessCode());
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setBusinessType("general");
    setLocation("");
    setPhone("");
    setAcceptsRefunds(false);
    setShowLogo(true);
    setFooterText("Asante kwa biashara!");
    setReceiptPrefix("RV");
    setGenerateCode(true);
    setAccessCode(suggestAccessCode());
    setLogoFile(null);
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    if (name.trim().length < 2) {
      toast.error("Give the shop a name of at least 2 characters.");
      return;
    }
    if (phone && !/^(\+?254|0)\d{9}$/.test(phone.replace(/\s+/g, ""))) {
      toast.error("Use a Kenyan number, e.g. 0712345678.");
      return;
    }

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
          footerText,
          showLogo: showLogo && Boolean(logoFile),
          receiptPrefix,
        },
        employeeAccessCode: generateCode ? accessCode.trim() : null,
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

      toast.success(`${result.shop.name} is ready`, {
        description: generateCode
          ? `Staff access code ${accessCode.trim()} — share it with your till staff.`
          : "You are the owner. Add staff from the Employees screen.",
      });
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the shop.", {
        duration: 8000,
      });
    }
  }

  const busy = createShop.isPending || uploading;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create your shop</DialogTitle>
          <DialogDescription>
            Everything you set here is saved to your shop and survives signing out.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit}>
          <Tabs defaultValue="details">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">Shop</TabsTrigger>
              <TabsTrigger value="policy">Refunds</TabsTrigger>
              <TabsTrigger value="receipt">Receipt</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="shop-name">Shop name</Label>
                <Input
                  id="shop-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Mama Njeri Stores"
                  className="h-11"
                  autoComplete="organization"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="shop-type">Business type</Label>
                <Select value={businessType} onValueChange={setBusinessType}>
                  <SelectTrigger id="shop-type" className="h-11">
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
                <Label htmlFor="shop-location">Location</Label>
                <Input
                  id="shop-location"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="e.g. Gikomba, Nairobi"
                  className="h-11"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="shop-phone">M-Pesa / business phone</Label>
                <Input
                  id="shop-phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  inputMode="tel"
                  placeholder="0712 345 678"
                  className="h-11"
                  autoComplete="tel"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="shop-logo">Shop logo (optional)</Label>
                <Input
                  id="shop-logo"
                  type="file"
                  accept="image/*"
                  className="h-11"
                  onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">
                  Uploaded to your private shop bucket once the shop is created.
                </p>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <KeyRound className="size-3.5" /> Generate a staff access code
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Shown once. Only a digest is stored.
                  </p>
                </div>
                <Switch
                  checked={generateCode}
                  onCheckedChange={setGenerateCode}
                  aria-label="Generate a staff access code"
                />
              </div>

              {generateCode ? (
                <div className="space-y-1.5">
                  <Label htmlFor="shop-code">Access code</Label>
                  <Input
                    id="shop-code"
                    value={accessCode}
                    onChange={(event) => setAccessCode(event.target.value)}
                    inputMode="numeric"
                    className="h-11 font-mono tracking-widest"
                    autoComplete="off"
                  />
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="policy" className="mt-4 space-y-3">
              <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
                <div>
                  <p className="text-sm font-medium">Accept refunds</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    When this is off, the database refuses refund operations for the shop — it is a
                    real setting, not just a hidden button.
                  </p>
                </div>
                <Switch
                  checked={acceptsRefunds}
                  onCheckedChange={setAcceptsRefunds}
                  aria-label="Accept refunds"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                You can change this at any time from Settings.
              </p>
            </TabsContent>

            <TabsContent value="receipt" className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="shop-footer">Receipt footer</Label>
                <Input
                  id="shop-footer"
                  value={footerText}
                  onChange={(event) => setFooterText(event.target.value)}
                  placeholder="Asante kwa biashara!"
                  className="h-11"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="shop-prefix">Receipt prefix</Label>
                <Input
                  id="shop-prefix"
                  value={receiptPrefix}
                  onChange={(event) => setReceiptPrefix(event.target.value.toUpperCase())}
                  maxLength={6}
                  className="h-11 font-mono"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Receipts become {receiptPrefix || "RV"}-00001, {receiptPrefix || "RV"}-00002, …
                </p>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Show the logo on receipts</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Applies once a logo has been uploaded.
                  </p>
                </div>
                <Switch
                  checked={showLogo}
                  onCheckedChange={setShowLogo}
                  aria-label="Show logo on receipts"
                />
              </div>

              <p className="text-xs text-muted-foreground">
                The shop name, phone and location you entered are printed on every receipt.
              </p>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-5">
            <Button type="submit" className="h-12 w-full sm:w-auto" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Plus />}
              {busy ? "Creating…" : "Create shop"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ShopCard({ shop, role }: { shop: Shop; role?: string }) {
  return (
    <div className="surface-panel p-4">
      <div className="flex items-center gap-3">
        <StorageImage
          bucket={STORAGE_BUCKETS.shopLogos}
          path={shop.logo_url}
          alt={`${shop.name} logo`}
          className="size-11 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{shop.name}</p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {[shop.business_type, shop.location].filter(Boolean).join(" · ") || "No details yet"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className="block rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
            {shop.currency}
          </span>
          {role ? (
            <span className="mt-1 block text-[11px] capitalize text-muted-foreground">{role}</span>
          ) : null}
        </div>
      </div>
      {!shop.accepts_refunds ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Store className="size-3" /> Refunds are switched off for this shop
        </p>
      ) : null}
    </div>
  );
}
