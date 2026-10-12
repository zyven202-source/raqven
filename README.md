# SAVO

**Every sale. Every stock. Every number.**

> **Implementation report:** [`docs/implementation-report.md`](docs/implementation-report.md)
> — the eleven-point summary of what was audited, fixed, built, and verified, plus
> the two items that need the owner's own hands.

SAVO is a sales, stock and cash record system built for Kenyan small businesses.

**Phase 1 — the foundation:** brand and design system, Supabase backend, database
schema, security policies, authentication and the shop workspace shell.

**Phase 2 — the business engine:** the till, the stock ledger, debtors, expenses,
refunds and receipts, all reading and writing real Supabase rows. The multi-row
financial operations run as PostgreSQL functions so they are atomic, and every
permission is enforced by the database rather than by the interface.

Nothing in this application fakes a result. A button either performs the real
operation or reports honestly why it could not; when a feature is not built, the
screen says so instead of showing invented data.

---

## 1. Architecture

```text
src/
  components/
    brand/          SAVO brand primitives (Logo)
    ui/             shadcn/ui primitives, themed via design tokens
    app/            App-shell components (states, dialogs, module pages)
  hooks/            React hooks — every query key carries the shop id, so
                    switching shops cannot serve the previous shop's rows
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
      app.tsx                       workspace shell (floating nav, shop switcher)
      app.pos.tsx                   till: search, scan, cart, payment, receipt
      app.inventory.tsx             product catalogue and stock actions
      app.stock.tsx                 stock movement ledger
      app.restock.tsx               restocking
      app.transactions.tsx          ledger, sale detail and refunds
      app.debtors.tsx               credit accounts and repayments
      app.expenses.tsx              spending
      app.reports.tsx               owner-only figures
      app.employees.tsx             owner-only team and access codes
      app.settings.tsx              owner-only shop, refund, receipt, privacy and deletion settings
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

| Token            | Value     | Use                          |
| ---------------- | --------- | ---------------------------- |
| Deep Emerald     | `#032F25` | `--ink-deep`, `--background` |
| Luminous Emerald | —         | `--ink-soft`, focus ring     |
| Pale Mint        | —         | `--ink`, `--foreground`      |
| Champagne        | `#F8E7C9` | `--accent`, highlights       |

The palette is **dark emerald end to end**: the page itself is the deep
emerald ground, text is pale mint, and glass surfaces are translucent emerald
with white hairlines. `--ink` and `--ink-soft` keep their names but now carry
luminous values, so `text-ink` and `bg-ink` invert correctly on the dark
ground. The values live as oklch tokens in `src/styles.css`; the hexes here
are anchors only.

Type: **Fraunces** for headings, **Manrope** for body.

### The mark

SAVO's identity is a **drawn symbol** — the Savo mark: one continuous stroke
that sweeps over an upper bowl, through the centre and round a lower bowl,
stroked in champagne on the deep-emerald tile. It is geometry, not typeset
text: two tangent arcs, one ink, recognisable at sixteen pixels.

`src/components/brand/` holds it:

| File               | What it is                                                                              |
| ------------------ | --------------------------------------------------------------------------------------- |
| `mark-geometry.ts` | **The brand data.** The tile's geometry, the brand colours, and the mark's path — the numbers every renderer shares. |
| `AppIcon.tsx`      | The mark tile as an SVG: emerald ground, gloss and rim, the stroke in champagne.         |
| `Logo.tsx`         | Identity: the mark tile by default, tile + wordmark where there is room, a bare champagne mark on dark grounds. |

**Why a symbol.** The mark is a stroked path on the 24-unit grid, so it has no
font dependency: it renders identically in the browser, in headless Chromium,
and inside a receipt file printed from a phone with no network. The same path
serves the 16-pixel favicon and the 512-pixel store icon without a second
drawing, and it holds up in one ink, in monochrome, on light or dark ground.

**One composition, every placement.** The mark tile appears as: the splash and
sign-in screens (`Logo` with the wordmark), the navigation and dashboard header
(`Logo compact`), the receipt header (the same path inlined into the printable
file so it prints from a phone with no network), the empty, error and loading
states, and the favicon and app icon.

### The app icon and favicon

The raster files in `public/` are rendered from the same composition the React
`AppIcon` draws: the emerald tile with its gloss and rim, the stroke of the
Savo mark in champagne. `scripts/generate-icons.mjs` launches headless
Chromium and screenshots the SVG per size — there is no font to wait for,
because the mark is a path — with PNG frames wrapped into `favicon.ico`.
There is no image library and no geometry pipeline to drift: every renderer
imports the same `mark-geometry.ts`.

