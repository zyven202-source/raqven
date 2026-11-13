/**
 * Subscription billing (RevenueCat Web Billing).
 *
 * One module owns the RevenueCat SDK, for the same reason `ai.service.ts` owns
 * the AI function: no component should know a vendor's API, and swapping the
 * store later must not mean editing screens.
 *
 * Three facts about the web SDK shape everything below.
 *
 *   1. `Purchases.configure` is a singleton and the web SDK has no `logIn`.
 *      The customer identity is therefore the signed-in Supabase user id, fixed
 *      for the life of the page. A tab that signs out and in as somebody else
 *      without reloading cannot be re-pointed at the new account, so that case
 *      is detected and reported rather than silently showing the wrong plan.
 *   2. Entitlements are the authority, not a local flag. `savo_freebuff_page_pro`
 *      is the identifier configured in the RevenueCat dashboard; renaming it in
 *      this file would not rename it there, so it is a constant, not a setting.
 *   3. The publishable key is public by design and comes from the build
 *      environment. It is not a secret and it is not a credential for the
 *      backend — RevenueCat verifies entitlement server-side.
 *
 * What this module never does: cache a "pro" boolean in localStorage. A cached
 * entitlement is a paid feature anyone can grant themselves from the console.
 */
import {
  ErrorCode,
  PackageType,
  Purchases,
  PurchasesError,
  type CustomerInfo,
  type Offering,
  type Package,
  type PurchaseResult,
} from "@revenuecat/purchases-js";

import { supabase } from "@/integrations/supabase/client";

/** The entitlement that unlocks Pith Pro. Must match the RevenueCat dashboard. */
export const PRO_ENTITLEMENT_ID = "savo_freebuff_page_pro";

/**
 * The plan people are sold, in US dollars.
 *
 * These are the prices the product advertises. RevenueCat remains the source
 * of what a given checkout will actually charge — the price shown on a package
 * is whatever the store returned — so these constants are copy and arithmetic,
 * never an assumption about the amount on a card.
 */
export const PRO_PLAN = {
  monthlyUsd: 7,
  yearlyUsd: 80,
  /** 12 months of the monthly price, for an honest annual saving. */
  yearlySavingUsd: 7 * 12 - 80,
} as const;

export type BillingErrorCode =
  | "not_configured"
  | "identity_changed"
  | "cancelled"
  | "pending"
  | "already_purchased"
  | "network"
  | "configuration"
  | "unknown";

/** A billing failure the screen can explain in the shopkeeper's language. */
export class BillingError extends Error {
  constructor(
    message: string,
    readonly code: BillingErrorCode,
  ) {
    super(message);
    this.name = "BillingError";
  }
}

export type PackagePeriod = "monthly" | "yearly" | "other";

export type SubscriptionPackage = {
  /** Stable key for lists and analytics. */
  identifier: string;
  title: string;
  description: string | null;
  /** Localised price string from RevenueCat, e.g. "KES 1,200". */
  price: string;
  /** Price in micro-units, for honest comparisons in the UI. */
  priceMicros: number;
  currency: string;
  period: PackagePeriod;
  /** The SDK object `purchase()` needs. Never rendered. */
  rcPackage: Package;
};

export type SubscriptionSummary = {
  /** True only when the entitlement is active right now. */
  entitled: boolean;
  expiresAt: Date | null;
  willRenew: boolean;
  productIdentifier: string | null;
  /** RevenueCat's Customer Portal — the web equivalent of Customer Center. */
  managementUrl: string | null;
  originalAppUserId: string;
  packages: SubscriptionPackage[];
  offeringIdentifier: string | null;
  /** The raw SDK object, for callers that need a field this summary omits. */
  customerInfo: CustomerInfo;
};

function readApiKey(): string {
  const raw = import.meta.env["VITE_REVENUECAT_API_KEY"] as string | undefined;
  return (raw ?? "").trim();
}

