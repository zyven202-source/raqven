import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Minus, Plus, ShieldCheck, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/app/fields";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/hooks/useSession";
import {
  useCustomerProfile,
  useSaveCustomerProfile,
  useSubmitMarketOrder,
} from "@/hooks/useMarketlink";
import { feeLabel, zoneLabel, zoneMatches } from "@/lib/marketlink";
import { formatMoney } from "@/lib/format";
import { marketImageUrl } from "@/services/marketlink.service";
import type { PublicDeliveryZone, PublicShop, SubmitOrderResult } from "@/types/marketlink";
import type { MarketFeedItem } from "@/types/marketlink";
import { cn } from "@/lib/utils";

export interface CartLine {
  item: MarketFeedItem;
  quantity: number;
}

type Step = "basket" | "details" | "review" | "done";

/**
 * Checkout as four honest steps: what you chose, who you are, what you are
 * asking for, and what actually happened.
 *
 * The total shown here is a preview. The server re-reads every price and the
 * stock level when the request is submitted and returns the authoritative
 * figures, which are what the confirmation screen shows.
 */
export function CheckoutDrawer({
  open,
  onOpenChange,
  shop,
  delivery,
  lines,
  onQuantityChange,
  onRemove,
  onClear,
  originPath,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shop: PublicShop;
  delivery: PublicDeliveryZone[];
  lines: CartLine[];
  onQuantityChange: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
  originPath: string;
}) {
  const { session, loading: sessionLoading } = useSession();
  const profile = useCustomerProfile(session?.user.id ?? "");
  const saveProfile = useSaveCustomerProfile(session?.user.id ?? "");
  const submit = useSubmitMarketOrder();

  const [step, setStep] = useState<Step>("basket");
  const [clientToken, setClientToken] = useState(() => crypto.randomUUID());
  const [result, setResult] = useState<SubmitOrderResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [preferred, setPreferred] = useState<"phone" | "email" | "whatsapp">("phone");
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup");
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [remember, setRemember] = useState(true);

  // Saved details are offered, not silently applied: the profile belongs to the
  // signed-in customer and they can correct anything before sending.
  useEffect(() => {
    const saved = profile.data;
    if (!saved) return;
    setName((current) => current || saved.full_name || "");
    setPhone((current) => current || saved.phone || "");
    setEmail((current) => current || saved.email || "");
    setCountry((current) => current || saved.country || "");
    setRegion((current) => current || saved.region || "");
    setCity((current) => current || saved.city || "");
  }, [profile.data]);

  useEffect(() => {
    if (session?.user.email) setEmail((current) => current || session.user.email || "");
  }, [session?.user.email]);

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + Number(line.item.price) * line.quantity, 0),
    [lines],
  );
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  const matchingZones = useMemo(
    () => delivery.filter((zone) => zoneMatches(zone, country, region, city)),
    [delivery, country, region, city],
  );
  const zone = matchingZones.find((entry) => entry.id === zoneId) ?? null;
  const deliveryFee = zone?.fee ?? null;

  useEffect(() => {
    if (fulfillment === "delivery" && matchingZones.length === 1 && !zoneId) {
      setZoneId(matchingZones[0]?.id ?? "");
    }
  }, [fulfillment, matchingZones, zoneId]);

  function reset() {
    setStep("basket");
    setResult(null);
    setError(null);
    setClientToken(crypto.randomUUID());
    setZoneId("");
    setAddress("");
    setNote("");
    setFulfillment("pickup");
  }

  async function send() {
    if (!session) return;
    setError(null);
    if (!name.trim() || name.trim().length < 2) {
      setError("Enter the name the shop should reply to.");
      return;
    }
    if (!phone.trim() && !email.trim()) {
      setError("Add a phone number or an email address so the shop can reach you.");
      return;
    }
    if (fulfillment === "delivery") {
      if (!country.trim()) {
        setError("Choose the country this should be delivered to.");
        return;
      }
      if (!zone) {
        setError("Choose one of this shop's delivery options.");
        return;
      }
      if (address.trim().length < 5) {
        setError("Add the delivery address.");
        return;
      }
    }

    try {
      const response = await submit.mutateAsync({
        slug: shop.slug,
        clientToken,
        customerName: name.trim(),
        customerPhone: phone.trim() || null,
        customerEmail: email.trim() || null,
        preferredContact: preferred,
        fulfillment,
        deliveryZoneId: fulfillment === "delivery" ? zoneId : null,
        destinationCountry: fulfillment === "delivery" ? country.trim() : null,
        destinationRegion: fulfillment === "delivery" ? region.trim() || null : null,
        destinationCity: fulfillment === "delivery" ? city.trim() || null : null,
        deliveryAddress: fulfillment === "delivery" ? address.trim() : null,
        note: note.trim() || null,
        items: lines.map((line) => ({
          product_id: line.item.product_id,
          quantity: line.quantity,
        })),
      });
      setResult(response);
      setStep("done");
      onClear();
      if (remember && session) {
        await saveProfile
          .mutateAsync({
            full_name: name.trim(),
            phone: phone.trim() || null,
            email: email.trim() || null,
          })
          .catch(() => toast.error("Your details could not be saved for next time."));
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The request could not be sent.";
      setError(message);
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next && step === "done") reset();
      }}
      shouldScaleBackground={false}
    >
      <DrawerContent className="glass-sheet mx-auto max-h-[94dvh] max-w-lg gap-0 rounded-t-glass-lg px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] text-foreground">
        <div className="mx-auto w-full max-w-md overflow-y-auto overscroll-contain">
          {step === "basket" ? (
            <>
              <DrawerTitle className="text-left font-display text-xl font-semibold">
                Your basket
              </DrawerTitle>
              <DrawerDescription className="mt-1 text-left text-sm text-muted-foreground">
                {itemCount === 0
                  ? "Nothing selected yet."
                  : `${itemCount} item${itemCount === 1 ? "" : "s"} from ${shop.name}`}
              </DrawerDescription>

              <ul className="mt-4 divide-y divide-[var(--brand-line)] border-y border-[var(--brand-line)]">
                {lines.map((line) => {
                  const image = marketImageUrl(line.item.image_path);
                  const max = Math.max(1, Math.min(line.item.max_quantity, 99));
                  return (
                    <li key={line.item.id} className="flex gap-3 py-3">
                      <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-[var(--brand-surface)]">
                        {image ? (
                          <img
                            src={image}
                            alt=""
                            className="size-full object-cover"
                            loading="lazy"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-tight">{line.item.name}</p>
                        <p className="tnum mt-0.5 text-xs text-muted-foreground">
                          {formatMoney(line.item.price, line.item.currency)} each
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={`Fewer ${line.item.name}`}
                            className="press grid size-8 place-items-center rounded-md border border-[var(--brand-line)] bg-[var(--brand-surface)]"
                            onClick={() =>
                              onQuantityChange(line.item.product_id, line.quantity - 1)
                            }
                          >
                            <Minus className="size-3.5" aria-hidden />
                          </button>
                          <span className="tnum min-w-6 text-center text-sm font-semibold">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label={`More ${line.item.name}`}
                            disabled={line.quantity >= max}
                            className="press grid size-8 place-items-center rounded-md border border-[var(--brand-line)] bg-[var(--brand-surface)] disabled:opacity-40"
                            onClick={() =>
                              onQuantityChange(line.item.product_id, line.quantity + 1)
                            }
                          >
                            <Plus className="size-3.5" aria-hidden />
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove ${line.item.name}`}
                            className="press ml-auto grid size-8 place-items-center rounded-md text-muted-foreground"
                            onClick={() => onRemove(line.item.product_id)}
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </button>
                        </div>
                      </div>
                      <p className="tnum shrink-0 text-sm font-semibold">
                        {formatMoney(Number(line.item.price) * line.quantity, line.item.currency)}
                      </p>
                    </li>
                  );
                })}
              </ul>

              {lines.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                  <ShoppingBag className="size-7" aria-hidden />
                  <p className="text-sm">Add a product to start a request.</p>
                </div>
              ) : (
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Items</span>
                  <span className="tnum font-semibold">{formatMoney(subtotal, shop.currency)}</span>
                </div>
              )}

              <Button
                className="mt-4 h-12 w-full"
                disabled={lines.length === 0}
                onClick={() => setStep("details")}
              >
                Continue
              </Button>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                This is an order request. Nothing is paid here, and stock is not reserved.
              </p>
            </>
          ) : null}

          {step === "details" ? (
            <>
              <DrawerTitle className="text-left font-display text-xl font-semibold">
                Your details
              </DrawerTitle>
              <DrawerDescription className="mt-1 text-left text-sm text-muted-foreground">
                Shared only with {shop.name}, so they can answer this request.
              </DrawerDescription>

              {!session && !sessionLoading ? (
                <div className="mt-4 rounded-lg border border-[var(--brand-line)] bg-[var(--brand-surface)] p-3">
                  <p className="text-sm font-medium">Sign in to send this request</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    SAVO needs an account so this shop can reply and so you can follow the request.
                    Browsing stays open to everyone.
                  </p>
                  <Button asChild className="mt-3 h-11 w-full">
                    <Link to="/auth/login" search={{ redirect: originPath }}>
                      Sign in or create an account
                    </Link>
                  </Button>
                </div>
              ) : null}

              <div className={cn("mt-4 space-y-3", !session && "pointer-events-none opacity-50")}>
                <Field label="Your name" htmlFor="mk-name">
                  <Input
                    id="mk-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    className="h-12"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
                  <Field label="Phone" htmlFor="mk-phone" hint="Optional if you give an email.">
                    <Input
                      id="mk-phone"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      inputMode="tel"
                      autoComplete="tel"
                      className="h-12"
                    />
                  </Field>
                  <Field label="Email" htmlFor="mk-email" hint="Optional if you give a phone.">
                    <Input
                      id="mk-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      inputMode="email"
                      autoComplete="email"
                      className="h-12"
                    />
                  </Field>
                </div>
                <Field label="How should the shop reply?" htmlFor="mk-preferred">
                  <Select
                    value={preferred}
                    onValueChange={(value) => setPreferred(value as "phone" | "email" | "whatsapp")}
                  >
                    <SelectTrigger id="mk-preferred" className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="phone">Phone call</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <fieldset>
                  <legend className="text-sm font-medium">Collection or delivery</legend>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(["pickup", "delivery"] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={fulfillment === option}
                        onClick={() => setFulfillment(option)}
                        className={cn(
                          "press rounded-lg border px-3 py-2.5 text-sm font-medium",
                          fulfillment === option
                            ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-[#04140e]"
                            : "border-[var(--brand-line)] bg-[var(--brand-surface)] text-foreground",
                        )}
                      >
                        {option === "pickup" ? "Collect from shop" : "Deliver to me"}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {fulfillment === "delivery" ? (
                  <div className="space-y-3 rounded-lg border border-[var(--brand-line)] p-3">
                    <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
                      <Field label="Country" htmlFor="mk-country">
                        <Input
                          id="mk-country"
                          value={country}
                          onChange={(event) => {
                            setCountry(event.target.value);
                            setZoneId("");
                          }}
                          autoComplete="country-name"
                          className="h-12"
                          placeholder="Kenya"
                        />
                      </Field>
                      <Field label="County / region" htmlFor="mk-region">
                        <Input
                          id="mk-region"
                          value={region}
                          onChange={(event) => {
                            setRegion(event.target.value);
                            setZoneId("");
                          }}
                          autoComplete="address-level1"
                          className="h-12"
                          placeholder="Garissa"
                        />
                      </Field>
                    </div>
                    <Field label="Town / city" htmlFor="mk-city">
                      <Input
                        id="mk-city"
                        value={city}
                        onChange={(event) => {
                          setCity(event.target.value);
                          setZoneId("");
                        }}
                        autoComplete="address-level2"
                        className="h-12"
                      />
                    </Field>
                    <Field label="Delivery address" htmlFor="mk-address">
                      <Input
                        id="mk-address"
                        value={address}
                        onChange={(event) => setAddress(event.target.value)}
                        autoComplete="street-address"
                        className="h-12"
                      />
                    </Field>

                    {country.trim() ? (
                      matchingZones.length > 0 ? (
                        <Field label="Delivery option" htmlFor="mk-zone">
                          <Select value={zoneId} onValueChange={setZoneId}>
                            <SelectTrigger id="mk-zone" className="h-12">
                              <SelectValue placeholder="Choose an option" />
                            </SelectTrigger>
                            <SelectContent>
                              {matchingZones.map((entry) => (
                                <SelectItem key={entry.id} value={entry.id}>
                                  {zoneLabel(entry)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      ) : (
                        <p className="rounded-md border border-caution/30 bg-caution-soft/60 px-3 py-2 text-xs text-caution">
                          This shop has not listed delivery to that destination. You can request
                          collection instead.
                        </p>
                      )
                    ) : null}

                    {zone ? (
                      <p className="text-xs text-muted-foreground">
                        {feeLabel(zone.fee, shop.currency)}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="rounded-lg border border-[var(--brand-line)] bg-[var(--brand-surface)] px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                    The shop will confirm the collection point and time with you.
                  </p>
                )}

                <Field label="Note for the shop" htmlFor="mk-note" hint="Optional.">
                  <textarea
                    id="mk-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={3}
                    maxLength={1000}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Anything they should know about this order?"
                  />
                </Field>

                {session ? (
                  <label className="flex items-start gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(event) => setRemember(event.target.checked)}
                      className="mt-0.5 size-4 accent-[var(--brand-primary)]"
                    />
                    Save these details to my SAVO account for next time
                  </label>
                ) : null}
              </div>

              {error ? (
                <p className="mt-3 rounded-lg border border-negative/30 bg-negative-soft/60 px-3 py-2 text-sm text-negative">
                  {error}
                </p>
              ) : null}

              <div className="mt-4 flex gap-2">
                <Button variant="outline" className="h-12 flex-1" onClick={() => setStep("basket")}>
                  Back
                </Button>
                <Button
                  className="h-12 flex-1"
                  disabled={!session || sessionLoading}
                  onClick={() => {
                    setError(null);
                    setStep("review");
                  }}
                >
                  Review
                </Button>
              </div>
            </>
          ) : null}

          {step === "review" ? (
            <>
              <DrawerTitle className="text-left font-display text-xl font-semibold">
                Review the request
              </DrawerTitle>
              <DrawerDescription className="mt-1 text-left text-sm text-muted-foreground">
                Check the seller, the items and the total before sending.
              </DrawerDescription>

              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-lg border border-[var(--brand-line)] p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Seller</p>
                  <p className="mt-1 font-semibold">{shop.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[shop.city, shop.region, shop.country].filter(Boolean).join(", ") ||
                      "Location not published"}
                  </p>
                </div>

                <ul className="divide-y divide-[var(--brand-line)] border-y border-[var(--brand-line)]">
                  {lines.map((line) => (
                    <li key={line.item.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate">{line.item.name}</span>
                        <span className="tnum block text-xs text-muted-foreground">
                          {line.quantity} × {formatMoney(line.item.price, line.item.currency)}
                        </span>
                      </span>
                      <span className="tnum font-medium">
                        {formatMoney(Number(line.item.price) * line.quantity, line.item.currency)}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="space-y-1">
                  <Row label="Items" value={formatMoney(subtotal, shop.currency)} />
                  <Row
                    label="Delivery"
                    value={
                      fulfillment === "pickup"
                        ? "Collection"
                        : deliveryFee === null
                          ? "Cost confirmed by the shop"
                          : formatMoney(deliveryFee, shop.currency)
                    }
                  />
                  <Row
                    label="Request total"
                    value={formatMoney(subtotal + (deliveryFee ?? 0), shop.currency)}
                    strong
                  />
                </div>

                <div className="rounded-lg border border-[var(--brand-line)] bg-[var(--brand-surface)] p-3 text-xs leading-relaxed text-muted-foreground">
                  <p className="flex items-center gap-1.5 font-medium text-foreground">
                    <ShieldCheck className="size-4 text-[var(--brand-primary)]" aria-hidden />
                    What happens next
                  </p>
                  <p className="mt-1">
                    {shop.name} receives this request inside SAVO. They will confirm availability,
                    the delivery cost if any, and how to pay. Nothing has been paid and no stock has
                    been reserved.
                  </p>
                </div>
              </div>

              {error ? (
                <p className="mt-3 rounded-lg border border-negative/30 bg-negative-soft/60 px-3 py-2 text-sm text-negative">
                  {error}
                </p>
              ) : null}

              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  className="h-12 flex-1"
                  onClick={() => setStep("details")}
                >
                  Back
                </Button>
                <Button
                  className="h-12 flex-1"
                  disabled={submit.isPending || !session}
                  onClick={() => void send()}
                >
                  {submit.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Send request
                </Button>
              </div>
            </>
          ) : null}

          {step === "done" && result ? (
            <div className="py-2 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-positive-soft text-positive">
                <Check className="size-6" aria-hidden />
              </span>
              <DrawerTitle className="mt-3 text-center font-display text-xl font-semibold">
                Request sent to {result.shop_name}
              </DrawerTitle>
              <DrawerDescription className="mt-1 text-center text-sm text-muted-foreground">
                Reference{" "}
                <span className="tnum font-semibold text-foreground">{result.reference}</span>
              </DrawerDescription>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                This is a request, not a confirmed order. The shop will contact you to confirm
                availability and payment. Nothing has been charged and no stock has been reserved.
              </p>
              <div className="tnum mx-auto mt-4 max-w-xs rounded-lg border border-[var(--brand-line)] p-3 text-sm">
                <Row label="Items" value={formatMoney(result.subtotal, result.currency)} />
                <Row
                  label="Delivery"
                  value={
                    result.delivery_fee === null
                      ? "Confirmed by the shop"
                      : formatMoney(result.delivery_fee, result.currency)
                  }
                />
              </div>
              <div className="mt-5 space-y-2">
                <Button asChild className="h-12 w-full">
                  <Link to="/account/orders">See my requests</Link>
                </Button>
                <Button
                  variant="outline"
                  className="h-12 w-full"
                  onClick={() => {
                    reset();
                    onOpenChange(false);
                  }}
                >
                  Keep shopping
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={strong ? "font-semibold" : "text-muted-foreground"}>{label}</span>
      <span className={cn("tnum", strong ? "font-bold" : "font-medium")}>{value}</span>
    </div>
  );
}