`verify-app-icon.mjs` decodes the served files through Chromium's own PNG
decoder and asserts what must be true of any honest rendering: rounded corners
are transparent, the mark is a substantial champagne population centred in a
dark-emerald tile, it reads taller than wide, and the 16px favicon frame still
holds real mark pixels. The browser acceptance suite (`verify-ui-acceptance`)
repeats the measurements against the bytes the server actually serves, so the
verified file and the shipped file cannot be different files.

### The PWA layer

SAVO is an installable, **online-first** app. The network is always the
first answer — every navigation, asset, font and icon is fetched fresh when
the network is up — and the cache exists only as a failure fallback, so a
customer's till shows what the server says right now, never a page it served
last week.

- **`public/sw.js`** — the service worker, plain JavaScript on purpose: it
  ships verbatim from `public/`, never transpiled, reviewable by anyone who
  wants to know what runs on their phone. There is no install-time precache:
  the cache starts empty and only ever holds a response the network itself
  returned. Everything is network-first with cache-on-failure — navigations
  (which also refresh the cached shell, HTML documents only), hashed assets,
  fonts in their own bucket, same-origin miscellany in the runtime bucket.
  Two lines it will not cross: **Supabase responses are never served from
  cache and never stored** — a number that cannot tell "old" from "wrong" has
  no place in a ledger — and only an HTML navigation may replace the cached
  shell (a `robots.txt` navigation stored as `/index.html` would clobber it).
- **Registration** is production-only (`useServiceWorker`): a worker on the
  dev server is pure HMR friction, and no shop ever runs the dev server. An
  update never swaps itself in underneath a half-entered sale — a waiting
  worker raises a banner and the owner applies it. The same hook probe-checks
  connectivity: the browser's online/offline signals only ever trigger a real
  HEAD request to the app's own origin, and the offline state is what that
  request says, because the browser's word alone has been caught pinning a
  false "Offline" tag over a working till.
- **`ConnectivityBar.tsx`** — the offline banner (rendered only while the
  offline state is probe-confirmed — a real request to the app's own origin
  has failed — saying plainly that some things won't load until the network
  returns) and the update banner.
- **`manifest.webmanifest`** — id, standalone display, portrait orientation,
  `#032F25` theme, 192/512 icons plus a maskable entry.

`scripts/verify-pwa.mjs` proves the behaviour rather than the files: the
worker activates and controls the page with no precache, the cached shell
matches the bytes the server serves now (network-first, not a stale copy),
assets/fonts/runtime files cache from successful network responses, an
offline navigation still renders the shell (the fallback path), the offline
banner is probe-confirmed — absent on a healthy network, present under a real
offline probe, cleared the moment it answers — the only cross-origin
responses in any cache are Google Fonts, and the manifest meets
Chrome's installability criteria.

### The glass material, in three levels

Three levels, not one effect everywhere. The point is hierarchy: a screen can
say "this is a surface", "this is a control" and "this is temporary" without
anything having to shout.

| Level     | Used for                                    | Opacity | Blur |
| --------- | ------------------------------------------- | ------- | ---- |
| `glass-1` | main cards, panels, modals, sheets          | 0.72    | 40px |
| `glass-2` | fields, filters, small cards, nested groups | 0.50    | 12px |
| `glass-3` | popovers, menus, tooltips, temporary UI     | 0.88    | 40px |

Level 3 being the _most_ opaque is deliberate and slightly counter-intuitive:
opacity is a legibility tool here, not a status symbol. A menu that is hard to
read is worse than no menu, and detachment comes from the deeper shadow.

Depth comes from a hairline, a contact shadow and a wide diffuse shadow
together — `--depth-1/2/3`, every offset negative so the shadow stays tight to
the object. One big drop-shadow reads as a sticker and muddies the text on a
translucent surface. The dark theme overrides all three with genuinely black,
stronger shadows, because the light theme's deep-teal shadows are nearly
invisible on a dark surface.

**Readability beats the glass, and that is enforced.** `verify-glass-ui.mjs`
composites every translucent background from the page up to each text node and
fails the run if anything falls below WCAG AA.

### The interaction system

`press` and `hover-glass`, on every control:

- **Hover** brightens the surface, steps the border up, lifts it 1px and scales
  1.004. Gated on `@media (hover: hover) and (pointer: fine)`, so a phone never
  gets a stuck hover state — a touch device reports `hover` for the tap that is
  already over the element.
- **Press** scales 0.985 and dims very slightly, because a pane of glass under a
  thumb both shrinks and loses the light it was catching. Dimming alone reads as
  a colour change; dimming with a scale reads as pressure.
- **Focus** is a 2px ring at 2px offset — clear, and not a glow.

All of it is 90–180ms, so the interface never feels slow because of animation.

### Two traps worth recording

1. **A raw `backdrop-filter` in a hand-written `@utility` loses its unprefixed
   half to the production CSS minifier**, which silently disables the glass in
   exactly the browser it was written for. The level utilities therefore supply
   only the surface; the blur always comes from Tailwind's own `backdrop-blur-*`
   at the call site. `verify-glass.mjs` fails the build if a level is ever used
   without one.