/** False in a build that has no key — the screen says so instead of failing. */
export function isBillingConfigured(): boolean {
  return readApiKey().length > 0;
}

/** Which user this module configured the SDK for, so we can spot a switch. */
let configuredFor: string | null = null;

function sdk(appUserId: string): Purchases {
  const apiKey = readApiKey();
  if (!apiKey) {
    throw new BillingError(
      "Subscriptions are not switched on for this build yet. The RevenueCat key is missing.",
      "not_configured",
    );
  }

  if (Purchases.isConfigured()) {
    const existing = Purchases.getSharedInstance();
    if (configuredFor !== null && configuredFor !== appUserId) {
      throw new BillingError(
        "This tab is still linked to a different subscription account. Reload the page to use this one.",
        "identity_changed",
      );
    }
    // After a hot reload `configuredFor` is empty but the SDK is not. Leave it
    // alone; `fetchSubscription` verifies the identity against customer info.
    configuredFor ??= appUserId;
    return existing;
  }

  const purchases = Purchases.configure({ apiKey, appUserId });
  configuredFor = appUserId;
  return purchases;
}

function periodOf(pkg: Package): PackagePeriod {
  if (pkg.packageType === PackageType.Annual) return "yearly";
  if (pkg.packageType === PackageType.Monthly) return "monthly";
  // A custom package can still be an annual one; its identifier is the only
  // hint we have, and guessing a period from a price would be worse.
  if (/year|annual/i.test(pkg.identifier)) return "yearly";
  if (/month/i.test(pkg.identifier)) return "monthly";
  return "other";
}

function toSummaryPackage(pkg: Package): SubscriptionPackage {
  const product = pkg.product;
  const price = product.price;
  return {
    identifier: pkg.identifier,
    title: product.title || product.displayName || pkg.identifier,
    description: product.description,
    price: price.formattedPrice,
    priceMicros: price.amountMicros,
    currency: price.currency,
    period: periodOf(pkg),
    rcPackage: pkg,
  };
}

/**
 * The one read the screen needs: entitlement, renewal facts and the packages
 * on the current offering. Everything comes from RevenueCat on each call —
 * there is no local copy of "is this customer paying".
 */
export async function fetchSubscription(appUserId: string): Promise<SubscriptionSummary> {
  const purchases = sdk(appUserId);

  try {
    const [customerInfo, offerings] = await Promise.all([
      purchases.getCustomerInfo(),
      purchases.getOfferings().catch(() => null),
    ]);

    // The SDK's identity is authoritative: if it disagrees with the signed-in
    // user, showing this plan would show somebody else's subscription.
    if (customerInfo.originalAppUserId !== appUserId) {
      throw new BillingError(
        "This tab is linked to a different subscription account. Reload the page to use this one.",
        "identity_changed",
      );
    }

    const entitlement = customerInfo.entitlements.active[PRO_ENTITLEMENT_ID] ?? null;
    const offering: Offering | null = offerings?.current ?? null;
    const packages = (offering?.availablePackages ?? [])
      .map(toSummaryPackage)
      // Monthly and yearly first, in that order, because those are the two
      // products this app sells; anything else the dashboard adds still shows.
      .sort((a, b) => {
        const rank = (p: PackagePeriod) => (p === "monthly" ? 0 : p === "yearly" ? 1 : 2);
        return rank(a.period) - rank(b.period);
      });

    return {
      entitled: entitlement !== null,
      expiresAt: entitlement?.expirationDate ?? null,
      willRenew: entitlement?.willRenew ?? false,
      productIdentifier: entitlement?.productIdentifier ?? null,
      managementUrl: customerInfo.managementURL,
      originalAppUserId: customerInfo.originalAppUserId,
      packages,
      offeringIdentifier: offering?.identifier ?? null,
      customerInfo,
    };
  } catch (error) {
    throw mapError(error);
  }
}

