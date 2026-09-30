# RAVQEN — Production readiness, privacy & legal

> **Superseded:** this was the earlier twenty-part pass. The current state of
> the product is described in `final-readiness-report.md` (with
> `google-play-readiness.md` for the Android question), and the brand section
> below predates the typographic-R identity now in place.

A twenty-part audit of the deployed application, run against the live code and
the live database, not against a checklist.

> **This is a technical compliance and readiness pass, not legal advice.**
> Nothing in it makes RAVQEN's operators compliant with the Data Protection Act
> 2019, and nothing in it is a claim that the company cannot be sued, cannot be
> held liable, or is exempt from any law. Several clauses are marked as drafts
> that a qualified Kenyan lawyer must settle — that marking _is_ the deliverable
> for those items, not a disclaimer bolted onto finished work.

**Reviewed:** 29 September 2026 · **Target:** `ravqen.freebuff.app` ·
**Database:** Supabase project `lbowjunrhljkntchrmjr`

---

## 1. Issues found

Findings are grouped by severity. "Verified" means the claim was tested against
the running system, not inferred from reading the source.

### High

| #   | Finding                                                                                                                                                                                                                                                                                                             | Evidence                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | **No audit trail existed at all.** A sale recorded a user id; a stock movement recorded nothing; an expense, a staff change and a settings change left no trace.                                                                                                                                                    | Live schema query — no log table of any kind                                                                    |
| 2   | **A `REVOKE` silently undid a `GRANT`.** The new governance migration granted `SELECT` on `audit_log` / `consent_records` / `data_requests` to `authenticated` and _then_ revoked everything from `authenticated`. The screens would have loaded permanently empty — reading as "no activity yet", not as an error. | `role_table_grants` returned `[]`; fixed and re-verified as `SELECT` only                                       |
| 3   | **A `TODO_` business value could have printed as a real registration number.**                                                                                                                                                                                                                                      | Fixed structurally — see §2                                                                                     |
| 4   | **The staff role badge failed contrast at 3.41:1.** `text-[11px] text-muted-foreground` on the glass header. Small text needs 4.5:1.                                                                                                                                                                                | `verify-contrast.mjs`, measured from rendered pixels                                                            |
| 5   | **The retention table needed horizontal scrolling on a 412 px phone** — the primary device. A shopkeeper could not read how long their own records are kept without discovering a gesture the app never teaches.                                                                                                    | Surfaced as an unmeasurable table cell, which is what led to the layout being fixed rather than the measurement |

### Medium

| #   | Finding                                                                                                                                                                                                                                                                                              | Evidence                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 5   | **No consent record of any kind.** Sign-up captured no evidence the person agreed to anything.                                                                                                                                                                                                       | Live schema — no such table                           |
| 6   | **No data-subject route.** No way to export, correct, request deletion, or contact anyone about your data.                                                                                                                                                                                           | Codebase — no such screen or function                 |
| 7   | **No privacy policy, terms of service or refund policy existed.**                                                                                                                                                                                                                                    | No such routes                                        |
| 8   | **Thirty dependencies and thirty-five shadcn wrapper files were installed and imported by nothing.** `recharts`, `embla-carousel-react`, `react-day-picker`, `react-resizable-panels`, `cmdk`, `input-otp`, `react-hook-form`, `@hookform/resolvers`, `zod`, `date-fns` and twenty Radix primitives. | `grep` sweep + `bun install` reported `Removed: 30`   |
| 9   | **No skip link.** The app is a single column of links, so a keyboard user tabbed the whole navigation on every screen.                                                                                                                                                                               | Codebase — `sr-only-focusable` existed but was unused |
| 10  | **Reduced motion was honoured by the navigation but not by CSS.** Spinners and press states kept animating.                                                                                                                                                                                          | `styles.css` had no `prefers-reduced-motion` block    |

### Found by the new work, in the new work

Two defects were introduced by this pass and caught by its own tests before
shipping. Both are recorded because a report that only lists the problems it
found in other people's code is not an audit.

