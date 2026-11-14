# RevenueCat in Pith — implementation notes

Everything below is what this repository actually runs. Prices, product ids and
the offering live in the RevenueCat dashboard; this app reads them and never
hard-codes a product id.

## 1. Package

```bash
bun add @revenuecat/purchases-js     # the repo's package manager
# npm install --save @revenuecat/purchases-js   (equivalent)
```

Installed: `@revenuecat/purchases-js@1.74.0`. Do not add a second lockfile —
the project pins dependencies with `bun.lock`.

## 2. Configuration

The publishable key is public by design (it is not a secret, and it cannot be
used to read another customer's data). It lives in the build environment so a
key rotation does not require a code change:

```bash
# .env
VITE_REVENUECAT_API_KEY=test_…
```

`src/services/billing.service.ts` reads it through `import.meta.env`. With no
key, the billing screen says subscriptions are not switched on rather than
throwing or pretending.

## 3. Identity (the part that matters most)

```ts
// signed-in account wins; anonymous only when there is no account yet
const appUserId = user?.id ?? Purchases.generateRevenueCatAnonymousAppUserId();
const purchases = Purchases.configure({ apiKey, appUserId });
```

- **Account id, not a device id.** Entitlements have to follow the person:
  buying on a phone and opening the till on desktop must show the same plan.
- `Purchases.configure` is a singleton and the web SDK has **no `logIn`**. The
  customer identity is therefore fixed for the life of the page; if the SDK's
  `customerInfo.originalAppUserId` ever disagrees with the signed-in user, the
  service raises `identity_changed` and the screen asks for a reload instead of
  showing somebody else's subscription.
- The anonymous id is RevenueCat's own generator, so it is stable and marked as
  anonymous in the dashboard.

## 4. Entitlements, offerings and products

```ts
export const PRO_ENTITLEMENT_ID = "savo_freebuff_page_pro"; // dashboard identifier

const info = await purchases.getCustomerInfo();
const pro = Boolean(info.entitlements.active[PRO_ENTITLEMENT_ID]);
```

Packages are read from the **current offering** and matched by `packageType`
(`PackageType.Monthly`, `PackageType.Annual`), with the package identifier as a
fallback for custom packages. Nothing in the client names a product id.

All of this is wrapped in `fetchSubscription()` (`src/services/billing.service.ts`)
and exposed by `useSubscription()`; no component talks to the SDK.

## 5. Purchase

```ts
const result = await purchases.purchase({ rcPackage });
// result.customerInfo.entitlements.active[PRO_ENTITLEMENT_ID]
```

`purchasePackage()` maps failures to stable codes the UI can explain:
`cancelled` (no red toast — a decision, not an error), `pending`,
`already_purchased`, `network`, `configuration`, `unknown`.

## 6. Paywall

Web paywalls are supported through the SDK:

```ts
await purchases.presentPaywall({});                 // full-screen overlay
await purchases.presentPaywall({ htmlTarget: el }); // embedded
```

Omitting `offering` uses the current offering. The paywall must exist and be
attached to the offering in the dashboard, or the call shows nothing.

## 7. Customer Center

**Customer Center has no web build** — RevenueCat documents it for iOS and
Android. The web equivalent is the Customer Portal, reached through
`customerInfo.managementURL`, which the billing screen exposes as
"Manage subscription" when it is present. Don't promise Customer Center on web.

## 8. Server-side enforcement (why the webhook exists)

A browser cannot be trusted to say whether an account pays, so paid features
are enforced in Postgres:

- `app.pro_entitlements` — one row per account, written **only** by
  `supabase/functions/revenuecat-webhook` using the service role.
- `app.comped_accounts` — complimentary ("gold") accounts, by email.
- `app.has_pro(uuid)` — the single question enforcement asks (gold **or** an
  active entitlement).
- `public.my_plan()` — what an account may know about itself.

First gated feature: **adding staff accounts** (`create_employee_access_code`).
Existing staff keep their access and regenerating an existing code is not
gated, so nothing strands a shop mid-shift.

### Dashboard setup for the webhook

1. Deploy: `bunx supabase functions deploy revenuecat-webhook --project-ref <ref> --no-verify-jwt`
   (no Supabase JWT: RevenueCat authenticates with its own shared secret).
2. Set the secret, then use the same value in the RevenueCat webhook config:
   `bunx supabase secrets set --project-ref <ref> REVENUECAT_WEBHOOK_SECRET=<random>`
3. RevenueCat → Project settings → Integrations → Webhooks:
   URL `https://<ref>.supabase.co/functions/v1/revenuecat-webhook`,
   Authorization header `Bearer <random>`, send all events.
4. Until the secret is set the function answers **503 and writes nothing** — it
   refuses rather than accepting unauthenticated entitlements.

## 9. Dashboard checklist (not doable from code)

- Products priced **US$7 / month** and **US$80 / year** (monthly + annual).
- An offering containing both packages, marked *current*.
- Entitlement `savo_freebuff_page_pro` attached to both products.
- A Stripe connection for Web Billing (RevenueCat Billing needs a gateway).
- A published paywall attached to the offering, if the paywall button is used.

## 10. What to test before shipping

1. Signed out → billing route redirects to sign-in.
2. Signed in, no purchase → Free, prices render, checkout opens.
3. Cancel the checkout → "Checkout closed. Nothing was charged.", no Pro.
4. Complete a sandbox purchase → Pro active; reload keeps Pro.
5. Gold account → Gold banner, **no buy button**, staff code creation works.
6. Free account → staff code creation refused with the upgrade prompt (the
   database returns `PITH_PRO_REQUIRED`).
