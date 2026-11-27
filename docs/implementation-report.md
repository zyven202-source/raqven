# SAVO — Implementation report

Thirteen points, covering what was audited, what was broken and fixed, the security
model, the brand symbol and app icon, the navigation rebuild, the design system,
mobile-first work, the desktop adaptation, the CSV export, being found and being
readable, the production-readiness and privacy pass, owner-initiated shop deletion,
and the two items that need the owner's own hands.

Status: live on `savo.freebuff.page`. The most recent work — the R-tile identity,
and owner shop deletion — is applied to the database, verified against it, and
verified through a production build in a browser: `verify-ui-acceptance` 165/165,
`verify-float-bar` 54/54, `verify-glass-ui` 16/16, `verify-contrast` 45/45, with
no uncaught page errors and no console errors. The one step not done in this
session is the deploy itself, which only the Freebuff deploy tool can perform;
see §11.

---

## 1. Audit first — what was actually wrong

The brief asked for an audit before changes. Four real defects surfaced, three of
which made the product unusable for a real shop rather than merely ugly. They are
listed here because _how_ they were found matters more than the list.

**The reports never finished loading.** `useShopReport` is keyed on its date
range, and that range was built with a bare `new Date()` in a component body.
That produces a _new query key on every render_, so React Query cancelled the
in-flight request and started it again — forever. The Today screen sat on
"Working out the numbers" until the 12-second stall timer reported a failure that
never actually happened. Fixed with `src/hooks/useReportingWindow.ts`:
`useMinuteNow()` returns a "now" that advances once a minute, so the key is
stable within a tick and the query settles. Both `app.overview.tsx` and
`app.reports.tsx` use it.

**Staff could get permanently stuck.** `ActiveShopProvider` only fell back to
another shop when the stored id _no longer_ matched. A staff member who had just
redeemed an access code — or any first-time user — had no stored id at all, so no
shop was ever selected and they sat on "Select a shop to continue…" forever. It
now adopts the first membership when nothing is selected, and `RequireActiveShop`
redirects to the shop hub when there is genuinely nothing to open.

**Shop creation could destroy its own confirmation.** Creating a shop from
`/onboarding` invalidated the shops query, whose redirect effect navigated to
`/dashboard` and unmounted the sheet _before_ the once-only staff access code was
ever shown. An owner who followed the setup path would never see the code their
staff need to join. Fixed with a `hadShopOnArrival` ref: the redirect only fires
for someone who _arrived_ already inside a shop.

**The till's own action bar hid under the new navigation.** Found in the last
pass, and it is the reason point 8 exists. See §8.

The honest summary: every one of these was invisible to a type-checker and to a
build. They were found by driving the real app with real data.

---

## 2. Staff join with a code — and the collision that could enrol the wrong person

The brief required removing the UUID staff-join UX. Staff no longer choose a shop
or a role: the owner mints a six-digit code, the staff member signs up and types
it, and `redeem_employee_access_code(text)` resolves the shop **in the database**.

The function takes _only the code_. There is no `shop_id` or `role` argument to
forge, and the role is hardcoded to `employee` inside the function. The acting
user always comes from `auth.uid()`, never from an argument.

**The subtle bug.** Each shop salts its own digest (kept in `shop_access_secrets`,
which has RLS on, _zero policies and no grants_ — unreachable from any client).
But that means the same six digits can be live in two shops at once, and the
original function used `LIMIT 1`. The planner picked arbitrarily. A shopkeeper
could hand a valid code to a new hire and enrol them into **a competitor's
shop**, with no error anywhere.

Fixed in migration `20260928000600_ravqen_access_code_collisions.sql`, which adds
`access_code_is_ambiguous(text)` and rewrites redemption to count DISTINCT
matching shops and **refuse an ambiguous code** with a plain-language message.
The owner UI calls the same function through `isAccessCodeTakenElsewhere()`, and
`suggestFreeCode()` avoids minting a colliding code in the first place. Verified
live in the deployed function body:

```
count(DISTINCT c.shop_id) ... more than one shop
```

Also: redemption is throttled to 10 failures per user per hour, and every
attempt — successful or not — is recorded in `access_code_attempts`.

---

## 3. Security model — verified against the live database, not the source

The rule is that the database decides, and the interface only asks nicely. This
was re-verified directly against the live project rather than trusted from the
migrations:

| Claim                                          | Verified result                                  |
| ---------------------------------------------- | ------------------------------------------------ |
| RLS enabled on every table                     | **19 / 19**                                      |
| Any policy readable by `anon`                  | **0**                                            |
| `SECURITY DEFINER` functions with >1 signature | **0** (no argument-overloading surface)          |
| `create_sale` is `SECURITY INVOKER`            | **correct** — RLS applies to every row it writes |

That last row is the one worth pausing on. `create_sale` is deliberately _not_
security-definer, so it cannot be used to launder writes past RLS. The functions
that are security-definer (`shop_report`, `redeem_employee_access_code`,
`create_employee_access_code`, `shop_member_directory`, `access_code_is_ambiguous`)
each re-check membership or ownership internally and take the user from
`auth.uid()`.

Financial history is append-only from the API — `sales`, `payments`,
`debtor_payments`, `inventory_movements`, `refunds`, `refund_items` have no
UPDATE/DELETE grants to `authenticated`. Mistakes are corrected by a visible
counter-entry, never by erasure. `receipt_counters` has RLS on with no policies
and no grants, so receipt numbers are gap-free and unreachable from the client.