2. **`oklch()` is not RGB.** Reading its numbers out of a computed style gives
   `rgb(1, 0, 0)` — a near-black — and invents a contrast failure for every text
   node on the page. The readability check paints each colour on a canvas and
   reads the pixel back, letting the browser do the conversion.

Mobile-first: 44px+ touch targets, thumb-reachable navigation on `/app`,
safe-area padding for Android gesture bars.

### The floating navigation

The workspace navigation is the one surface in the product that is translucent.
It is a pill of glass that hovers just above the bottom edge of the screen: a
tinted, blurred, hairline-ruled slab that the shop keeps scrolling _underneath_,
so you can still read a number through it. The tokens are `glass-bar`,
`glass-sheet`, `glass-tile`, `glass-header` and `glass-sunk` in `styles.css`,
alongside `--glass*` and two new radii, `--radius-glass` and `--radius-glass-lg`.

Those two radii are the single deliberate exception to the 12px ceiling. A
floating object has to read as a separate physical layer, and a 12px pill on a
translucent surface reads as a bar rather than as something hovering over the
page. Containers are unchanged.

One blur caveat is worth recording, because it is not obvious. Declaring
`backdrop-filter` inside a hand-written `@utility` loses its unprefixed half in
the production CSS minifier, which silently disables the glass in exactly the
browser it was written for. The blur is therefore applied with Tailwind's own
`backdrop-blur-*` utilities at the call site, which survive minification. The
acceptance script asserts the computed `backdrop-filter` in a real browser so
this cannot regress unnoticed.

**What it shows.** Owner: Dashboard, POS, Inventory, Expenses, More. Staff: POS,
Inventory, Expenses, More. The navigation is role-aware, and every entry in a
staff More sheet is something the database already permits at the counter — the
owner-only destinations are absent rather than merely disabled. Expenses earned
a permanent tab because recording what the shop spent is a daily job, and only
the Dashboard is owner-only, because it reads figures `shop_report` refuses to
serve to staff.

**More** is a glass drawer, not a dropdown: grouped sections, 56px rows, real
icons, and dismissal by outside tap, swipe-down, or Escape. On a wide window the
pill becomes a compact rail in the left margin — same destinations, deliberately
not the same shape, because stretching five tabs across a desktop window makes
each target a stretch of empty glass.

**The active destination** gets a travelling `glass-tile` on a shared
`layoutId`, so the highlight _slides_ between tabs instead of blinking on and
off. That tile is genuinely raised — a contact shadow plus an inset highlight,
not one large drop, because it travels across a blurred surface and a big soft
shadow behind a moving object looks like it is dragging. On top of it: the icon
scales and lifts by a degree, the label steps from muted to ink, and a small dot
appears above it. One spring constant for all of it, so nothing moves at its own
pace, and all of it disabled under `prefers-reduced-motion`.

**The More sheet assembles rather than appearing.** Every heading and every row
takes the next number in a sequence, so the list is walked in the order it is
meant to be read: 40ms of base delay, 16ms between rows, 180ms to land. The
numbers are set so the last of ten rows has settled inside 350ms — a stagger
that runs longer stops reading as an entrance and starts reading as a delay, and
a shopkeeper on a bad connection cannot wait for an animation before the list is
usable. Closing is quick and unstaggered, because the drawer is already sliding
away underneath it.

One trap here is worth recording, because it produces a sheet that looks correct
and animates not at all. The drawer mounts its content at the moment it opens, so
a framer-motion element with `initial={false}` is handed its final value on mount
and the entrance never plays — every row simply appears, which is the one outcome
the stagger exists to avoid. `initial` has to be the hidden state, not `false`.

**Hover** is the same system as everywhere else: `press` for the thumb,
`hover-glass` for the pointer, and a `hover:bg-*` tint. Tailwind v4 compiles
`hover:` inside `@media (hover: hover)`, so a phone never gets a row stuck in a
hover state after a tap.

The bar floats, so it cannot push the page down and cannot reserve its own
space. Two things reserve it instead, both from the same tokens:

- `PageContainer` adds the clearance as bottom padding, which is what keeps the
  last row of a screen off the bar.
- The till's own basket bar is pinned to the bottom, so it is offset by
  `var(--glass-bar-clearance)` — the same number the bar was built from, rather
  than a hardcoded guess that silently drifts the moment the bar's height or the
  device's safe-area inset changes.

`verify-float-bar.mjs` exists for exactly this reason. "The bar never covers the
content" is a claim that is easy to make and easy to get wrong, so the script
measures the real geometry on a Pixel-class phone: the computed blur and radius,
the last row of every screen against the top of the bar at full scroll, and any
element pinned to the bottom that would slide underneath it.

