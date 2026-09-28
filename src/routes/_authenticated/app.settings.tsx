import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, Store } from "lucide-react";
import { toast } from "sonner";

import { LoadingState, PageContainer, PageHeader } from "@/components/app/AppChrome";
import { OwnerOnly } from "@/components/app/OwnerOnly";
import { StorageImage } from "@/components/app/StorageImage";
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
import { Switch } from "@/components/ui/switch";
import { useActiveShop } from "@/hooks/useActiveShop";
import {
  useReceiptSettings,
  useSetRefunds,
  useShopSettings,
  useUpdateReceiptSettings,
  useUpdateShop,
} from "@/hooks/useShopAdmin";
import { uploadImage } from "@/services/storage.service";
import { BUSINESS_TYPES } from "@/services/shops.service";
import { STORAGE_BUCKETS } from "@/types/ravqen";

export const Route = createFileRoute("/_authenticated/app/settings")({
  head: () => ({ meta: [{ title: "Shop settings — RAVQEN" }] }),
  component: () => (
    <OwnerOnly title="Shop settings">
      <SettingsPage />
    </OwnerOnly>
  ),
});

function SettingsPage() {
  const { activeShop } = useActiveShop();
  const shopId = activeShop?.id ?? "";

  const shopQuery = useShopSettings(shopId);
  const receiptQuery = useReceiptSettings(shopId);
  const updateShop = useUpdateShop(shopId);
  const updateReceipt = useUpdateReceiptSettings(shopId);
  const setRefunds = useSetRefunds(shopId);

  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("general");
  const [location, setLocation] = useState("");
  const [phone, setPhone] = useState("");
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [footerText, setFooterText] = useState("");
  const [headerText, setHeaderText] = useState("");
  const [showLogo, setShowLogo] = useState(true);
  const [receiptPrefix, setReceiptPrefix] = useState("RV");
  const [paperWidth, setPaperWidth] = useState("58");

  useEffect(() => {
    const shop = shopQuery.data;
    if (!shop) return;
    setName(shop.name);
    setBusinessType(shop.business_type ?? "general");
    setLocation(shop.location ?? "");
    setPhone(shop.phone ?? "");
    setLogoPath(shop.logo_url);
  }, [shopQuery.data]);

  useEffect(() => {
    const settings = receiptQuery.data;
    if (!settings) return;
    setFooterText(settings.footer_text ?? "");
    setHeaderText(settings.header_text ?? "");
    setShowLogo(settings.show_logo);
    setReceiptPrefix(settings.receipt_prefix);
    setPaperWidth(String(settings.paper_width_mm));
  }, [receiptQuery.data]);

  if (shopQuery.isPending) return <LoadingState label="Loading your shop…" />;
  if (!shopQuery.data) {
    return (
      <PageContainer>
        <PageHeader title="Shop settings" />
        <p className="mt-6 text-sm text-muted-foreground">This shop could not be loaded.</p>
      </PageContainer>
    );
  }

  const shop = shopQuery.data;

  async function handleLogo(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const path = await uploadImage(STORAGE_BUCKETS.shopLogos, shopId, file);
      setLogoPath(path);
      await updateShop.mutateAsync({ logo_url: path });
      toast.success("Logo uploaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The logo could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  async function saveShop(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) {
      toast.error("Give the shop a name.");
      return;
    }
    try {
      await updateShop.mutateAsync({
        name: name.trim(),
        business_type: businessType,
        location: location.trim() || null,
        phone: phone.trim() || null,
      });
      toast.success("Shop details saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the shop details.");
    }
  }

  async function toggleRefunds(next: boolean) {
    try {
      await setRefunds.mutateAsync(next);
      toast.success(next ? "Refunds are now accepted" : "Refunds are now refused", {
        description: next
          ? "Staff can refund a sale and the stock is restored."
          : "The database will refuse refund operations for this shop.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change the refund setting.");
    }
  }

  async function saveReceipt(event: React.FormEvent) {
    event.preventDefault();
    try {
      await updateReceipt.mutateAsync({
        footerText: footerText || null,
        headerText: headerText || null,
        showLogo,
        receiptPrefix,
        paperWidthMm: paperWidth === "80" ? 80 : 58,
      });
      toast.success("Receipt settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the receipt settings.");
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Shop settings"
        subtitle="Owner-controlled. Staff cannot reach this screen."
      />

      <form onSubmit={saveShop} className="surface-panel mt-5 space-y-4 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          <Store className="size-4" /> Shop details
        </h2>

        <div className="space-y-1.5">
          <Label htmlFor="settings-name">Shop name</Label>
          <Input
            id="settings-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-11"
            autoComplete="organization"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="settings-type">Business type</Label>
          <Select value={businessType} onValueChange={setBusinessType}>
            <SelectTrigger id="settings-type" className="h-11">
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
          <Label htmlFor="settings-location">Location</Label>
          <Input
            id="settings-location"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="e.g. Gikomba, Nairobi"
            className="h-11"
            autoComplete="off"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="settings-phone">M-Pesa / business phone</Label>
          <Input
            id="settings-phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            inputMode="tel"
            placeholder="0712 345 678"
            className="h-11"
            autoComplete="tel"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="settings-logo">Shop logo</Label>
          <div className="flex items-center gap-3">
            <StorageImage
              bucket={STORAGE_BUCKETS.shopLogos}
              path={logoPath}
              alt={`${shop.name} logo`}
              className="size-14"
            />
            <Input
              id="settings-logo"
              type="file"
              accept="image/*"
              className="h-11"
              onChange={(event) => void handleLogo(event.target.files?.[0] ?? null)}
            />
          </div>
          {uploading ? <p className="text-xs text-muted-foreground">Uploading…</p> : null}
        </div>

        <Button type="submit" className="h-11 w-full" disabled={updateShop.isPending}>
          {updateShop.isPending ? <Loader2 className="animate-spin" /> : null} Save shop details
        </Button>
      </form>

      <div className="surface-panel mt-4 space-y-3 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          <ShieldCheck className="size-4" /> Refunds
        </h2>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Accept refunds</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Enforced in the database: while this is off, refund operations are refused for
              everyone, not just hidden in the app.
            </p>
          </div>
          <Switch
            checked={shop.accepts_refunds}
            onCheckedChange={(next) => void toggleRefunds(next)}
            disabled={setRefunds.isPending}
            aria-label="Accept refunds"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Currently {shop.accepts_refunds ? "accepting" : "refusing"} refunds.
        </p>
      </div>

      <form onSubmit={saveReceipt} className="surface-panel mt-4 space-y-4 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Receipts
        </h2>

        <div className="space-y-1.5">
          <Label htmlFor="settings-header">Header line (optional)</Label>
          <Input
            id="settings-header"
            value={headerText}
            onChange={(event) => setHeaderText(event.target.value)}
            placeholder="e.g. Quality goods, fair prices"
            className="h-11"
            autoComplete="off"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="settings-footer">Footer line</Label>
          <Input
            id="settings-footer"
            value={footerText}
            onChange={(event) => setFooterText(event.target.value)}
            placeholder="Asante kwa biashara!"
            className="h-11"
            autoComplete="off"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="settings-prefix">Receipt prefix</Label>
            <Input
              id="settings-prefix"
              value={receiptPrefix}
              onChange={(event) => setReceiptPrefix(event.target.value.toUpperCase())}
              maxLength={6}
              className="h-11 font-mono"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-width">Paper width</Label>
            <Select value={paperWidth} onValueChange={setPaperWidth}>
              <SelectTrigger id="settings-width" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="58">58 mm</SelectItem>
                <SelectItem value="80">80 mm</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Show the logo on receipts</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Requires a logo to be uploaded above.
            </p>
          </div>
          <Switch
            checked={showLogo}
            onCheckedChange={setShowLogo}
            aria-label="Show logo on receipts"
          />
        </div>

        <Button type="submit" className="h-11 w-full" disabled={updateReceipt.isPending}>
          {updateReceipt.isPending ? <Loader2 className="animate-spin" /> : null} Save receipt
          settings
        </Button>
      </form>

      <p className="mt-4 text-xs text-muted-foreground">
        Receipt numbers come from a per-shop counter in the database, so two tills selling at the
        same moment can never print the same number.
      </p>
    </PageContainer>
  );
}