Role-aware navigation (§7) is a _courtesy_, not the boundary. An employee's
attempt to read the owner's figures is refused by `shop_report` itself.

---

## 4. No indefinite loading, anywhere

Every asynchronous screen is built from four shared states in
`src/components/app/AppChrome.tsx` — `LoadingState`, `ErrorState`, `EmptyState`,
`NoticeState` — so no screen invents its own.

`LoadingState` carries a stall timer: after 12 seconds it stops pretending to be
patient and offers a retry. A blank screen that admits it is stuck is a better
product than a spinner that lies. `NoticeState` is deliberately distinct from
`EmptyState` — it says "nothing is missing here, the answer is elsewhere", which
is what a permission boundary should say.

All three now carry the symbol. An empty screen with nothing specific to report
shows the mark as its illustration, an error screen shows the mark over a
negative rule, and a loading screen shows the mark above the spinner — because a
spinner on its own is the least branded thing a product can show someone, and
loading is what they look at whenever the connection is slow. A state that _does_
have something specific to say — a dropped connection, a permission boundary —
still passes its own icon, and the icon wins: a reason beats a logo.

---

## 5. No demo data, and no developer wording

**Demo data.** The verification scripts build _real_ shops with real rows,
because that is the only honest way to test them — and a shop outlives the
throwaway user that made it, so the shop list fills with `Duka 1790577371030`
entries. `scripts/cleanup-test-shops.mjs` exists for exactly this and is a dry
run unless given `--delete`. It now matches every script's naming, including the
two added most recently. The live database contains **only 4 real shops**.

**Developer wording.** No screen says "SHA-256", "RPC", "the database keeps…",
"coming soon" or "not built yet". The five remaining matches are all inside code
comments, which developers read; the acceptance suite asserts against _rendered_
text and passes.

---

## 6. The symbol is the R tile, and the app icon is the same composition

The identity is a **simple typographic R** — the display face's R in champagne
on the deep-emerald tile. The owner chose the letter over the drawn mark that
preceded it, and the choice is applied everywhere rather than mixed: the splash
and sign-in screens, the headers, the receipt, the empty and loading states, the
favicon and the app icon.

**Why the mark changed again.** The previous drawn symbol was measured and
defended at length, but an identity is not a measurement: the owner looked at
both and preferred the letter. That preference is the brief. `Logo.tsx` now
renders a champagne R in Fraunces on a `gradient-ink` emerald tile (the utility
was restored to `styles.css` for it), `AppIcon.tsx` draws the same composition
as an SVG with gloss and rim lighting, and `mark-geometry.ts` keeps only the
numbers every renderer shares — tile geometry, brand colours, R placement.

**Receipt.** The printable file carries a plain serif R set inline — no webfont
and no image, because a receipt has to print from a phone with no network. On a
thermal roll the letter is what survives; gradients are not.

**Icons.** The R is typography, so the raster pipeline changed shape: there is
no geometry rasteriser to share any more. `generate-icons.mjs` renders the same
SVG through headless Chromium with the real Fraunces loaded from Google Fonts
(it refuses to write anything if the face fails to arrive, so no fallback
letterform can ship), screenshots it at 16/32/48/192/512, and wraps the frames
into `favicon.ico`. `verify-app-icon.mjs` decodes the written files through
the browser's own PNG decoder and asserts the invariants — transparent rounded
corners, a substantial champagne population centred on a dark-emerald tile,
taller than wide, still legible at 16px — and `verify-ui-acceptance` repeats the
measurements against the bytes the server serves.

