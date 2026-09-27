# RAVQEN

**Every sale. Every stock. Every number.**

RAVQEN is a sales, stock and cash record system built for Kenyan small businesses.
This repository contains **Section 1: the foundation** — brand and design system,
Supabase backend, database schema, security policies, authentication, the shop
workspace shell and honest placeholders for the feature modules (POS, inventory,
debtors, reporting) that build on it.

---

## 1. Architecture

```text
src/
  components/
    brand/          RAVQEN brand primitives (Logo)
    ui/             shadcn/ui primitives, themed via design tokens
    app/            App-shell components (states, dialogs, module pages)
  hooks/            React hooks (useSession, useShops, useActiveShop)
  integrations/
    supabase/       generated Supabase clients + types (do not hand-edit)
  lib/              pure helpers (format, utils)
  routes/           file-based routes (TanStack Router)
    index.tsx                       public landing page
    auth.tsx                        /auth layout (sign-in family)
    auth.login.tsx                  /auth/login
    auth.signup.tsx                 /auth/signup
    auth.forgot-password.tsx        /auth/forgot-password
    auth.reset-password.tsx         /auth/reset-password (recovery token flow)
    _authenticated/                 everything behind a session gate
      route.tsx                     auth gate (redirects to /auth/login)
      dashboard.tsx                 shop list + shop creation
      onboarding.tsx                first-shop setup
      app.tsx                       workspace shell (bottom nav, shop switcher)
      app.pos.tsx                   POS module
      app.inventory.tsx …           remaining modules (honest placeholders)
  services/         data access layer — the ONLY place Supabase queries live
  types/            domain types (portable aliases over generated DB types)
  styles.css        design system: brand tokens, fonts, utilities
supabase/
  migrations/       versioned SQL migrations (source of truth for the schema)
```

**Layering rule:** `routes/components → hooks → services → supabase client`.
Components never call Supabase directly; they call a hook or a service. This keeps
the backend swappable.

**Stack:** React 19, TypeScript, Vite, TanStack Router/Query, Tailwind CSS v4,
Supabase (Postgres, Auth, Storage), Lucide icons, Framer Motion (used sparingly).

---

## 2. Design system

All colour, radius, shadow and font values are tokens in `src/styles.css`.
Components use semantic classes (`bg-primary`, `text-muted-foreground`,
`surface-panel`, `gradient-ink`) — never hardcoded hex or `text-white`.

| Token | Value | Use |
| --- | --- | --- |
| Emerald Ink | `#064E3B` | `--primary`, `--ink` |
| Deep Emerald | `#032F25` | `--ink-deep`, sidebar |
| Soft Emerald | `#0B6B52` | `--ink-soft`, focus ring |
| Champagne | `#F8E7C9` | `--accent`, highlights |
| Warm White | `#FFFCF7` | `--background` |
| Soft Cream | `#F7F2E8` | `--secondary`, `--muted` |
| Charcoal | `#17201D` | `--foreground` |
| Muted | `#68736E` | `--muted-foreground` |

Type: **Fraunces** for headings, **Manrope** for body. Surfaces stay neutral;
emerald and champagne are used as accents, not as page backgrounds.

Mobile-first: 44px+ touch targets, thumb-reachable bottom navigation on `/app`,
safe-area padding for Android gesture bars.

---

## 3. Environment variables

Provided automatically in this workspace (`.env` + `.env.local`). When
self-hosting, create them yourself:

```bash
# Client-visible (safe to ship in the browser bundle)
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable/anon key>
VITE_SUPABASE_PROJECT_ID=<project-ref>

# Server-only (never prefixed with VITE_, never imported by browser code)
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable/anon key>
```

The **service-role key is never used in frontend code** and never committed.
It is only available to server-side code (`src/integrations/supabase/client.server.ts`)
and only for privileged maintenance work.

`SUPABASE_ACCESS_TOKEN` (Supabase management API token) is used only by the CLI
for migrations; it is stored in `.env.local` and never shipped to the browser.

---

## 4. Supabase setup

The database is fully reproducible from the migrations:

1. Create a Supabase project.
2. `supabase link --project-ref <ref>` then `supabase db push`
   (or paste each file in `supabase/migrations/` into the SQL editor, in
   filename order).
3. Enable **Email/password** sign-in under Authentication → Providers.
4. For this project, **email confirmation is switched off**
   (`mailer_autoconfirm: true`), so a new sign-up is signed in immediately.
   The sign-up flow handles both settings: with confirmation off it lands on
   `/dashboard`, with confirmation on it asks the user to confirm by email
   first.

Verify the auth + RLS foundation end to end (sign-up → profile trigger →
login → isolation → cleanup) with `bun scripts/verify-auth-flow.mjs`.