| #   | Finding                                                                                                                                                                                                                                                                                                                                                    | Resolution                                                                                                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 6   | **A `REVOKE` after a `GRANT` silently un-did it** (finding 2 above). The activity log, consent history and request list would all have loaded permanently empty — which reads as "no activity yet", not as an error.                                                                                                                                       | Reordered: `REVOKE` everything first, then grant back exactly `SELECT`. Re-verified against `role_table_grants`.                                                                                                                                                                                                         |
| 7   | **The audit triggers made shop deletion impossible.** `shops` cascades to `shop_members`, and Postgres runs those cascading deletes _after_ the parent row is gone — so the trigger fired for a shop that no longer existed and the `audit_log.shop_id` foreign key rejected the insert. Found when `cleanup-test-shops.mjs` reported "Deleted 0 shop(s)". | `audit_write` now inserts via `SELECT … WHERE EXISTS (SELECT 1 FROM shops WHERE id = p_shop_id)`, making the existence check and the insert one atomic statement. An audit row for a shop being deleted would cascade away anyway, so nothing is lost. Verified: thirteen test shops deleted, four real shops untouched. |

### Low / informational

| #   | Finding                                                                        | Note                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11  | `profiles.avatar_url` is a personal-data column that is never written or read. | Documented, **not** dropped: dropping a column forks the generated Supabase types for no security gain.                                                                                                                                                                                                                |
| 12  | `relforcerowsecurity` is `false` on all 22 tables.                             | Deliberate. `FORCE ROW LEVEL SECURITY` would break the `SECURITY DEFINER` functions that legitimately write rows the caller is not yet a member of — access-code redemption, receipt numbering and the audit triggers. The client connects as `authenticated`, which is not the owner, so every query is RLS-filtered. |
| 13  | `rls_auto_enable` is executable by `anon`.                                     | **Not a finding.** It is an `EVENT TRIGGER`; it fires on DDL and cannot be invoked by a client. Confirmed by reading `pg_get_functiondef`.                                                                                                                                                                             |
| 14  | `anon` holds **zero** table grants.                                            | Correct and verified — the anonymous internet cannot touch any business table.                                                                                                                                                                                                                                         |
| 15  | `lovable.dev` error-reporting hooks exist in `src/lib/`.                       | They only activate inside the Lovable editor preview (`window.__lovableEvents`). No telemetry leaves production. Confirmed by inspection, not assumed.                                                                                                                                                                 |

### Checked and found clean

- **Fake content (§9).** No testimonials, no review schema, no `aggregateRating`,
  no invented customer counts, revenue, or "trusted by N shops" anywhere in
  `src/`. The one demo-shaped thing in the database — four shops named _Mahir,
  Salman, Tawakui, Njeeritu_ — is real rows owned by real accounts. They were
  **not** deleted: removing another person's business data is not a call this
  codebase makes on its own. Flagged for the owner.
- **Unsupported claims (§10).** A regex sweep for "100% secure", "completely
  private", "guaranteed", "fully compliant", "no risk", "never hacked", "legally
  protected", "bank-level", "unbreakable" and "zero risk" across `src/` returned
  **zero** hits in user-facing copy. The only match was a code comment in
  `AppIcon.tsx` about React's generated IDs.
- **Cookies and tracking (§4).** No analytics SDK, no pixel, no session
  recorder, no fingerprinting, no advertising tags, no A/B tooling. Only browser
  storage is the Supabase session and the chosen shop, in `localStorage`.
- **Children's data (§14).** No date of birth, no age field, no minor-facing
  feature. `NOT_COLLECTED` in the privacy policy states this positively.
- **Secrets (§17).** The browser ships a `sb_publishable_` key only. The
  generated `auth-middleware.ts` reads `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`
  server-side. No `service_role` key exists anywhere in `src/`.

---

## 2. Issues fixed

Everything below is implemented, deployed and verified. Nothing is a placeholder
page.

### The audit log is append-only by construction

`audit_log` has **one** policy, and it is a `SELECT` policy. There is no
`INSERT`, `UPDATE` or `DELETE` policy for `authenticated`, so **no signed-in
user — including the shop owner — has a database-level permission to forge, edit
or erase an entry.** Writes come from seven `SECURITY DEFINER` trigger
functions, which run as the table owner.

Verified grants (`role_table_grants`): `authenticated` → `SELECT` only, on all
three governance tables. `anon` → nothing.

Verified firing, in a rolled-back transaction against the live database:

| Action                                | Rows added | Entry written                                  |
| ------------------------------------- | ---------- | ---------------------------------------------- |
| `INSERT INTO expenses`                | 0 → 1      | `expense.created` · "Expense of 1.00 recorded" |
| `INSERT INTO shop_members`            | 1 → 2      | `employee.joined`                              |
| Flip `shops.accepts_refunds`          | 2 → 3      | `shop.refunds_changed` · "Refunds switched on" |
| Flip `shops.employee_joining_enabled` | 3 → 4      | `shop.joining_changed`                         |
| `UPDATE` + `DELETE` one expense       | 4 → 6      | `expense.updated`, `expense.deleted`           |

**What deliberately is not logged.** `summary` is composed from columns the
schema already holds. `metadata` passes through a whitelist that strips `name`,
`phone`, `email`, `notes` and `customer_name` at write time, and a sale records
`customer_name_captured: true` rather than the name. An audit trail that became
a second copy of the customer database would defeat the reason for having one,
and would be personal data with a longer retention window than the original.

### The policies exist, and they are wired up

`/legal/privacy`, `/legal/terms` and `/legal/refunds` — public, prerendered,
linked from the site footer on every page and from each other. The retention
table, the data inventory and the processor list are all rendered from
`src/config/legal.ts`, so the pages and the code cannot drift apart.

### Placeholders cannot print as real values

`isPlaceholder()` keys on the `TODO_` prefix in the string itself, so a
placeholder cannot be shipped by forgetting to update a boolean. `ConfigValue`
renders one as a visible ⚠ chip. The Privacy Policy and Terms carry a banner
while any value is unconfigured, and **Settings › Data & privacy lists every
missing field by name** with its `TODO_` key.

### Consent that is optional is actually optional

- Sign-up: **one required, unticked** acceptance of terms + privacy policy, both
  linked in the sentence. There is no `defaultChecked`; the form refuses to
  submit until it is genuinely ticked.
- Optional product-update consent is **not** on the sign-up form — bundling it
  is what makes it not optional. It is a switch in Settings, off by default,
  with a one-tap unsubscribe described in the policy.
- **No analytics toggle**, because there is no analytics. Inventing a switch for
  a collector that does not exist would be a control that appears to protect
  something it cannot. The Privacy Policy says this in as many words.
- Consent is append-only: a withdrawal is a new row with `granted = false`, not
  an update.
- On account deletion, `user_id` is set to `NULL` and a salted `subject_hash`
  remains, so the evidence that consent happened outlives the account without
  keeping the person.

### Deletion that refuses to delete the wrong thing

`delete_my_account()` removes the profile, team memberships and minted access
codes. It **refuses — in the database, naming the shops — while the caller still
owns a shop.**

A shop's sales, refunds, expenses, stock movements and debtor balances are the
business's accounting record. Deleting them because the person who happened to
own the shop clicked a button would be a data-protection failure in the other
direction, and it is not recoverable. Settings says all of this _before_ the
button, not in a confirmation dialog after it.

### Self-serve export that actually produces a file

Settings › Data & privacy builds a real JSON document — account, profile, shops,
memberships, consent history, requests — and downloads it on the device. No
email round trip, no support ticket, no waiting.

It deliberately does **not** dump the shop's ledger, and says so _inside the
file_, in a `not_included` array. Handing every employee a copy of the owner's
books on request would be its own data-protection failure.

### Refund behaviour matches the refund policy

Already correct, and now verified rather than assumed:

- `shops.accepts_refunds` is enforced **twice** — the `refunds_insert` RLS policy
  checks `s.accepts_refunds = true`, and `create_refund()` raises `42501 "This
shop does not accept refunds"`. A crafted API call fails exactly as the button
  would.
- The UI hides refund controls and shows "This shop does not take refunds"
  instead of an empty form.
- A refund is a **new record**, never an edit: `refunds` + `refund_items`, with
  the operator (`user_id`), the approver (`approved_by`), the timestamp, the
  per-line quantity, the reason, the restock flag and its `inventory_movements`
  row. The original sale is never modified.
- On a credit sale it reduces `debtors.total_owed` and `sales.balance_due`, so
  the two books cannot disagree.
- It is now audited: `refund.created` / `refund.updated` in the activity log.

### Accessibility and contrast

- **Skip link** added to the authenticated shell, with `id="main"` and
  `tabIndex={-1}` on the content region.
