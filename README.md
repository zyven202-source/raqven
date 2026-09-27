# RAVQEN

**Every sale. Every stock. Every number.**

RAVQEN is a sales, stock and cash record system built for Kenyan small businesses.
This repository currently contains **Section 1: the foundation** — brand and design
system, Supabase backend, database schema, security policies, authentication and the
shop shell. Feature modules (POS, inventory, debtors, reporting) build on top of it.

---

## 1. Architecture

```text
src/
  components/
    brand/          RAVQEN brand primitives (Logo)
    ui/             shadcn/ui primitives, themed via design tokens
  hooks/            React hooks (useSession, useShops)
  integrations/
    supabase/       generated Supabase clients + types (do not hand-edit)
  lib/              pure helpers (format, utils)
  routes/           file-based routes (TanStack Router)
    index.tsx               public landing page
    auth.tsx                sign up / sign in
    _authenticated/         everything behind a session gate
      route.tsx             auth gate (redirects to /auth)
      dashboard.tsx         shop list + shop creation
  services/         data access layer — the ONLY place Supabase queries live
  types/            domain types (portable aliases over generated DB types)
  styles.css        design system: brand tokens, fonts, utilities
supabase/
  migrations/       versioned SQL migrations (source of truth for the schema)
```

**Layering rule:** `routes/components → hooks → services → supabase client`.
Components never call Supabase directly; they call a hook or a service. This keeps
the backend swappable.

**Stack:** React 19, TypeScript, Vite 7, TanStack Router/Query, Tailwind CSS v4,
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

---

## 3. Environment variables

Provided automatically by Lovable Cloud in `.env`. When self-hosting, create a
`.env` with:

```bash
# Client-visible (safe to ship in the browser bundle)
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable/anon key>
VITE_SUPABASE_PROJECT_ID=<project-ref>

# Server-only (never prefixed with VITE_, never imported by browser code)
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable/anon key>
```

The **service-role key is never used in frontend code** and never committed. It is
only available to server-side code (`src/integrations/supabase/client.server.ts`)
and only for privileged maintenance work.

---

## 4. Supabase setup

1. Create a Supabase project.
2. Apply everything in `supabase/migrations/` in filename order
   (`supabase db push`, or paste each file into the SQL editor in order).
3. Enable **Email/password** sign-in under Authentication → Providers.
4. Create three **private** storage buckets:
   `shop-logos` (2 MB), `product-images` (5 MB), `expense-receipts` (10 MB).
   Files are stored under `<shop_id>/<filename>`; the storage policies in the
   migrations restrict access to members of that shop.
5. Copy the project URL and publishable key into `.env`.

### Security model

- **Row Level Security is enabled on every table.** Nothing is readable by
  anonymous visitors.
- Access is decided by three `SECURITY DEFINER` helpers:
  `is_shop_member(shop_id)`, `has_shop_role(shop_id, roles[])`,
  `is_shop_owner(shop_id)`. Using functions avoids recursive policy evaluation on
  `shop_members`.
- `GRANT`s accompany every table, because Supabase's Data API does not grant
  privileges on `public` by default.
- Triggers: a profile row is created on sign-up; creating a shop auto-enrols the
  owner as a member and seeds default receipt settings; `updated_at` is maintained
  by trigger, not by the client.

---

## 5. Database structure

Every shop-owned table carries `shop_id` and is indexed on it.

| Table | Purpose | Key constraints |
| --- | --- | --- |
| `profiles` | One row per auth user (name, phone, avatar) | PK = auth user id |
| `shops` | The business | unique `slug`, `owner_id`, currency default `KES` |
| `shop_members` | Who works in a shop and as what | unique `(shop_id, user_id)`, role enum |
| `employee_access_codes` | Hashed till/PIN codes for staff | unique `(shop_id, code_hash)`, expiry |
| `categories` | Product grouping | unique `(shop_id, name)` |
| `products` | Catalogue and stock levels | unique `(shop_id, sku)`, `(shop_id, barcode)`, non-negative prices |
| `inventory_movements` | Append-only stock ledger | movement type enum, `quantity <> 0` |
| `sales` | Sale headers | unique `(shop_id, receipt_number)`, status enum |
| `sale_items` | Sale lines with cost snapshot | `quantity > 0` |
| `payments` | Money received against a sale | method enum, `amount > 0` |
| `debtors` | Credit customers and balances | unique `(shop_id, phone)` |
| `debtor_payments` | Repayments against credit | `amount > 0` |
| `expenses` | Shop spending | `amount > 0` |
| `refunds` | Refund requests and approvals | status enum, `total_amount > 0` |
| `refund_items` | Refunded lines, restock flag | `quantity > 0` |
| `receipt_settings` | Per-shop receipt layout | unique `shop_id`, paper width 58/80 mm |

Enums: `shop_role`, `member_status`, `movement_type`, `sale_status`,
`payment_method`, `refund_status`.

---

## 6. Development setup

```bash
bun install      # or npm install
bun run dev      # starts the app on http://localhost:8080
```

Schema changes are made by **adding a new migration file** in
`supabase/migrations/`, never by editing tables by hand. Migration filenames are
timestamp-prefixed and applied in order.

---

## 7. Portability (moving to Freebuff later)

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
migrations, recreate the three buckets, set the environment variables, deploy.