It now also measures the parts that are easy to claim and harder to check — 54
checks in total. The active tab: that exactly one destination is current, that
its highlight exists, is raised, stays inside its own tab rather than ballooning
out from it, is a pale tint rather than a colour slab, and shows its indicator.
The More sheet: that it is glass and blurred, has 34px top corners and a hairline
edge, offers all eight owner destinations, and keeps every row at 44px or more.
Dismissal: outside tap, Escape and a real swipe-down drag. Hover: opened in a
second, desktop-pointer context, because a phone that reports `hover` reports it
for the tap already over the element and cannot see this state at all.

The staggered entrance is measured rather than asserted, and the measurement is
fiddly in a way that is worth spelling out. The recorder has to start at the same
moment the entrance does, so it is installed **and the sheet is opened from
inside the page** — driving the click from Node puts a protocol round trip in
between, and on a loaded machine that is long enough to miss the entire
animation. It then samples the first and last row's opacity every frame and
fails unless the first genuinely led the last. That check is what caught the
`initial={false}` bug above.

### Exporting a report

The Reports page has one **Export CSV** button, in its header. It writes the
whole period as one file: who the shop is, what period, the summary figures, the
products that sold, and every transaction behind them. A header and a footer are
there because a file named `report.csv` that turns up in a message three weeks
later is a rumour rather than a record.

**The figures are not recomputed.** They come from `shop_report`, the same
PostgreSQL function the screen reads, so an export cannot disagree with the
screen or with the database. The transactions come from the ledger read model
the other screens use, re-checked by RLS under the same session.

The file is built by `src/lib/csv.ts`, hand-written rather than pulled from a
package, because the format is four rules long and the part that is easy to get
wrong is the one that corrupts a shop's books silently instead of throwing:

- **Quoting.** A comma, a quote, a newline or an edge space forces a quoted
  field, and a quote inside it is doubled. `Maziwa, 500ml` is the ordinary case.
- **Numbers are numbers.** Two decimal places, no thousands separator, no
  currency symbol. `1,250.00` is two columns to a spreadsheet, and the second
  one swallows whatever was meant to follow.
- **Formulas are defused.** A cell starting `=`, `+`, `-` or `@` is a formula to
  Excel and LibreOffice. A customer who types that into a name field should not
  get a formula on the owner's machine, so those cells get an apostrophe first.
  Text only — the numbers above must stay numbers.
- **BOM and CRLF.** Without the byte-order mark, Excel on Windows reads the file
  as the local code page and mangles every non-ASCII character in it. A product
  called `Maziwa Soda` is enough.

The sign lives in the column, not in the number: a spreadsheet can total a "Money
in" column, and a column of signed values where half are negative is a trap for
whoever opens the file next. Stock movements carry a quantity and leave both money
columns empty rather than pretending to be money. Dates are **formatted, not
sliced** — `occurredAt` arrives as UTC and Nairobi is three hours ahead of it, so
slicing would file every evening sale under the following morning.

`verify-csv.mjs` (32 checks) runs the writer's output through an
independently-written RFC 4180 parser, and fails on any field that does not
survive the round trip, any number a spreadsheet could not total, and any formula
that got through. The acceptance suite downloads the real file from the
deployed site and makes the same assertions against a shop that has actually
traded.

**The button carries every state the system defines.** Idle is a download icon
and a plain label; working swaps the icon for a spinner and the label for
"Preparing…"; success becomes a tick and "Saved"; failure becomes a warning, the
label says "Not saved", and the reason goes to a notice. It is `variant="outline"`
— glass level 2, one step below the level 1 cards it sits on — because an export
is something an owner does occasionally, and a full-strength action would
outrank the figures it is exporting. It is never disabled for being empty: a
period with no sales still produces a valid report, because the figures are real,
they are zero, and a greyed-out button with no explanation is worse than a file
that honestly says nothing happened.

### Being found, and being readable

`src/lib/seo.ts` is the one place the product describes itself to a machine. The
`<title>`, the meta description, the Open Graph tags, the structured data and the
home page's `<h1>` are five statements of the same fact, and written five times
they drift apart invisibly. So the wording lives in that module once, and
`verify-seo.mjs` imports it and measures it rather than restating it.

The core term is **Kenyan shop POS**, and it appears in the title, the
description and the one `<h1>`:

| Tag                  | Value                                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<title>` (53 chars) | `SAVO — Kenyan Shop POS with Stock, Debtors & M-Pesa`                                                                                               |
| description (147)    | `Kenyan shop POS and stock book in one: record sales, take M-Pesa, track stock, chase debtors and log expenses from an Android phone at the counter.` |
| `<h1>`               | `The Kenyan shop POS that keeps every sale, stock, and number.`                                                                                       |

Both lengths are inside a search result: past ~60 characters the title is cut and
past ~150 the description is, and neither truncation announces itself. Open Graph
carries `og:title`, `og:description`, `og:type`, `og:url`, `og:site_name`,
`og:locale`, and a square `og:image` (`icon-512.png`, with width, height and alt),
plus the Twitter equivalents. `twitter:card` is `summary` rather than
`summary_large_image` on purpose: the only image the product has is square, and a
square stretched into a 1.91:1 card is a slice of the mark.

**The structured data is a `WebApplication`**, emitted through the router's own
head mechanism:

```json
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "SAVO",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Android, iOS, Web browser",
  "areaServed": { "@type": "Country", "name": "Kenya" },
  "featureList": ["…seven real screens…"]
}
```

`aggregateRating`, `review` and `offers` are **deliberately absent**. This product
has no published ratings and no billing integration, and the only truthful price
to put in structured data is none at all — an invented rating is both dishonest
and something Google acts on.

**Two traps, both recorded in the code.** Structured data cannot be a `<script>`
tag written inside the landing component: this app prerenders a static shell
containing the `head()` descriptors but _not_ the route's rendered markup, so a
tag in the component would only exist after JavaScript ran. It goes in
`head().scripts` — and it has to arrive as a string `children`, not a
`dangerouslySetInnerHTML` attribute, because a src-less head script is rendered
only when `children` is a string. The attribute form is dropped in silence: no
tag in the HTML, no error anywhere, structured data simply not there.

**Every image carries descriptive `alt` text.** The app renders eight `<img>`
elements — five through `StorageImage` (shop logos on the dashboard, shop cards,
the settings field and the shop picker; product photos in the inventory list and
the product form) and the receipt's logo. All of them were `alt=""`, which is
invisible to the browser and invisible to the type checker, because `alt` is an
optional string either way. `StorageImage`'s prop is now documented as the thing
that must name the image in the shopkeeper's own words, and each call site
composes it from data it already has — `"Maziwa 500ml — product photo"`, `"Duka
Kuu logo"`, `${status} logo` on the printed receipt. Only the loading placeholder
is `aria-hidden`, because it is the one thing on screen that is not the image.

**Heading order is the page read aloud.** One `<h1>` per page, carrying the
keyword; `<h2>` for each section; `<h3>` for every card and step inside one. The
landing page has four sections — hero, _A day at the counter_, _Numbers you can
defend_, and a closing call to action — and the `verify-ui-acceptance` run fails
if a heading level is ever skipped.

`verify-seo.mjs` runs **69 checks** across the strings, the descriptors, the
schema, the files those tags point at, and every `<img>` in `src/`. The browser
half — that the tags actually reach the painted page, that the outline holds, and
that the page hydrates without a React error — lives in the acceptance run,
because it needs a real DOM.

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
- Refund creation is gated by `shops.accepts_refunds` **inside the RLS policy and
  inside the refund function** — the switch is enforced by the database, not just
  hidden in the UI.
- Multi-row operations are PostgreSQL functions, so they cannot half-happen:
  - `create_sale(...)` — `SECURITY INVOKER`. Locks each product row, validates
    stock, prices the lines, allocates the receipt number, writes `sales`,
    `sale_items`, `payments`, `inventory_movements` and the debtor balance in one
    transaction. RLS applies to every row it writes.
  - `record_debtor_payment(...)`, `create_refund(...)`, `record_stock_movement(...)`,
    `next_receipt_number(...)`, `create_employee_access_code(...)` — `SECURITY
DEFINER`, because they must touch rows clients are deliberately not granted
    (`sales`, `receipt_counters`). Each one re-checks membership or ownership
    itself and takes the acting user from `auth.uid()`, never from an argument.
  - `shop_report(...)` — `SECURITY DEFINER` with an owner check inside, so
    sensitive owner figures are refused by the database for employees.
  - `shop_member_directory(...)` — returns only the people in a shop the caller
    already belongs to, which is what lets the ledger name who did what.
- `receipt_counters` has RLS on with **no policies and no grants**: receipt
  numbers are gap-free and race-free but unreachable from the client.
- **Staff join with a code, never an account id.** The owner mints a six-digit
  code; the staff member signs up, picks "I work in a shop" and types it.
  `redeem_employee_access_code(text)` is `SECURITY DEFINER` and takes **only the
  code** — there is no `shop_id` or `role` argument to forge, and the role is
  hardcoded to `employee` inside the function. It resolves the shop in the
  database, so the code decides the shop rather than the person choosing it.
- Only a **salted** digest is stored, using a per-shop salt kept in
  `shop_access_secrets`, so a digest cannot be replayed against another shop.
- Redemption is **throttled** to 10 failures per user per hour and every attempt
  — successful or not — is recorded in `access_code_attempts`.