`verify-mark.mjs` (the drawn mark's geometry suite) was retired with the
drawing; its checks described a shape that no longer exists.


## 7. The floating navigation — architecture and product decisions

The navigation is the one surface in the product that is translucent. Before
writing it, one decision shaped everything else:

> **A floating object has to read as a separate physical layer.** A 12px pill on
> a translucent surface reads as a _bar_. So the glass is the single, deliberate
> exception to the 12px radius ceiling — `--radius-glass` (1.625rem) and
> `--radius-glass-lg` (2.125rem) exist only for it. Every container in the
> product is unchanged.

The rule that follows from that: **nothing else in the product is translucent.**
A screen that cannot be read at a glance in daylight is worth more than a
consistent effect applied everywhere.

**Role-aware, and genuinely so.** Owner: Dashboard, POS, Inventory, Expenses,
More. Staff: POS, Inventory, Expenses, More. Expenses earned a permanent tab
because recording what the shop spent is a _daily_ job and the counter needs it as
much as the owner does. Only Dashboard is owner-only, because it reads figures
`shop_report` refuses to serve to staff. Every entry in a staff More sheet is
something the database already permits — owner-only destinations are _absent_,
not merely disabled.

**More is a sheet of glass, not a dropdown.** Grouped sections, 56px rows, real
icons, and dismissal by outside tap, swipe-down, or Escape — the three things a
thumb already knows. Built on vaul, so the swipe is real rather than
re-implemented.

**Motion.** The active highlight is a shared `layoutId`, so it _slides_ between
tabs rather than blinking on and off. Icons scale and lift by a degree; a dot
indicator appears. All of it on one spring constant, so nothing moves at its own
pace — and all of it disabled under `prefers-reduced-motion`.

**The active tab is genuinely raised, not repainted.** Its `glass-tile` carries a
contact shadow plus an inset highlight rather than one large drop, because the
tile _travels_ across a blurred surface and a big soft shadow behind a moving
object looks like it is dragging. The verification asserts three things about it
that are easy to claim and easy to get wrong: that it is raised, that it stays
inside its own tab rather than ballooning out from it, and that it is a pale
tint rather than a colour slab.

**The More sheet assembles.** Every heading and every row takes the next number
in a sequence — 40ms base, 16ms between rows, 180ms to land — so the list is
walked in the order it is meant to be read. The numbers are set so the last of
ten rows settles inside 350ms. A stagger that runs longer stops reading as an
entrance and starts reading as a delay, and a shopkeeper opening More on a bad
connection cannot wait for an animation before the list is usable. Closing is
quick and unstaggered, because the drawer is already sliding away underneath it.

**A sheet that looks right and animates not at all.** The first version of that
entrance used `initial={false}` on every animated element, and it did nothing.
The drawer mounts its content at the moment it opens, so an element created
already-open is handed its final value on mount and no transition ever runs —
every row simply appeared, which is the one outcome the stagger exists to avoid.
`initial` has to be the hidden state. The measurement that caught it is the
interesting part: the recorder has to begin at the same moment the entrance
does, so it installs **and opens the sheet from inside the page**. Driving the
click from Node puts a protocol round trip in between, and on a loaded machine
that is long enough to miss the whole animation — which is how a test reports
"no stagger" on a sheet that has one.

**Hover is the established system, not a new one.** `press` for the thumb,
`hover-glass` for the pointer, and a `hover:bg-*` tint for the glass highlight.
Tailwind v4 compiles `hover:` inside `@media (hover: hover)`, so a phone never
gets a row stuck in a hover state after a tap. It is verified in a second,
desktop-pointer context, because the phone context cannot see this state at all.

---

## 8. Mobile-first, safe areas, and never covering content

The bar floats, which means it **cannot push the page down and cannot reserve its
own space.** Two things reserve it instead, both from the same tokens:

- `PageContainer` adds the clearance as bottom padding, including the device's
  gesture-bar inset.
- Anything that pins itself to the bottom edge clears `--glass-bar-clearance`.

That second point came from a real bug. The till's "Take payment" bar was
positioned `fixed bottom-14` — a hardcoded offset from when the navigation was a
fixed-height footer. The floating bar's height varies with the safe-area inset,
so `bottom-14` no longer matched and **the primary action on the till screen was
sitting underneath the navigation.** The previous report claimed the bar "never
covers the last row"; that was true for scrolling content and false for the POS
screen, and it had been asserted without measuring.

The fix is two shared tokens — `--glass-bar-height` (used to _build_ the bar) and
`--glass-bar-clearance` (used to _clear_ it) — so the bar and anything offset by
it can never drift apart. The till went from 8px buried to 22px clear.

`scripts/verify-float-bar.mjs` now measures this on a Pixel-class phone rather
than trusting the claim. Its first run failed, which is how the bug was found:

```
blur(40px) saturate(1.5)   bg oklch(1 0 0 / 0.58)   border 1px   radius 26px
```

**54 checks**, covering translucency, blur, border, depth, pill radius, fixed
positioning, safe-area declaration, per-screen last-row clearance at full
scroll, nothing pinned to the bottom hiding underneath, all five owner tabs, and
every tab at least a 44px touch target — plus the active tab's highlight,
elevation, containment and indicator; the More sheet's material, its eight owner
destinations and its 44px rows; dismissal by outside tap, Escape and a real
swipe-down drag; and the hover states, opened in a second desktop-pointer
context.

**One more trap worth recording.** A raw `backdrop-filter` declared inside a
hand-written `@utility` loses its unprefixed half in the production CSS
minifier — which silently disables the glass in exactly the browser it was
written for. The blur is applied with Tailwind's own `backdrop-blur-*` utilities
at the call site instead, and the acceptance suite asserts the _computed_
`backdrop-filter` in a real browser so it cannot regress quietly.

---

## 9. Desktop adaptation, and what is still open

**Desktop.** The same information architecture, deliberately not the same shape.
From `lg` up the pill becomes a compact rail in the left margin — measured at
**82 × 298px**. Stretching five tabs across a desktop window would make each
target a stretch of empty glass, which is the failure mode the brief warned
about. One `<nav>`, repositioned by viewport, so there is still exactly one
navigation landmark.

**Verification, all green:**

| Suite | Result |
| ------------------------------------------------- | ----------- |
| `verify-ui-acceptance` (real browser, production build) | **165/165** |
| `verify-float-bar` (real geometry) | **54/54** |
| `verify-glass-ui` (composited contrast) | **16/16** |
| `verify-contrast` (rendered pixels, WCAG AA) | **45/45** |
| `verify-app-icon` (the R-tile icons, decoded) | **10/10** |
| `verify-shop-deletion` (owner deletion, guards) | **20/20** |
| `verify-glass` (tokens, utilities, minifier) | **30/30** |
| `verify-csv` (a real parser, not the writer) | **32/32** |
| `verify-seo` (strings, schema, every `<img>`) | **69/69** |
| `verify-business-engine` | **47/47** |
| `verify-staff-access` | **33/33** |
| `verify-auth-flow` | **6/6** |
| `tsc -b --noEmit` / eslint / `build` | 0 errors |

**Every row above was re-run after the R-tile identity change and shop deletion,
against a production build of the changed code.** The browser suites were run
against `dist/` served exactly as hosting serves it.

The numbers that moved with the identity change: `verify-app-icon` was rewritten
for the R tile (10/10) and the acceptance suite's icon block now measures the
letter from its colour. `verify-float-bar` 54/54, `verify-glass-ui` 16/16,
`verify-contrast` 45/45, `verify-shop-deletion` 20/20 did not move. `tsc -b
--noEmit` 0 errors, eslint 0 errors.

**The acceptance suite had three failures, and all three were its own fault.** It
sampled three fixed points in the icon — the middle of the left page, the gutter,
the marker — and asserted the open-ledger drawing was still there. The drawing had
changed, so the probes were measuring whatever had moved underneath them, and
reporting confident numbers about it. That is the same failure the two blank-icon
bugs were, arriving through a third door: **a test that hard-codes a description
of a drawing rather than a property of it.**

The replacement reads no coordinate at all: it finds the artwork's bounding box
from the pixels and asserts its shape. That lesson carried forward — the current
suite locates the R from its colour rather than a coordinate, and the same
approach survives later identity changes intact.

**One test flake, fixed properly.** The acceptance run first reported 92/94, with
the two debtor checks failing. Nothing was wrong with the product: the next
assertion clicked the debtor's name and took a payment against it successfully.
The script had navigated to `/app/debtors` and waited a fixed four seconds for a
query that came back a moment later. A fixed wait is a bet on how fast a query
returns, and it loses exactly when the suite is most useful — on a loaded
machine or a cold connection, when the run is reporting that the product is
broken when it is only late. That step now waits for the rows it is about to
assert on.

---

## 10. Exporting a report as CSV

The Reports page has one **Export CSV** button in its header. It writes the
period the owner is looking at as a single file: the shop, the period, the
summary figures, the products that sold, and every transaction behind them.

**The figures are not recomputed.** They come from `shop_report` — the same
PostgreSQL function the screen reads, which re-checks ownership inside the
database — so an export cannot disagree with the screen or with the books. The
transactions come from the same ledger read model the other screens use, under
the same RLS session. An export is not a second source of truth; it is the
existing one, written to a file.

**The writer is hand-written** (`src/lib/csv.ts`), because the format is four
rules long and there is no reason to add a package to the browser bundle for it.
The rules exist because the alternative corrupts a shop's books silently rather
than throwing:

| Rule                                                                            | What it prevents                                                        |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Quote anything holding a comma, quote, newline or edge space; double the quotes | `Maziwa, 500ml` splitting into two columns                              |
| Numbers: two decimals, no separators, never quoted                              | `1,250.00` reading as two columns, the second swallowing the next field |
| A cell starting `=`, `+`, `-`, `@` gets a leading apostrophe — **text only**    | a customer name executing as a formula on the owner's machine           |
| UTF-8 BOM and CRLF                                                              | Excel on Windows reading the file as the local code page                |

Two layout decisions are worth naming. The **sign lives in the column, not the
number** — "Money in" and "Money out" are separate columns, so a spreadsheet can
total either, rather than handing the next reader a column where half the values
are negative. And the **date is formatted, not sliced**: `occurredAt` arrives as
a UTC ISO string and Nairobi is three hours ahead of it, so slicing would file
every evening sale under the following morning — the kind of error that is
invisible until the till and the bank disagree.

The file is a bank statement's: a header, then labelled blocks separated by a
blank line, each with its own headings. That is ragged on purpose, and every
spreadsheet reads it. The tidier alternative — forcing the summary into the
transactions' ten columns so the file is perfectly rectangular — makes the file
easier to parse and much harder for a person to read, which is the wrong trade
for a file a human opens first.

**A partial export says so.** The ledger fetch is bounded; when the period held
more rows than it was willing to fetch, the file carries a note near the top
naming that fact. A truncated ledger is still useful, but only if the reader
knows which half they are holding.

**The button carries every state the system defines.** Idle: a download icon and
a plain label. Working: a spinner and "Preparing…", so it never looks idle while
a large period is being assembled. Success: a tick and "Saved", reverting after
2.4s. Failure: a warning, the label "Not saved", and the reason sent to a
notice. Disabled: only while a download is genuinely in flight. It is
`variant="outline"` — glass level 2 with a 12px blur, one step below the level 1
cards it sits on — because an export is something an owner does occasionally, and
a full-strength action would outrank the figures it is exporting.

It is deliberately **never disabled for being empty**. A period with no sales
still produces a valid report; the figures are real, they are zero. A greyed-out
button with no explanation is worse than a file that honestly says nothing
happened.

**Verification, two layers.** `verify-csv.mjs` runs 32 checks by feeding the
writer's output through an _independently written_ RFC 4180 parser and failing on
any field that does not survive the round trip, any number a spreadsheet could
not total, and any formula that got through. Writing the parser separately is the
point: a parser written from the same assumptions as the writer proves nothing.
One check failed on its first run — the formula cell came back carrying its
defusing apostrophe, which is the correct contract rather than a defect, so the
assertion was corrected rather than the code.

The acceptance suite then does it for real: it clicks the button on the deployed
site, takes the download, and makes the same assertions against a shop that has
actually traded — so the file contains the credit sale, the expense, the refund
and the repayment that were recorded on screen minutes earlier, with the money
columns totalling correctly and the header naming the shop and the period.

---

## 11. Being found, and being readable

Two requests, one pass: describe the product to search engines, and describe the
images to people who cannot see them. They were treated as one because they are
one — both are about the page saying what it is, without a human present to
explain it.

### The wording has one owner

Five things describe this product: the `<title>`, the meta description, the Open
Graph tags, the structured data, and the home page's `<h1>`. Written in five
places they drift, and the drift is invisible — a search result that disagrees
with the page it links to is not a bug report, it is a slow leak of trust. So
`src/lib/seo.ts` holds the wording once, `src/routes/index.tsx` reads its heading
and its head from it, and `verify-seo.mjs` **imports the module and measures it**
rather than restating the strings, because a test that restates its subject
passes while the subject is wrong.

|             | Value                                                                                                                                                 | Chars |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----: |
| `<title>`   | `SAVO — Kenyan Shop POS with Stock, Debtors & M-Pesa`                                                                                               |    53 |
| description | `Kenyan shop POS and stock book in one: record sales, take M-Pesa, track stock, chase debtors and log expenses from an Android phone at the counter.` |   147 |
| `<h1>`      | `The Kenyan shop POS that keeps every sale, stock and number.`                                                                                        |    60 |
| `og:image`  | `https://savo.freebuff.page/icon-512.png` — 512×512, with `og:image:alt`                                                                             |       |

The core term is **Kenyan shop POS**, and it sits in the title, the description
and the single `<h1>`. Both lengths are inside what a result shows: past roughly
60 characters the title is cut and past the description's limit it is truncated
mid-sentence, and neither truncation announces itself.

`twitter:card` is `summary`, not `summary_large_image`. The only large artwork
the product has is the app icon, and it is square: forced into a 1.91:1 card it
would be a crop of the ledger rather than the ledger. A small correct thumbnail is
worth more than a large wrong one. A purpose-drawn 1200×630 banner is the real
fix, and it is a drawing nobody has made yet — so it is left undone rather than
faked with a crop.

### The structured data

The home page emits one `WebApplication`:

```json
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "SAVO",
  "alternateName": "SAVO Kenyan shop POS",
  "applicationCategory": "BusinessApplication",
  "applicationSubCategory": "Point of Sale",
  "operatingSystem": "Android, iOS, Web browser",
  "areaServed": { "@type": "Country", "name": "Kenya" },
  "inLanguage": "en-KE",
  "url": "https://savo.freebuff.page/",
  "image": "https://savo.freebuff.page/icon-512.png",
  "featureList": ["…seven screens that exist…"],
  "publisher": { "@type": "Organization", "name": "SAVO" }
}
```

**What is not in it, and why.** No `aggregateRating`, no `review`, no `offers`,
no `price`. This product has real users and no published ratings, and no billing
integration at all; an invented rating is a lie to a customer and a manual action
from Google. `keywords` is absent too — every engine that matters has ignored it
for two decades, so listing our own search terms would only advertise what we
hope to rank for.

### Three things that had to be discovered, not assumed

**A `<script>` in the component would not have worked.** The first implementation
rendered the JSON-LD inside the landing component, which is the obvious place.
The build proved it wrong: this app prerenders a _static shell_ containing the
`head()` descriptors but **not** the route's rendered markup, so `dist/index.html`
carried every meta tag and no structured data whatsoever. Anything that only
exists after JavaScript runs is invisible to every crawler that does not execute
it. It moved into `head()`.

**The router types `head().meta` as React `<meta>` props**, where the
`script:ld+json` descriptor does not fit — and TypeScript reports that as the
descriptor failing every member of the union, which reads like the router does not
support JSON-LD at all. It does; the supported path is `head().scripts`, which
maps to the `headScripts` array that the same function renders for both the
prerender and the client.

**A head script renders only when `children` is a string.** The second attempt
passed `dangerouslySetInnerHTML` as an _attribute_, which is valid React and
silently produces nothing here: `Asset`'s script branch returns `null` for a
src-less tag without string children. No tag in the HTML, no error in the build,
no error in the browser — the structured data simply would not have existed, and
`dist/index.html` was re-read after every attempt precisely because that failure
is silent.

All three are recorded in the code at the point they matter, because each one is
a trap that looks like the straightforward path.

### Every image now says what it is

The app renders eight `<img>` elements. All eight were `alt=""` — and that is
worth pausing on, because an empty `alt` is invisible in three ways at once: it
looks right in a browser, it type-checks (`alt` is an optional string), and it is
the _correct_ value for a decorative image, so nothing anywhere flags it as
wrong.

| Where                    | Was  | Now                              |
| ------------------------ | ---- | -------------------------------- |
| Dashboard shop list      | `""` | `"Duka Kuu logo"`                |
| Shop picker (`ShopCard`) | `""` | `"Duka Kuu logo"`                |
| Settings → Shop logo     | `""` | `"Duka Kuu logo"`                |
| Inventory list           | `""` | `"Maziwa 500ml — product photo"` |
| Product form → Photo     | `""` | `"Photo of Maziwa 500ml"`        |
| Printed receipt logo     | `""` | `"Duka Kuu logo"`                |

The text is composed at each call site from data the screen already holds, so it
names the thing in the shopkeeper's own words rather than saying "image".
`StorageImage`'s prop is documented as required-and-not-empty, because the
component is the one place that can enforce it — and the only thing on screen
that is _not_ the image, the loading placeholder, is `aria-hidden`.

### The outline is the page read aloud

Exactly one `<h1>` per page, carrying the primary keyword. `<h2>` for each
section. `<h3>` for every card and step inside one. On the landing page that came
with three fixes and one addition:

- The `<h1>` was the brand tagline — `Every sale. Every stock. Every number.` —
  which is a good line that contains no term anyone searches for. It now reads
  _The Kenyan shop POS that keeps every sale, stock and number_: the keyword, in
  a sentence, with the cadence kept.
- The five steps of _A day at the counter_ and the two cards of _Numbers you can
  defend_ were `<p>` tags styled to look like headings. They are `<h3>`s now, so
  the structure is in the document rather than only in the typography.
- A closing call to action was added as a fourth `<h2>` section, because the page
  previously ended on a feature list with no route back into the product.
- The section labels became parts of a four-section outline: hero, _A day at the
  counter_, _Numbers you can defend_, _Start your shop's book today_.

### Verification

`verify-seo.mjs` is new and runs **69 checks** with no browser: the strings and
their lengths, every required meta descriptor and its absoluteness, the schema's
shape and its _absence_ of invented claims, the files the tags point at (a social
card that 404s is worse than none), every `<img>` and `<StorageImage>` in `src/`,
and the landing page's own structure.

Two of its checks caught itself, which is the useful kind of first run:

1. "The home page renders exactly one `<h1>`" counted **two** — the second was a
   literal `<h1>` inside that file's own explanatory comment. The scan strips
   comments now. Had the assertion been loosened to `>= 1`, it would have passed
   and verified nothing.
2. "Subsection headings" failed against the rendered count of 7: the five steps
   share one `<h3>` inside their `.map()`, so there are three in the source. The
   source assertion was corrected to match the source, and the rendered count is
   asserted where a real DOM exists — in the acceptance run.

The browser half lives in `verify-ui-acceptance.mjs`, which now opens a second,
signed-out context against the deployed site and checks the **raw HTML first**
(`fetch`, no JavaScript) before the hydrated DOM: a tag React adds after
hydration looks perfect in a browser and does not exist to anything else. It
asserts one `<h1>` carrying the keyword, that no heading level is ever skipped,
that the title and description are inside their limits, that the canonical URL
and every social tag are absolute, that the JSON-LD parses into a
`WebApplication` with `name`/`operatingSystem`/`applicationCategory` and no
invented rating, and that every image on the landing page, the sign-in page and
the signed-in workspace carries non-empty `alt` text. It also fails on any
uncaught error during a fresh load, which is the check that would catch a
hydration regression: **164/164**, up from 115.

It also checks the app icon the way only a browser can: it fetches
`/icon-512.png`, decodes it through the browser's own PNG decoder, and samples
the drawing's 24-unit coordinates — the left page is lit, the gutter is bare tile
for the book's whole height, the marker is pale ink. Told apart from the tile's
own gloss by temperature, because the gloss is pale too.

---

## 12. Production readiness, privacy and legal

A twenty-part audit of the deployed product: what it collects, who can reach it,
what it promises, and whether the code actually does those things. This section
is the engineering record. The seven-part summary that goes with it is in
[`production-readiness-report.md`](production-readiness-report.md).

**This is a technical compliance and readiness pass, not legal advice.** Nothing
below makes SAVO's operators compliant with the Data Protection Act 2019, and
nothing below is a claim that the company cannot be sued. Several clauses are
marked as drafts that a qualified Kenyan lawyer must settle; that marking is the
deliverable, not a disclaimer attached to finished work.

### What the audit found that was actually wrong

| Finding                                                            | Severity | What happened                                                                                                                                                                                                       |
| ------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No audit trail of any kind                                         | high     | A sale named a user; a stock movement named nothing; a settings change left no trace                                                                                                                                |
| A revoked grant silently un-revoked a grant                        | high     | `REVOKE ALL … FROM authenticated` ran _after_ `GRANT SELECT … TO authenticated`, so the activity log and consent history would have loaded permanently empty — reading as “no activity yet” rather than as an error |
| `profiles.avatar_url` collected nothing and was never written      | low      | Dead personal-data column; documented rather than dropped, because dropping it would fork the generated types                                                                                                       |
| `ratls_auto_enable` executable by `anon`                           | none     | It is an **event trigger**; it fires on DDL and cannot be invoked by a client. Confirmed by reading `pg_get_functiondef`                                                                                            |
| A `TODO_` business value could print as a real registration number | high     | Fixed structurally: `isPlaceholder()` keys on the string itself, and `ConfigValue` renders a visible ⚠ chip — there is no code path that prints a placeholder as though it were real                                |

The second row is the one worth dwelling on. It is the exact failure mode a
compliance feature produces when nobody runs it: the screen loads, shows
“Nothing logged yet”, and is believed.

### The audit log: append-only by construction

`audit_log` has **one** policy, and it is a `SELECT` policy. There is no
`INSERT`, `UPDATE` or `DELETE` policy for `authenticated`, which means no
signed-in user — including the shop owner — has a database-level permission to
forge, edit or erase an entry. Writes come from seven `SECURITY DEFINER`
trigger functions.

Verified against the live database in a rolled-back transaction:

| Action                                | Rows added | Entry written                                  |
| ------------------------------------- | ---------- | ---------------------------------------------- |
| `INSERT INTO expenses`                | 0 → 1      | `expense.created` · “Expense of 1.00 recorded” |
| `INSERT INTO shop_members`            | 1 → 2      | `employee.joined`                              |
| Flip `shops.accepts_refunds`          | 2 → 3      | `shop.refunds_changed` · “Refunds switched on” |
| Flip `shops.employee_joining_enabled` | 3 → 4      | `shop.joining_changed`                         |
| `UPDATE` + `DELETE` on one expense    | 4 → 6      | `expense.updated`, `expense.deleted`           |

**What is deliberately not logged.** `summary` is composed from columns the
schema already holds. `metadata` is passed through a whitelist that strips
`name`, `phone`, `email`, `notes` and `customer_name` at write time, and a sale
records `customer_name_captured: true` rather than the name. An audit trail that
became a second copy of the customer database would defeat the reason for having
one, and it would be personal data with a longer retention window than the
original.

### What the product does not collect, and says so

No analytics SDK, no advertising or cross-site pixel, no session recorder, no
fingerprinting, no behavioural profiling, no A/B tooling, and no non-essential
cookies of any kind. The only browser storage is the Supabase session and the
chosen shop, in `localStorage`.

Because there is nothing non-essential to consent to, **there is no cookie
banner** — a banner asking somebody to agree to technology that does not run is
theatre, and the Privacy Policy says this in as many words. Equally, there is no
“analytics consent” toggle: inventing a switch for a collector that does not
exist would be a control that appears to protect something it cannot.

### Consent, and what it does not cover

Sign-up asks for one thing: a **required, unticked** acceptance of the terms and
the privacy policy, with both linked in the sentence. There is no pre-checked
box, because a pre-checked box records a fact about the form rather than about
the person. Optional marketing consent is deliberately _not_ bundled into that
checkbox — bundling is what makes it not optional — and product-update emails
are off until switched on in Settings.

Consent is append-only: a withdrawal is a new row with `granted = false`, not an
update, so the history of what was agreed and when is never rewritten. On
account deletion the `user_id` is set to `NULL` and a salted `subject_hash`
remains, so the record that consent happened still exists and still cannot be
read back into a person.

### Deletion: what it removes, and what it refuses to remove

`delete_my_account()` removes the profile, the team memberships and any minted
access codes. It **refuses** — in the database, naming the shops — while the
caller still owns a shop.

That refusal is the design. A shop's sales, refunds, expenses, stock movements
and debtor balances are the business's accounting record. Deleting them because
the person who happened to own the shop clicked a button would be a data
protection failure in the other direction, and it is not recoverable. The
Settings screen says all of this _before_ the button, not in a confirmation
dialog after it.

That refusal pointed at a door that did not exist. It now does — see §13.

### Dependencies: thirty packages removed

`recharts`, `embla-carousel-react`, `react-day-picker`, `react-resizable-panels`,
`cmdk`, `input-otp`, `react-hook-form`, `@hookform/resolvers`, `zod`, `date-fns`
and twenty Radix primitives were installed and imported by nothing that any
route reaches. Thirty-five shadcn wrapper files were deleted along with them;
`bun install` reported `Removed: 30`. Nothing in the app changed, because
nothing in the app used them.

What remains sends data nowhere except Supabase and Google Fonts, and both are
named in the Privacy Policy's processor table.

### Accessibility and contrast

- A **skip link** now exists. The app is a single column of links, so a keyboard
  user previously tabbed through the whole navigation on every screen.
- A `prefers-reduced-motion` block collapses every CSS animation and transition.
  `FloatingNav` already honoured `useReducedMotion()`; the spinners and press
  states did not. The spinner is deliberately _not_ removed — a loading
  indicator that stops moving stops meaning “still working” — it becomes an
  opacity hold, and the 12-second honest “this is taking too long” state still
  fires.
- The staff role badge in the shop bar was `text-[11px] text-muted-foreground`
  on the glass header and measured **3.41:1** — below the 4.5:1 that small text
  needs. It is now `text-xs font-medium text-foreground`, with hierarchy coming
  from size and weight rather than from dropping the contrast.
- `scripts/verify-contrast.mjs` measures contrast from **screenshots of rendered
  pixels**, not from token values. This project has no image library, so the
  browser decodes each crop and splits it into ink and surface by luminance
  order, which survives antialiasing, subpixel rendering and the glass gradient.

### The verifier had three bugs that all looked like results

This is the part worth reading twice, because a contrast suite that cannot tell
“unreadable” from “measured nothing” is worse than no suite. Three separate
bugs produced a number that looked like a finding:

1. **A viewport `clip` is in page coordinates.** The crops were blank, and a
   blank crop measures exactly **1.00:1** — which reads as a catastrophic
   contrast failure on every single element. Replaced with per-element
   screenshots.
2. **Choosing the ink end of the histogram from an “is the page dark?” flag is
   backwards.** On a light page the glyphs are the _darkest_ pixels. This
   version also reported 1.00:1 for everything. The direction is now derived
   from the measured surface, which is correct in both themes and has no
   parameter that can be passed wrong.
3. **Probing for occlusion before Playwright scrolled the element into view**
   blamed the app’s own floating navigation, and separately let two real labels
   through at 1.32:1 and 2.37:1 when the sticky header was still painting over
   them. A foreground colour cannot really come out at 2:1, so the guard now
   asks whether the crop contains the colour the element claims to be painted
   in — and only when the ratio would otherwise fail, because running it
   unconditionally produced false alarms on buttons where the glyphs are a
   small minority of the pixels.

A 1.00:1 result is now reported as a broken measurement, never as a pass or a
fail. A disabled control that cannot be measured is reported and skipped rather
than counted, because WCAG exempts it and the POS’s disabled “Take payment”
button would otherwise mean the suite could never pass with an empty basket.

**Result: 15 screens, every measured text node meets its WCAG 2.2 threshold,
lowest 5.43:1; text on glass between 5.75:1 and 16.63:1.**

---

## 13. Deleting a shop — the one operation that destroys records

Every shop-scoped table in the schema cascades from `shops`. One row out means the
shop's entire financial history goes with it: sales, their lines and payments,
refunds and refund lines, debtors and what they have paid, products, stock
movements, expenses, receipt settings and counters, staff memberships, and the
activity log. There is no soft delete in this schema and there is not going to be
one — a "deleted" shop whose ledger is still readable is not deleted, it is just
hidden. So the most destructive thing the product does is also the thing with the
most guards around it.

**Three guards, all in the database, all before a row moves.**
`delete_shop(p_shop_id, p_confirm_shop_name)` is `SECURITY DEFINER` and checks:
the caller is signed in; `shops.owner_id = auth.uid()`; and the name typed back
matches the name held. Each of those is worth a sentence about _why_:

- **Ownership reads `shops.owner_id`, not a membership row.** A staff member
  carrying the `owner` role cannot delete the shop, and an owner demoted by hand
  still can. One column, one meaning.
- **The name comparison is case-insensitive and trims space**, because a
  shopkeeper typing on a phone keyboard should not lose their shop to a trailing
  space. It is not a weakened guard: the database compares the string it is given
  against the string it holds, so a client bug, a stale confirm dialog or a
  crafted request cannot satisfy it by accident.
- **The row is locked `FOR UPDATE` before it is read.** Without the lock, a rename
  landing between the check and the delete would delete a shop nobody confirmed.

**The screen counts, it does not estimate.** `shop_deletion_preview` is owner-only
_before_ anything is counted, so an employee cannot use it to read a shop's ledger
size. It returns fourteen real row counts, and the Settings panel lists only the
non-zero ones — a list padded with zeros is a list a person stops reading before
reaching the one number they needed, which is how many debtors still owe them
money. The query only runs once the panel is opened.

**What survives is stated as plainly as what does not.** The owner's account
survives: `shops.owner_id → auth.users` is ON DELETE RESTRICT and nothing here
touches `auth.users`, so they stay signed in and can open another shop straight
away. A staff member loses the membership and keeps their account. `data_requests`
rows survive with `shop_id` set to null, and the screen says so — an owner
deciding between deleting now and in six months should not be doing it on a false
idea that everything disappears.

**The tombstone, and why `audit_log` could not do it.** `audit_log.shop_id`
cascades, so an audit entry written for a shop being deleted is deleted with it —
useless as evidence for the one action where evidence matters most. So
`delete_shop` writes into `shop_deletions`, a table with **no foreign key to
`shops`**: the shop's own name, how many of each kind of record it held, and who
deleted it. No customer data goes in it. It is not readable by any client — an
owner must not be able to enumerate what other shops have been deleted, and a
client that could write it could forge one.

**Storage is cleaned up by hand, and allowed to fail.** Storage has no foreign
keys, so the shop's logo, product photos and expense receipts are still in the
buckets when the RPC returns. `removeShopFiles()` walks all three. A failure there
is reported as a count the client could not establish, **never as a failed
deletion**: the rows are already gone and no retry brings them back, so calling it
a failure would be a lie about the only irreversible action in the product.

**`verify-shop-deletion.mjs`, 20 checks, all passing.** It drives the guards from
real signed-in clients the way a careless or compromised one would — an employee,
a stranger, an anonymous caller, and the owner six times with the wrong
confirmation — and then inspects the aftermath with project-owner SQL rather than
trusting the database it is testing: every child row gone, both accounts intact,
the staff member's access gone, the tombstone written, and the tombstone table
unreadable from a client.

It also found a real ordering bug on the way. `audit_log`'s foreign key meant shop
deletion was **impossible**: Postgres runs cascading deletes after the parent row
is gone, so the `shop_members` trigger fired for a shop that no longer existed and
its audit INSERT failed on the FK. `audit_write()` now writes its row as a
conditional `SELECT … WHERE EXISTS (SELECT 1 FROM shops …)`, making the existence
check and the insert one atomic statement, so the row is skipped rather than
racing a deletion it cannot win.

---

## Two items that need the owner

**1. Rotate two leaked credentials.** A Supabase management token and a
`service_role` JWT were pasted into this workspace in an earlier session. Both
should be treated as compromised and rotated in the Supabase dashboard. Only the
account holder can do this; the sandbox has no way to revoke its own access.

**2. Four shops need a decision.** The live database contains shops named
**Mahir, Salman, Tawakui, Njeeritu**. These are exactly the demo names the brief
flags — but they are real rows owned by real accounts, with products and sales,
created 2026-09-28. RLS already isolates them from every other shop, so they are
not a security problem. They were deliberately **not** deleted, because removing
another person's business data is not a call this codebase should make on its
own. If they are demo data, they can be removed on request.