- **`prefers-reduced-motion`** block collapses every CSS animation and
  transition. The spinner is deliberately _not_ removed — a loading indicator
  that stops moving stops meaning "still working" — it becomes an opacity hold,
  and `LoadingState`'s 12-second honest "this is taking too long" state still
  fires.
- **`verify-contrast.mjs`** measures from screenshots of rendered pixels, not
  from token values, because a glass panel's contrast is not the background
  token's contrast. It found the 3.41:1 role badge; that is now `text-xs
font-medium text-foreground`, with hierarchy from size and weight rather than
  from dropping contrast.
- Every form error in the new consent UI is `role="alert"` with
  `aria-describedby` / `aria-invalid` wiring.

### Dependencies

Thirty packages and thirty-five dead wrapper files removed. Nothing in the app
changed, because nothing in the app used them. What remains sends data nowhere
except Supabase and Google Fonts, and both are named in the processor table.

---

## 3. Issues requiring human or legal review

These cannot be resolved in code. They are listed in `LEGAL_REVIEW_ITEMS` in
`src/config/legal.ts` and rendered on `/legal/terms` under "Read this first".

1. **Limitation of liability and indemnity.** The current wording is
   deliberately plain and deliberately not a shield. Kenyan consumer-protection
   rules constrain what can lawfully be demanded of a consumer; a lawyer must
   settle both what it says and whether it can be said at all.
2. **Governing law and dispute resolution.** Currently Kenya, courts of Kenya.
   Must be settled together with how consumer-protection law interacts with it.
3. **The lawful basis for processing** under the Data Protection Act 2019, and
   the statutory response deadline for a data-subject request, plus the
   escalation route to the Office of the Data Protection Commissioner.
4. **The retention windows** in `RETENTION` — set by this codebase, documented in
   the policy, and marked as _this product's policy, not a legal opinion_. The
   seven-year accounting window must be checked against Kenyan tax and
   accounting record-keeping rules.
5. **Whether RAVQEN's operator is a data controller, a data processor, or both**
   for shop data. For the account it decides what is collected; for the records
   inside a shop, the shop does. The contract that reflects that split does not
   exist yet.
6. **The consumer refund position**, given that each shop sets its own refund
   policy in the app. Where the law entitles a customer to something, the law
   wins over the shop's switch — but what that means in practice is a legal
   question, not a product one.

Also requiring a human decision, not legal review:

- **Rotate two leaked credentials.** A Supabase management token and a
  `service_role` JWT were pasted into this workspace in an earlier session. Only
  the account holder can revoke them.
- **Fill in `src/config/legal.ts`.** Eight fields. The site shows a ⚠ banner and
  Settings lists them until they are done.
- **The four shops** (_Mahir, Salman, Tawakui, Njeeritu_) need a call: keep or
  remove.

---

## 4. Security issues

**Client-side authorisation is never relied on.** Every boundary is a database
object.

| Control                                                                                           | State                                                                           | How verified                                                                                             |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| RLS enabled on every table                                                                        | 22 / 22                                                                         | `pg_class.relrowsecurity`                                                                                |
| RLS enforced for the app's role                                                                   | `authenticated` is not the table owner, so policies apply                       | `relforcerowsecurity` analysis                                                                           |
| `anon` can touch business data                                                                    | **Nothing.** Zero table grants                                                  | `role_table_grants`                                                                                      |
| Shop isolation on products, sales, expenses, stock, debtors, employees, refunds, receipt settings | Enforced                                                                        | `verify-staff-access.mjs`, now extended to all eight surfaces plus `shop_report`                         |
| Cross-shop writes                                                                                 | Refused                                                                         | Staff cannot insert into another shop's catalogue, rename another shop, or record a sale in another shop |
| Owner vs employee                                                                                 | Enforced in the database                                                        | Staff cannot read access codes, read the team, or call `set_employee_joining`                            |
| Storage tenancy                                                                                   | First path segment is the shop id, resolved via `is_shop_member`                | Migration + policy inspection                                                                            |
| Access codes                                                                                      | Salted SHA-256, never stored readable; 10 wrong tries locks for an hour         | Migration + live behaviour                                                                               |
| Service-role key                                                                                  | Not in `src/`. Client ships a publishable key only                              | Codebase sweep                                                                                           |
| Privileged function exposure                                                                      | Only `rls_auto_enable` is executable by `anon` — an event trigger, not callable | `pg_get_functiondef`                                                                                     |
| Audit log integrity                                                                               | No write permission for any client                                              | `verify-staff-access.mjs`                                                                                |

**A note on how "no write permission" is actually tested**, because the first
version of that check was wrong in an instructive way. It asserted that a
forged `INSERT` into `audit_log` would _return an error_. It does not: with RLS
enabled and no `INSERT` policy, Postgres filters the statement to zero rows and
reports success. The check failed and looked like a security hole.

The property that actually matters is that no row is created, so the test now
writes and then reads back, and the database was queried directly to confirm
`audit_log where action = 'forged.by.test'` returns **0 rows**. The same pattern
now covers `consent_records` and `data_requests`. The security control was sound
throughout; only the assertion was, and a suite that cannot tell a silent RLS
filter from a successful write is a suite that will one day report a hole that
is not there — or miss one that is.

**The honest caveat, stated rather than hidden:** `relforcerowsecurity` is false
on all 22 tables, so a connection made _as the table owner_ would bypass RLS.
`FORCE ROW LEVEL SECURITY` would close that, but it would also break the
`SECURITY DEFINER` functions that must write rows the calling user is not yet a
member of — access-code redemption and the audit triggers among them. The
defence that actually holds today is that the browser connects as
`authenticated`, which is not the owner. This is a documented trade-off, not an
oversight, and it is the right thing for a lawyer and a security reviewer to
look at with fresh eyes.

---

## 5. Privacy issues

| Issue                                                              | Resolution                                                                              |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| No policy existed                                                  | Three pages, rendered from one config module                                            |
| No consent evidence                                                | `consent_records`, append-only, survives account deletion without the identity          |
| No data-subject route                                              | Settings › Data & privacy: export, correction, request, deletion                        |
| Deletion could be a data-protection failure in the other direction | `delete_my_account()` refuses while the user owns a shop, and says why                  |
| Audit log could become a second customer database                  | Metadata whitelist; names and numbers stripped at write time                            |
| Sign-up bundled consent                                            | Optional product updates moved to Settings; nothing optional is on the sign-up form     |
| Pre-checked consent boxes                                          | None exist; the one box is required and unticked                                        |
| Export could leak the owner's books to an employee                 | Export is scoped to the person; the file states what is excluded and why                |
| Retention undefined                                                | One table, rendered in the policy and in Settings                                       |
| Tracking                                                           | None exists, so none is claimed, and no banner fakes it                                 |
| Children's data                                                    | None collected, none requested, positively stated                                       |
| Debtor data collected with no notice                               | A plain-language notice at the point of collection in the POS and on the Debtors screen |

**Deliberate omission, stated so it is not mistaken for an oversight:** there is
no email sending in this application. Account emails come from Supabase Auth;
product-update consent is recorded and switchable, but no marketing email is
actually sent yet, because there is no provider integrated. The policy describes
the intended behaviour and marks the boundary — a transactional email carries no
unsubscribe link, a product-update email would carry a one-tap one.

---

## 6. Accessibility issues

| Issue                              | Resolution                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| No skip link                       | Added, with a focus target                                                                 |
| Reduced motion honoured only in JS | `prefers-reduced-motion` block for all CSS, with the spinner preserved as an opacity hold  |
| 3.41:1 role badge                  | Fixed to full-contrast `text-foreground` at `text-xs`                                      |
| Contrast unmeasured                | `verify-contrast.mjs` measures rendered pixels across 6 public and 9 authenticated screens |
| Form errors not announced          | `role="alert"`, `aria-invalid`, `aria-describedby` on the new consent UI                   |

Measured result: **all text on all fifteen screens meets its WCAG 2.2
threshold**, lowest 4.58:1, with text on glass surfaces between 5.79:1 and
16.63:1.

The suite is written to fail loudly on its _own_ bad measurements, which matters
more than it sounds. Four separate bugs in the verifier produced a number that
looked like a finding:

1. A viewport `clip` is in **page** coordinates. The crops were blank, and a
   blank crop measures exactly 1.00:1 — which reads as a catastrophic contrast
   failure on every element.
2. Choosing the ink end of the histogram from an "is the page dark?" flag is
   backwards: on a light page the glyphs are the _darkest_ pixels. This version
   also reported 1.00:1 for everything. The direction is now derived from the
   measured surface, which is correct in both themes and has no parameter that
   can be passed wrong.
3. Probing for occlusion **before** Playwright scrolled the element into view
   blamed the app's own floating navigation and failed six healthy elements.
4. Probing **after** it, the sticky shop header was still painting over two deep
   elements, producing fabricated failures at 1.32:1 and 2.37:1 — numbers a
   foreground colour cannot physically produce.

Each now has a guard. A 1.00:1 result is reported as a broken measurement rather
than as a pass or a fail; a crop that does not contain the colour the element
claims to be painted in is rejected; fixed chrome is hidden during capture (with
`visibility: hidden`, which preserves layout, so nothing shifts); and a disabled
control that cannot be measured is reported and skipped, because WCAG exempts it
and the POS's disabled "Take payment" button would otherwise mean the suite can
never pass with an empty basket.

**That the verifier needed three rounds of bug-fixing before it could be trusted
is itself the finding worth carrying forward:** a contrast suite that cannot
distinguish "unreadable" from "measured nothing" is worse than no suite, because
it manufactures both false alarms and false confidence.

**Not fixed, and honestly out of scope for a screenshot suite:** screen-reader
runs on VoiceOver and TalkBack, keyboard traversal order through the floating
navigation sheet, and zoom to 400%. Those need a device and a person.

---

## 7. Remaining production blockers

Nothing on this list can be closed from inside the codebase.

1. **Legal review of the Terms of Service.** Liability, indemnity, governing law,
   lawful basis, retention windows, controller/processor status and the consumer
   refund position. The page is marked as a draft and says so.
2. **`src/config/legal.ts` is unconfigured.** Eight `TODO_` fields: legal name,
   contact email, support email, postal address, registration number, OPRC
   registration, physical address. **RAVQEN should not be offered commercially
   until they are set.** The site shows a ⚠ banner and Settings lists them.
3. **Two leaked credentials need rotating.** Supabase management token and a
   `service_role` JWT from an earlier session.
4. **The four real shops need a decision** — _Mahir, Salman, Tawakui, Njeeritu_.
5. **`FORCE ROW LEVEL SECURITY` needs a decision.** Enabling it breaks the
   `SECURITY DEFINER` flows described in §4; leaving it off means the table owner
   bypasses RLS. Neither answer is obviously right and it deserves a deliberate
   choice by someone who can see the whole system.
6. **No email is actually sent.** Consent is recorded and switchable; a
   transactional provider is not integrated, so password-reset delivery depends
   entirely on Supabase Auth's defaults, which nobody has verified for this
   project.
7. **Scheduled retention sweeps are defined but not scheduled.** `purge_audit_log`
   and `purge_access_code_attempts` exist as `SECURITY DEFINER` functions with no
   grants; nothing calls them on a timer. Until it does, the audit log and the
   failed-attempt ledger grow without bound — the opposite of the policy the
   Privacy Policy publishes.
8. **Screen-reader and device testing has not been done.**

---

### Verification

All run against the deployed site at `ravqen.freebuff.app` on 29 September 2026,
after the final redeploy.

| Suite                                                                      | Result                                                |
| -------------------------------------------------------------------------- | ----------------------------------------------------- |
| `verify-contrast.mjs` — 6 public + 9 authenticated screens                 | **45 / 45**, lowest text 4.58:1, glass 5.79:1–16.63:1 |
| `verify-ui-acceptance.mjs` — full product walkthrough                      | **165 / 165**, 0 page errors, 0 console errors        |
| `verify-staff-access.mjs` — roles, cross-shop isolation, governance tables | **46 / 46**                                           |
| `verify-app-icon.mjs`                                                      | 25 / 25                                               |
| `verify-mark.mjs`                                                          | 18 / 18                                               |
| `verify-seo.mjs`                                                           | 69 / 69                                               |
| `verify-glass.mjs`                                                         | 30 / 30                                               |
| `verify-csv.mjs`                                                           | 32 / 32                                               |
| `tsc -b --noEmit`                                                          | 0 errors                                              |
| `eslint src/ scripts/`                                                     | 0 errors, 4 pre-existing `react-refresh` warnings     |

Test shops created by the runs: **13 deleted, 0 remaining.** The four real
shops (_Mahir, Salman, Tawakui, Njeeritu_) were left untouched.