- **A code must identify exactly one shop.** Because each shop salts its own
  digest, the same six digits can be live in two shops at once. Redemption counts
  the matching shops and **refuses an ambiguous code** rather than resolving it
  arbitrarily, which would enrol a staff member into the wrong shop.
  `access_code_is_ambiguous(text)` exposes that check so the owner UI can avoid
  minting a colliding code in the first place.
- `products.quantity` has a `CHECK (quantity >= 0)`, and `is_low_stock` is a
  generated column, so neither can drift from the stock ledger.
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

| Table                   | Purpose                                 | Key constraints                                                                                                                                    |
| ----------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`              | One row per auth user (name, phone)     | PK = auth user id                                                                                                                                  |
| `shops`                 | The business                            | unique `slug`, `owner_id`, `location`, `accepts_refunds`, currency default `KES`                                                                   |
| `shop_members`          | Who works in a shop and as what         | unique `(shop_id, user_id)`, role enum `owner                                                                                                      | employee` |
| `employee_access_codes` | Hashed till/PIN codes for staff         | unique `(shop_id, code_hash)`, one active code per member, expiry                                                                                  |
| `shop_access_secrets`   | Per-shop salt for access codes          | RLS on, **zero policies and no grants** — unreachable from any client                                                                              |
| `access_code_attempts`  | Redeem attempts, for throttling         | RLS on, no policies; only the SECURITY DEFINER functions write to it                                                                               |
| `categories`            | Product grouping                        | unique `(shop_id, name)`                                                                                                                           |
| `products`              | Catalogue and stock levels              | unique `(shop_id, sku)`, `(shop_id, barcode)`, non-negative prices                                                                                 |
| `inventory_movements`   | Append-only stock ledger                | movement type enum (`stock_in`, `sale`, `refund`, `adjustment`, …), `quantity <> 0`                                                                |
| `sales`                 | Sale headers                            | unique `(shop_id, receipt_number)`, status enum                                                                                                    |
| `sale_items`            | Sale lines with cost snapshot           | `quantity > 0`                                                                                                                                     |
| `payments`              | Money received against a sale           | method enum, `amount > 0`                                                                                                                          |
| `debtors`               | Credit customers and balances           | unique `(shop_id, phone)`, `total_owed`                                                                                                            |
| `debtor_payments`       | Repayments against credit               | `amount > 0`                                                                                                                                       |
| `expenses`              | Shop spending                           | `amount > 0`                                                                                                                                       |
| `refunds`               | Refund requests and approvals           | status enum, gated by `accepts_refunds`                                                                                                            |
| `refund_items`          | Refunded lines, restock flag            | `quantity > 0`                                                                                                                                     |
| `receipt_settings`      | Per-shop receipt layout                 | unique `shop_id`, paper width 58/80 mm                                                                                                             |
| `receipt_counters`      | Next receipt number per shop            | no client access at all; used only by `next_receipt_number`                                                                                        |
| `audit_log`             | Append-only record of sensitive actions | **no write policy at all** — only SECURITY DEFINER triggers insert; see below                                                                      |
| `consent_records`       | What a user agreed to, and when         | not a FK to `auth.users`, so the evidence outlives the account                                                                                     |
| `data_requests`         | Access / correction / deletion requests | own row per request, `user_id = auth.uid()`, `shop_id` is SET NULL on shop deletion                                                                |
| `shop_deletions`        | Tombstone for a shop its owner deleted  | **no FK to `shops` on purpose**; RLS on, zero policies and no grants — the record has to outlive the deletion, and no client may read or forge one |

Enums: `shop_role` (`owner`, `employee`), `member_status`, `movement_type`,
`sale_status`, `payment_method`, `refund_status`.

### The audit log is not writable from a client

`audit_log` has one policy, and it is a `SELECT` policy. There is deliberately
no `INSERT`, `UPDATE` or `DELETE` policy for `authenticated`, so a signed-in user
— including the shop owner — has no database-level permission to forge, edit or
erase an entry. Rows are written by seven `SECURITY DEFINER` trigger functions
on `sales`, `refunds`, `inventory_movements`, `expenses`, `shop_members`,
`employee_access_codes` and `shops`, which run as the table owner.

The same reason governs what goes _into_ a row. `summary` is built from columns
the schema already holds, `metadata` is restricted to a whitelist of
non-identifying keys with `name`, `phone`, `email` and `notes` stripped at write
time, and a sale records that a customer name _was_ captured rather than the
name itself. An audit trail that quietly became a second copy of the customer
database would defeat the point of having one.

### Deleting a shop

Every shop-scoped table in the schema cascades from `shops`. One row out means the
shop's entire financial history goes with it: sales, their lines and payments,
refunds and refund lines, debtors and what they have paid, products, stock
movements, expenses, receipt settings and counters, staff memberships, and the
activity log. There is no soft delete in this schema and there is not going to be
one — a "deleted" shop whose ledger is still readable is not deleted, it is just
hidden. So the one operation that destroys accounting records is also the one that
is guarded hardest.

`delete_shop(p_shop_id, p_confirm_shop_name)` is `SECURITY DEFINER` and checks
three things in the database, in this order, before a row goes:

1. **The caller is signed in** — otherwise `auth.uid()` is null and nothing else
   is attempted.
2. **`shops.owner_id = auth.uid()`.** It reads that column rather than a membership
   row, so a staff member carrying the `owner` role still cannot delete the shop,
   and an owner demoted by hand still can.
3. **The name typed back matches the name held**, case-insensitively and ignoring
   surrounding space. A client bug, a stale confirm dialog or a crafted request
   cannot satisfy it by accident, and the comparison happens against a row locked
   `FOR UPDATE`, so a rename between the check and the delete cannot delete a shop
   nobody confirmed.

The companion `shop_deletion_preview(p_shop_id)` is owner-only too, before
anything is counted — an employee cannot use it to read a shop's ledger size — and
returns fourteen real row counts so the app can show what would be lost instead of
the word "permanent".

**What survives.** The owner's account: `shops.owner_id → auth.users` is ON DELETE
RESTRICT and nothing here deletes from `auth.users`, so the owner stays signed in
and can open another shop immediately. A staff member loses the membership and
keeps their account. `data_requests` rows survive with `shop_id` set to null, and
the screen says so rather than letting an owner assume everything vanished.

**The tombstone.** `audit_log.shop_id` cascades, so an audit entry written for a
shop being deleted is deleted with it — useless as evidence for the one action
where evidence matters most. So `delete_shop` writes a row into `shop_deletions`,
a table with **no foreign key to `shops`**, holding the shop's own name, how many
of each kind of record it held, and who deleted it. No customer data goes in it.
It is not readable by any client: an owner must not be able to enumerate what other
shops have been deleted, and a client that could write it could forge one.

`verify-shop-deletion.mjs` drives all of this from real signed-in clients — an
employee, a stranger, an anonymous caller and the owner — and then inspects the
aftermath with project-owner SQL rather than trusting the database it is testing.

---

## 6. Development setup

```bash
bun install        # or npm install
bun run dev        # starts the app
bun run build      # produces the deployable static site in dist/
bun run routes:generate   # regenerate src/routeTree.gen.ts after route changes
bun tsc -b --noEmit       # typecheck
```

### Verifying against real data

```bash
bun scripts/verify-auth-flow.mjs        # sign-up, profile trigger, login, RLS
bun scripts/verify-business-engine.mjs  # the whole trading flow, end to end
bun scripts/verify-staff-access.mjs     # access codes, joining, and staff limits
bun scripts/verify-shop-deletion.mjs    # owner shop deletion: guards, cascade, tombstone
bun scripts/verify-ui-acceptance.mjs    # the same flow, driven through the real UI
bun scripts/verify-float-bar.mjs        # the floating bar's real geometry
bun scripts/verify-glass.mjs            # the glass system's shape, statically
bun scripts/verify-glass-ui.mjs         # the glass in a browser, and its contrast
bun scripts/verify-contrast.mjs         # WCAG AA on rendered pixels, every screen
bun scripts/verify-app-icon.mjs         # the R-tile icons, decoded and measured
bun scripts/verify-csv.mjs              # the CSV writer, read back through a real parser
bun scripts/verify-seo.mjs              # title, description, Open Graph, JSON-LD, alt text
bun scripts/cleanup-test-shops.mjs      # remove the shops those runs created (--delete)
```

`verify-staff-access.mjs` covers the code-based staff join specifically: a wrong
code is refused, a valid one enrols the right shop, a code shared by two shops is
refused rather than guessed, a closed shop refuses new staff, a suspended member
cannot rejoin through the code, regenerating retires the old code immediately, and
an employee can neither read another shop's rows nor write into it, nor read the
shop's report, its access codes, or its team.

`verify-shop-deletion.mjs` covers the one operation that destroys records: an
employee, a stranger and an anonymous caller are each refused, the owner is
refused until the shop's own name is typed back, the preview reports the rows that
are really there, and after a successful deletion every child row is gone — sales,
lines, payments, refunds, refund lines, debtors, debtor payments, products, stock
movements, memberships and the activity log — while the owner's account, the staff
member's account and a tombstone holding the shop's name and its counts all
survive.

`cleanup-test-shops.mjs` exists because these scripts build _real_ shops with
real rows — the only honest way to test them. A shop outlives the throwaway user
that made it, so without cleanup the shop list fills with `Duka 1790577371030`
entries, which is precisely the demo-data look this project is trying to avoid.
It only deletes shops matching the names those scripts create, and is a dry run
unless given `--delete`.

The business-engine script creates two throwaway shops and walks the real
acceptance path through the public API — opening stock, a cash sale, a credit
sale, a partial repayment, a refund, then proves shop A can neither read nor
write shop B's data and that an employee is refused owner-only operations. It
cleans up after itself and exits non-zero on any failure.

The UI acceptance script proves the _screens_ are wired to that engine rather
than merely rendering: it drives the deployed app in Chromium (Pixel-class
viewport, touch enabled) through sign-up → shop setup → product → cash sale →
receipt → credit sale → debtor → partial repayment → expense → refund, checking
the stock, ledger and balances that appear on screen, then repeats the read
half in a second shop to confirm nothing leaks across.

**It also checks that the app icon it is served is the app icon that was
verified** — by reading the pixels rather than trusting the file name. That
assertion found a real problem: it had been sampling three fixed points in the
icon and describing the _previous_ drawing, so when the icon changed it kept
reporting confident numbers about whatever had moved underneath those points. It
now knows no coordinates at all. It finds the artwork's bounding box from the
pixels and asserts its shape — inside the tile with a margin, taller than wide, a
broad flat top edge, a run of bare tile with artwork on both sides, and a turned
corner that is a minority of the ink. Finding the box takes two passes, because
one threshold cannot do it: the tile's gloss reaches a blue channel of 193 while
the artwork's dimmest pixels sit at 155, so a coarse pass locates the artwork and
a fine pass measures it inside that box.

It needs Playwright's Chromium; it is deliberately **not** a dependency of the
app, so install it separately rather than adding it to `package.json`:

```bash
bun add --cwd /tmp/pwtest playwright   # or: npx playwright install chromium
CHROMIUM_PATH=~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome \
  bun scripts/verify-ui-acceptance.mjs https://ravqen.freebuff.app