/** Buy one package. Opens RevenueCat's checkout as a full-screen overlay. */
export async function purchasePackage(
  appUserId: string,
  rcPackage: Package,
  htmlTarget?: HTMLElement,
): Promise<PurchaseResult> {
  const purchases = sdk(appUserId);
  try {
    return await purchases.purchase({
      rcPackage,
      ...(htmlTarget ? { htmlTarget } : {}),
    });
  } catch (error) {
    throw mapError(error);
  }
}

/**
 * Present the RevenueCat-hosted paywall. With no `htmlTarget` the SDK renders
 * a full-screen overlay and runs the whole checkout, returning once the
 * customer is back in the app (or has closed it).
 */
export async function presentPaywall(
  appUserId: string,
  htmlTarget?: HTMLElement,
): Promise<PurchaseResult> {
  const purchases = sdk(appUserId);
  try {
    return await purchases.presentPaywall(htmlTarget ? { htmlTarget } : {});
  } catch (error) {
    throw mapError(error);
  }
}

/**
 * Re-read customer info. On the web there is no "restore purchases" call: the
 * purchase is already tied to the app user id, so refreshing *is* the restore.
 */
export async function refreshSubscription(appUserId: string): Promise<SubscriptionSummary> {
  return fetchSubscription(appUserId);
}

export function isEntitledToPro(customerInfo: CustomerInfo): boolean {
  return Boolean(customerInfo.entitlements.active[PRO_ENTITLEMENT_ID]);
}

/**
 * Is this account on the complimentary ("gold") list?
 *
 * Answered by `public.my_plan()` in Postgres, which compares the caller's own
 * verified JWT email against a table the browser has no grant on. That is the
 * whole point: a gold account is a fact the database holds, not a flag the app
 * decides — so it cannot be granted by editing anything in the client, and it
 * cannot be revoked by clearing storage.
 *
 * A failure here returns `false` rather than throwing. The screen treats false
 * as "not comped", which is the safe direction for a paid feature; the console
 * keeps the reason visible instead of silently paying for nothing.
 */
export async function fetchComplimentaryAccess(): Promise<boolean> {
  /**
   * `my_plan` was added by migration 20261114120000, after the generated
   * Supabase types in `src/integrations/supabase/` were last produced, so the
   * client does not know the name yet. The cast is the narrowest way to call it
   * without regenerating (and churning) the whole types file for one function;
   * regenerate the types and this cast can go.
   */
  const rpc = supabase.rpc as unknown as (
    fn: string,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await rpc("my_plan");
  if (error) {
    console.warn("[billing] Could not read complimentary status:", error.message);
    return false;
  }
  const payload = data as { comped?: boolean } | null;
  return payload?.comped === true;
}

function mapError(error: unknown): BillingError {
  if (error instanceof BillingError) return error;

  if (error instanceof PurchasesError) {
    switch (error.errorCode) {
      case ErrorCode.UserCancelledError:
        return new BillingError("Checkout closed. Nothing was charged.", "cancelled");
      case ErrorCode.PaymentPendingError:
        return new BillingError(
          "The payment is still being confirmed. Your plan will switch on as soon as it clears.",
          "pending",
        );
      case ErrorCode.ProductAlreadyPurchasedError:
        return new BillingError(
          "This account already has an active subscription. Refresh to see it.",
          "already_purchased",
        );
      case ErrorCode.NetworkError:
        return new BillingError(
          "Could not reach the payment service. Check the connection and try again.",
          "network",
        );
      case ErrorCode.ConfigurationError:
      case ErrorCode.InvalidCredentialsError:
      case ErrorCode.InvalidAppUserIdError:
        return new BillingError(
          "Subscriptions are not configured correctly for this build. Nothing was charged.",
          "configuration",
        );
      default:
        return new BillingError(
          error.message || "The payment could not be completed. Nothing was charged.",
          "unknown",
        );
    }
  }

  if (error instanceof Error && error.message) {
    return new BillingError(error.message, "unknown");
  }
  return new BillingError("The payment could not be completed. Nothing was charged.", "unknown");
}
