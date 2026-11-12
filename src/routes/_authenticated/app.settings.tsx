import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { ErrorState, LoadingState, PageContainer, PageHeader } from "@/components/app/AppChrome";
import { ActivityLog } from "@/components/app/ActivityLog";
import { DataPrivacySection } from "@/components/app/DataPrivacySection";
import { DeleteShopSection } from "@/components/app/DeleteShopSection";
import { Field, ToggleRow } from "@/components/app/fields";
import { OwnerOnly } from "@/components/app/OwnerOnly";
import { StorageImage } from "@/components/app/StorageImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { STORAGE_BUCKETS } from "@/types/savo";

export const Route = createFileRoute("/_authenticated/app/settings")({
  head: () => ({ meta: [{ title: "Pith — Settings" }] }),
  component: () => (
    <OwnerOnly title="Settings">
      <SettingsPage />
    </OwnerOnly>
  ),
});

/**
 * Shop settings, in the shopkeeper's language.
 *
 * Every control here writes to Supabase and takes effect immediately or on
 * save — none of them describe how the product stores anything. A setting the
 * user cannot act on is a setting that should not be on their screen.
 */
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
  const [receiptPrefix, setReceiptPrefix] = useState("SV");
  const [paperWidth, setPaperWidth] = useState("58");

  /**
   * The navigation sends people straight to one section of this screen
   * (Receipt settings, Refund settings). The router's own hash handling runs
   * before these queries resolve, so the anchor is not in the document yet and
   * nothing would scroll. Retry briefly once the form is actually on screen.
   */
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    if (shopQuery.isLoading) return;

    let attempt = 0;
    const timer = window.setInterval(() => {
      document.getElementById(hash)?.scrollIntoView({ block: "start" });
      if (++attempt >= 10) window.clearInterval(timer);
    }, 120);
    return () => window.clearInterval(timer);
  }, [shopQuery.isLoading]);

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

  if (shopQuery.isLoading) return <LoadingState label="Loading your shop…" />;

  if (shopQuery.isError) {
    return (
      <PageContainer>
        <PageHeader title="Settings" />
        <div className="mt-4">
          <ErrorState message={shopQuery.error.message} onRetry={() => void shopQuery.refetch()} />
        </div>
      </PageContainer>
    );
  }

  const shop = shopQuery.data;
  if (!shop) return null;

  async function handleLogo(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const path = await uploadImage(STORAGE_BUCKETS.shopLogos, shopId, file);
      setLogoPath(path);
      await updateShop.mutateAsync({ logo_url: path });
      toast.success("Logo saved");
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
      toast.success(next ? "Refunds switched on" : "Refunds switched off", {
        description: next
          ? "Staff can take goods back and the stock goes back on the shelf."
          : "Refunds are now refused at the counter for everyone.",
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
      <PageHeader title="Settings" />

      {/* ------------------------------------------------------------ shop */}
      <form onSubmit={saveShop} id="shop" className="scroll-mt-20 space-y-4">
        <Section title="Your shop" />

        <Field label="Shop name" htmlFor="settings-name">
          <Input
            id="settings-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-12"
            autoComplete="organization"
          />
        </Field>

        <Field label="What kind of shop" htmlFor="settings-type">
          <Select value={businessType} onValueChange={setBusinessType}>
            <SelectTrigger id="settings-type" className="h-12">
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

        {/* min-w-0 lets the inputs shrink inside the grid instead of forcing the page wide on a 360px phone. */}
        <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
          <Field label="Location" htmlFor="settings-location">
            <Input
              id="settings-location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Gikomba"
              className="h-12"
              autoComplete="off"
            />
          </Field>
          <Field label="Phone" htmlFor="settings-phone">
            <Input
              id="settings-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              inputMode="tel"
              placeholder="0712 345 678"
              className="h-12"
              autoComplete="tel"
            />
          </Field>
        </div>

        <Field
          label="Shop logo"
          hint="Printed on your receipts if you turn that on below."
          htmlFor="settings-logo"
        >
          <div className="flex items-center gap-3">
            <StorageImage
              bucket={STORAGE_BUCKETS.shopLogos}
              path={logoPath}
              alt={`${name.trim() || "Shop"} logo`}
              className="size-12 shrink-0 rounded-lg"
            />
            <Input
              id="settings-logo"
              type="file"
              accept="image/*"
              className="h-12"
              onChange={(event) => void handleLogo(event.target.files?.[0] ?? null)}
            />
          </div>
          {uploading ? <p className="text-xs text-muted-foreground">Uploading…</p> : null}
        </Field>

        <Button type="submit" className="h-12 w-full" disabled={updateShop.isPending}>
          {updateShop.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Save shop details
        </Button>
      </form>

      {/* --------------------------------------------------------- refunds */}
      <section id="refunds" className="mt-8 scroll-mt-20 border-t border-border pt-5">
        <Section title="Refunds" />
        <div className="glass-2 rounded-xl backdrop-blur-md backdrop-saturate-150 px-4">
          <ToggleRow
            title="Accept refunds"
            description="When this is on, staff can take goods back and the stock returns to the shelf. When it is off, nobody can — not even the owner — until it is switched back on."
            checked={shop.accepts_refunds}
            onCheckedChange={(next) => void toggleRefunds(next)}
            disabled={setRefunds.isPending}
          />
        </div>
      </section>

      {/* -------------------------------------------------------- receipts */}
      <form
        onSubmit={saveReceipt}
        id="receipts"
        className="mt-8 scroll-mt-20 space-y-4 border-t border-border pt-5"
      >
        <Section title="Receipts" />

        <div className="glass-2 rounded-xl backdrop-blur-md backdrop-saturate-150 px-4">
          <ToggleRow
            title="Show the logo on receipts"
            description="Needs a logo above."
            checked={showLogo}
            onCheckedChange={setShowLogo}
            disabled={!logoPath}
          />
        </div>

        <Field label="Line under the shop name" hint="Optional." htmlFor="settings-header">
          <Input
            id="settings-header"
            value={headerText}
            onChange={(event) => setHeaderText(event.target.value)}
            placeholder="Quality goods, fair prices"
            className="h-12"
            autoComplete="off"
          />
        </Field>

        <Field label="Line at the bottom" hint="Shown after the total." htmlFor="settings-footer">
          <Input
            id="settings-footer"
            value={footerText}
            onChange={(event) => setFooterText(event.target.value)}
            placeholder="Asante kwa biashara!"
            className="h-12"
            autoComplete="off"
          />
        </Field>

        {/* min-w-0 lets the inputs shrink inside the grid instead of forcing the page wide on a 360px phone. */}
        <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
          <Field label="Receipt numbers start with" htmlFor="settings-prefix">
            <Input
              id="settings-prefix"
              value={receiptPrefix}
              onChange={(event) => setReceiptPrefix(event.target.value.toUpperCase())}
              maxLength={6}
              className="tnum h-12"
              autoComplete="off"
            />
          </Field>
          <Field label="Paper size" htmlFor="settings-width">
            <Select value={paperWidth} onValueChange={setPaperWidth}>
              <SelectTrigger id="settings-width" className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="58">58 mm</SelectItem>
                <SelectItem value="80">80 mm</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Button type="submit" className="h-12 w-full" disabled={updateReceipt.isPending}>
          {updateReceipt.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Save receipt settings
        </Button>
      </form>

      {/* --------------------------------------------------------- account */}
      <section id="activity" className="mt-8 scroll-mt-20 border-t border-border pt-5">
        <Section title="Activity log" />
        <ActivityLog shopId={shopId} />
      </section>

      <section id="data" className="mt-8 scroll-mt-20 border-t border-border pt-5">
        <Section title="Data & privacy" />
        <DataPrivacySection />
      </section>

      {/*
        Last on the screen, and below everything else on purpose. Account deletion
        above it explicitly tells an owner who still runs a shop to close it
        first, so this has to be the thing they scroll to next — not something
        they meet halfway down a settings page.
      */}
      <section id="delete-shop" className="mt-8 scroll-mt-20 border-t border-border pt-5">
        <Section title="Closing the shop" />
        <DeleteShopSection />
      </section>
    </PageContainer>
  );
}

/** A small section heading that does not shout. */
function Section({ title }: { title: string }) {
  return <h2 className="eyebrow mb-3">{title}</h2>;
}