Everything else — tables, enums, constraints, indexes, RLS policies and the
three **private storage buckets** (`shop-logos`, `product-images`,
`expense-receipts`) — is provisioned by the migrations themselves, including
bucket creation via SQL. No dashboard clicks are required.

### Security model

- **Row Level Security is enabled on every table.** Nothing is readable by
  anonymous visitors.
- Roles are exactly **`owner`** and **`employee`** (consolidated from an earlier
  owner/manager/cashier model by `20260927190000_ravqen_role_consolidation.sql`).
- Access is decided by three `SECURITY DEFINER` helpers:
  `is_shop_member(shop_id)`, `has_shop_role(shop_id, roles[])`,
  `is_shop_owner(shop_id)`. Functions avoid recursive policy evaluation on
  `shop_members`.
- Employees get operational access (products, stock, sales, payments, debtors,
  expenses). Only owners can manage team members, access codes, shop settings,
  receipt settings, approve refunds, or delete files in storage.
- Refund creation is gated by `shops.accepts_refunds` **inside the RLS policy**
  — the switch is enforced by the database, not just hidden in the UI.
- Financial history is append-only from the API: `sales`, `payments`,
  `debtor_payments`, `inventory_movements`, `refunds`, `refund_items` have no
  UPDATE/DELETE grants to `authenticated`. Corrections happen via future RPCs.
- Storage objects are keyed `<shop_id>/<filename>`; policies parse the first
  path segment with `storage_shop_id()` and require membership of that shop.
  Delete is owner-only.
- `GRANT`s accompany every table, because Supabase's Data API does not grant
  privileges on `public` by default.
- Triggers: a profile row is created on sign-up; creating a shop auto-enrols the
  owner as a member and seeds default receipt settings; `updated_at` is
  maintained by trigger, not by the client.

---

## 5. Database structure

Every shop-owned table carries `shop_id` and is indexed on it.

| Table | Purpose | Key constraints |
| --- | --- | --- |
| `profiles` | One row per auth user (name, phone, avatar) | PK = auth user id |
| `shops` | The business | unique `slug`, `owner_id`, `location`, `accepts_refunds`, currency default `KES` |
| `shop_members` | Who works in a shop and as what | unique `(shop_id, user_id)`, role enum `owner|employee` |
| `employee_access_codes` | Hashed till/PIN codes for staff | unique `(shop_id, code_hash)`, one active code per member, expiry |
| `categories` | Product grouping | unique `(shop_id, name)` |
| `products` | Catalogue and stock levels | unique `(shop_id, sku)`, `(shop_id, barcode)`, non-negative prices |
| `inventory_movements` | Append-only stock ledger | movement type enum (`stock_in`, `sale`, `refund`, `adjustment`, …), `quantity <> 0` |
| `sales` | Sale headers | unique `(shop_id, receipt_number)`, status enum |
| `sale_items` | Sale lines with cost snapshot | `quantity > 0` |
| `payments` | Money received against a sale | method enum, `amount > 0` |
| `debtors` | Credit customers and balances | unique `(shop_id, phone)`, `total_owed` |
| `debtor_payments` | Repayments against credit | `amount > 0` |
| `expenses` | Shop spending | `amount > 0` |
| `refunds` | Refund requests and approvals | status enum, gated by `accepts_refunds` |
| `refund_items` | Refunded lines, restock flag | `quantity > 0` |
| `receipt_settings` | Per-shop receipt layout | unique `shop_id`, paper width 58/80 mm |

Enums: `shop_role` (`owner`, `employee`), `member_status`, `movement_type`,
`sale_status`, `payment_method`, `refund_status`.

---

## 6. Development setup

```bash
bun install        # or npm install
bun run dev        # starts the app
bun run routes:generate   # regenerate src/routeTree.gen.ts after route changes
bun tsc -b --noEmit       # typecheck
```

Schema changes are made by **adding a new migration file** in
`supabase/migrations/`, never by editing tables by hand. Migration filenames are
timestamp-prefixed and applied in order with `supabase db push`.

---

## 7. Portability (moving hosting platforms later)

The codebase is deliberately arranged so the hosting platform can change:

- **No platform-specific UI code.** Routes, components and styles are plain
  React + Tailwind.
- **All backend access is funnelled through `src/services/*`.** Swapping the
  backend means rewriting those files, not the UI.
- **Generated Supabase code is quarantined** in `src/integrations/supabase/`, and
  domain types in `src/types/ravqen.ts` alias it, so app code never imports
  generated files directly.
- **The schema lives in SQL migrations**, so the database can be recreated on any
  Postgres/Supabase instance.
- **Configuration is environment-variable driven**; no keys are hardcoded.
- **Storage paths are `<shop_id>/<file>`**, portable to any S3-compatible store.

To move: create a new Supabase project (or Postgres + auth provider), run the
migrations, set the environment variables, deploy.