```

Keeping Playwright out of `package.json` matters: the hosting builder runs a
clean `bun install`, and Playwright resolving its browser binaries there is
what pushed earlier deploys past their build deadline.

### Why nothing hangs any more

Two bugs used to leave screens spinning forever, and both are worth naming
because the fix is not obvious:

1. **Unstable query keys.** `useShopReport` is keyed on its date range. Building
   that range with a bare `new Date()` in a component body produces a _new_ key
   on every render, so React Query cancels the in-flight request and starts it
   again, endlessly — the report never finished loading and the stall timer
   eventually reported a failure that never actually happened. `useTodayWindow`
   in `src/hooks/useReportingWindow.ts` returns a "now" that only advances once
   a minute, so the key is stable within a tick and the query settles.
2. **A selection that could never be made.** `ActiveShopProvider` only fell back
   to another shop when the stored id _no longer_ matched. A staff member who had
   just redeemed an access code — or any first-time user — had no stored id at
   all, so no shop was ever selected and they sat on "Select a shop to continue…"
   forever. It now adopts the first membership when nothing is selected yet, and
   the guard redirects to the hub when there is genuinely nothing to open.

Beyond those, every asynchronous screen is built from `LoadingState`,
`ErrorState`, `EmptyState` and `NoticeState` in `src/components/app/AppChrome.tsx`.
`LoadingState` carries a stall timer: after 12 seconds it stops pretending to be
patient and offers a retry, so no screen can sit on "Loading…" indefinitely.

Schema changes are made by **adding a new migration file** in
`supabase/migrations/`, never by editing tables by hand. Migration filenames are
timestamp-prefixed and applied in order with `supabase db push`.

### Build output

The app is deployed as a **static single-page app**. `bun run build` prerenders
the app shell to `dist/index.html` alongside `dist/assets/`, so any static host
can serve it, and deep links such as `/dashboard` or `/app/pos` are resolved by
the client router. There is no Node server at runtime: every query goes straight
from the browser to Supabase over the publishable key, and row level security is
what actually protects the data.

For that reason the Vite config sets `nitro: false` (no server bundle is emitted;
`dist/server` is removed after the build) and turns on TanStack Start's
`spa` mode with the shell written to `dist/index.html`. The build only reads the
`VITE_SUPABASE_*` variables, so those must be set in the environment that runs
the build — a stale Supabase project URL would otherwise be baked into the
shipped bundle.

---

## 7. Portability (moving hosting platforms later)

The codebase is deliberately arranged so the hosting platform can change:

- **No platform-specific UI code.** Routes, components and styles are plain
  React + Tailwind.
- **All backend access is funnelled through `src/services/*`.** Swapping the
  backend means rewriting those files, not the UI.
- **Generated Supabase code is quarantined** in `src/integrations/supabase/`, and
  domain types in `src/types/savo.ts` alias it, so app code never imports
  generated files directly.
- **The schema lives in SQL migrations**, so the database can be recreated on any
  Postgres/Supabase instance.
- **Configuration is environment-variable driven**; no keys are hardcoded.
- **Storage paths are `<shop_id>/<file>`**, portable to any S3-compatible store.

To move: create a new Supabase project (or Postgres + auth provider), run the
migrations, set the environment variables, deploy.
