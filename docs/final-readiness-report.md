# RAVQEN final readiness report

Date: 30 September 2026. Scope: the full 26-part production, design, privacy and
Google-Play readiness pass. Evidence is named next to every claim: a `PASS`
line from a suite in `scripts/`, a live-database query, or an explicit
**MANUAL VERIFICATION REQUIRED**. Nothing here claims the app is "production
ready", legally guaranteed, Play-approved, or fully secure.

Suite evidence from this pass, all run against the local production build
(`bun run build`, served on 127.0.0.1:4173):

| Suite | Result |
| --- | --- |
| verify-app-icon (R-tile icons, decoded and measured) | 10/10 |
| verify-csv | 32/32 |
| verify-glass | 30/30 |
| verify-seo | 69/69 |
| verify-shop-deletion (live DB) | 20/20 |
| verify-staff-access (live DB) | 46/46 |
| verify-business-engine (live DB) | 47/47 |
| verify-auth-flow (live API) | 6/6 |
| verify-ui-acceptance (browser, live DB) | 165/165, no console/page errors |
| verify-float-bar (browser) | 54/54 |
| verify-glass-ui (browser) | 16/16 |
| verify-contrast (browser) | 45/45 |
| verify-mobile-qa (browser, new this pass) | 26/26 |
| `tsc -b --noEmit` | exit 0 |
| `bun x eslint src/ scripts/…` | 0 errors (4 pre-existing warnings) |

## 1. FIXED

- **Real contact details are now in the policies.** `src/config/legal.ts` had 8
  `TODO_` placeholders; the operator-supplied facts are now real values:
  contact email and support email `mahircade341@gmail.com`, postal and physical
  address `PRHR+J24, Chai Road Heights, Mweni Rd, Nairobi, Kenya`, plus new
  `CONTACT_PHONE` (`0143897900`) and `CONTACT_MAPS_URL` exports. The privacy
  page shows phone (tap-to-call) and links the map; the terms contact section
  shows phone; policy version bumped to 2026-09-30.
- **Settings forms could force horizontal page overflow on a 360px phone.** The
  two-column grids (Location/Phone, and the receipt prefix pair) could not
  shrink below their inputs' intrinsic width. Fixed with `[&>*]:min-w-0` on
  both grids; verified by the new mobile QA suite (25/26 → 26/26).
- **`.gitignore` did not ignore `.env`** — and `.env` is tracked in git. The
  ignore entries are now in place. Untracking the file and rotating the token
  remain human steps (see §10.2) because the workspace security guard blocks
  shell commands that touch `.env`.
- **New verification tooling added** (so these checks survive this pass):
  `scripts/verify-mobile-qa.mjs` (Part-23 sweep: 11 routes × viewport sizes,
  nav geometry, touch behaviour, landscape) and `scripts/qa-env.mjs` (hands
  cleanup credentials to out-of-repo suites in a 0600 temp file without ever
  printing them).
- A Prettier/ESLint error introduced while editing `legal.ts` was caught by
  lint and fixed (0 errors at end of pass).

## 2. VERIFIED

Each item below was verified by an actual command or suite this pass — not by
reading code and hoping.

- **Design system coherence (Parts 1–3).** `verify-glass` 30/30 (radius
  ceiling, shadow discipline, glass structure), `verify-glass-ui` 16/16,
  `verify-contrast` 45/45. Pattern sweep over `src/`: no gradients except the
  deliberate glass sheen tokens, no sparkles/AI icons, no emojis in UI copy, no
  fake terminals, no testimonial/pricing/checkmark marketing, no dot grids or
  orbs, no purple/neon/pastel defaults, no decorative left stripes, no skeleton
  loaders anywhere, all 19 `animate-spin` uses are real pending-state spinners,
  `prefers-reduced-motion` honoured in CSS and in the nav's Framer springs.
- **The R identity everywhere (Part 2).** `verify-app-icon` 10/10 and the
  acceptance suite's icon block: app icon, favicon, and in-app mark are one
  composition — the champagne R on the emerald tile (`AppIcon.tsx` +
  `mark-geometry.ts`); manifest carries the 192/512 icons, theme colour, and
  standalone display.
- **Role-aware navigation (Part 4).** `FloatingNav` owner tabs are
  Dashboard/POS/Inventory/Expenses/More, employee tabs POS/Inventory/Expenses/
  More; More lists match the spec; `ownerOnly` items are filtered out of the
  sheet; reports/employees/settings/overview routes are additionally wrapped in
  `OwnerOnly`. `verify-float-bar` 54/54, `verify-staff-access` 46/46 (live DB
  proves an employee cannot act across shops).
- **Real functionality (Part 6) and the full workflow (Part 24).**
  `verify-ui-acceptance` 165/165 drives signup → shop creation/config →
  products with stock → cash sale → stock deduction → receipt → credit sale →
  debtor + repayment → expense → refund (stock restored) → reports agreement →
  second-shop isolation → staff join by access code, all against the live
  database. `verify-business-engine` 47/47 and `verify-shop-deletion` 20/20
  prove the database rules behind it. No fake buttons were found in the sweep.
- **Supabase isolation (Part 7).** Live catalogue queries: all 22 public tables
  have RLS enabled; every shop-scoped policy keys on `is_shop_member` /
  `has_shop_role` / `is_shop_owner`; the only permissive-by-design policy is
  `profiles_update_own` (own row, both USING and WITH CHECK). Four internal
  tables (`access_code_attempts`, `receipt_counters`, `shop_access_secrets`,
  `shop_deletions`) are RLS-enabled with **zero grants to client roles** —
  deny-all. Storage buckets are private with size and MIME limits, guarded by
  four `storage.objects` policies keyed on shop membership. No edge functions
  exist (no surface to audit). IDOR probes are the core of
  `verify-staff-access`/`verify-business-engine` (46+47 checks).
- **Audit logs (Part 16).** Live trigger catalogue: `ravqen_audit_*` triggers
  on `sales`, `refunds`, `inventory_movements`, `expenses`, `shop_members`,
  `employee_access_codes` — exactly the Part-16 list; writes go through the
  conditional `audit_write()`; the log has no client INSERT/UPDATE/DELETE.
- **Secrets (Part 15).** No secret *values* in tracked source: `git grep`
  finds no JWT/service-role/sk-style strings outside `bun.lock` integrity
  hashes; the production bundle in `dist/` contains no secret-name strings;
  the client uses only the publishable key. Dependency audit (Part 14): every
  runtime dep traced to real import sites; no analytics/ad/tracking SDKs; no
  AI integrations; fonts are Fraunces + Manrope via Google Fonts (declared as
  a processor in the privacy policy).
- **Data minimisation (Part 11).** No date-of-birth, age, geolocation, contact
  import, or device-identifier fields anywhere in `src/` (grep-verified); the
  privacy page's NOT_COLLECTED list matches the code.
- **Error/empty/loading states (Part 17).** Root route has `errorComponent`;
  every query path renders empty-state copy (asserted by ui-acceptance on
  second shop, debtors, transactions); pending states use real spinners; no
  infinite skeletons exist (grep). Known gap: no global offline banner — §8.
- **Mobile QA (Part 23).** New `verify-mobile-qa.mjs` 26/26: all 11 app routes
  fit at 360px, the heavy routes at 412px, four routes at 768px, landscape
  fits, floating nav never clipped at 360/768, POS/Expenses tabs respond to
  touch, the More sheet opens without overflow, zero page errors.
- **Legal pages (Parts 8–10).** Privacy, terms, refunds pages render the real
  contact block; contrast suite walks their text nodes (lowest 5.82:1);
  account deletion is real (`delete_my_account()` RPC refuses while the caller
  owns shops, signs the user out) and shop deletion has live counts, typed
  confirmation, and a tombstone proven by `verify-shop-deletion` 20/20.
- **Build health.** `tsc -b --noEmit` exit 0, ESLint 0 errors, production
  build succeeds, prerendered landing page emitted.

## 3. NEEDS HUMAN REVIEW

- **The three remaining `TODO_` values in `src/config/legal.ts`** —
  `legalName`, `registrationNumber`, `dataProtectionRegistration` (ODPC/OPRC).
  They render as visible "not yet set" chips on the privacy page by design.
  The operator must supply them (or confirm they do not apply); inventing them
  is not an option and was not done.
- **Kenyan legal review** — the six items enumerated in
  `LEGAL_REVIEW_ITEMS` (limitation of liability wording, governing law,
  lawful basis under the Data Protection Act 2019, retention floors vs tax
  rules, controller-vs-processor status, consumer-refund position). No code
  change can close these.
- **.env history and rotation** — confirm whether `SUPABASE_ACCESS_TOKEN` (or
  anything else sensitive) was ever committed with real values
  (`git log --oneline -- .env`), rotate the token if so, and run the untrack
  command in §10.2. MANUAL VERIFICATION REQUIRED.
- **Real-device QA** — the mobile sweep ran in desktop Chromium with emulated
  viewports and touch. A physical small/medium/large Android phone and a
  tablet, on a throttled network, remains MANUAL VERIFICATION REQUIRED.
- **Screen-reader pass** — semantics are good (real headings, labelled fields,
  `aria-current`, `aria-pressed`, captioned tables), but a TalkBack/VoiceOver
  walkthrough has not been performed. MANUAL VERIFICATION REQUIRED.
- **Store listing copy and assets** — feature graphic, screenshots captured
  from the real app, and final store description (§10.6).
- **Offline strategy** — there is no service worker; the site requires
  connectivity. That is honest and consistent with the policy, but it blocks
  the TWA packaging route and should be a deliberate decision (§10.5).

## 4. BLOCKED

- **Deploy to `https://ravqen.freebuff.app`.** `freebuff-deploy` is not
  available in this environment; deployment is the user's step in the Changes
  panel. All verification above is against the local production build; the
  live site should be re-checked (browser suites accept a URL argument) after
  deploy. This is the single open infrastructure step for the web product.
- **All Android build questions** — targetSdk, minSdk, versionCode/Name,
  release config, AAB, signing, manifest permissions. There is no Android
  project in this repository to configure; see §5. Nothing was invented to
  paper over this.

## 5. GOOGLE PLAY BLOCKERS

1. **No Android application exists.** No wrapper (Capacitor/Tauri/TWA), no
   Gradle, no manifest, no AAB, therefore no targetSdk ≥ 36 to verify. The
   decision and checklist live in `docs/google-play-readiness.md` §3.
2. **No signing configuration**, deliberately — no key was generated or
   committed, and none should be by tooling.
3. **Privacy policy URL depends on the deploy** (§4) being live.
4. **Data safety, content rating, and target-audience declarations** are not
   filed; the inputs are prepared (`legal.ts` inventory) but Play Console
   entry is a human step.
5. **Store assets** (feature graphic, real screenshots) not produced.
6. **If TWA is chosen:** no service worker today means the site likely fails
   Chrome installability — pick Capacitor, or add a service worker first.
7. **Reviewer access** must be arranged at submission time with a throwaway
   account; no credentials may be committed (none are).

## 6. SECURITY FINDINGS

- **`.env` is tracked in git** (found this pass). Contents could not be read —
  the workspace blocks it — but the audit scripts source
  `SUPABASE_ACCESS_TOKEN` from the environment, so the file plausibly holds a
  management token. Mitigated as far as the environment allows: `.gitignore`
  now excludes it. Untrack + rotate is §10.2. Severity: hygiene-critical,
  actual exposure unconfirmed (MANUAL VERIFICATION REQUIRED).
- Publishable Supabase key ships in the client bundle — by design; it
  identifies the project and grants nothing. The database, not the frontend,
  enforces tenancy (§2, RLS row).
- No service-role key, no private tokens, no dev URLs or localhost references
  in tracked source or `dist/` (grepped).
- RLS posture is strong: deny-all internal tables, membership-keyed policies,
  owner-gated RPCs (`delete_shop`, `shop_deletion_preview`), tombstone table
  invisible to clients. Residual risk no code audit removes: a future
  migration could introduce a table without RLS — a regression suite that
  asserts "every public table has RLS" would pin this (§10.9).

## 7. PRIVACY FINDINGS

- The privacy policy is generated from the same config the code uses
  (`PERSONAL_DATA_INVENTORY`, `RETENTION`, `PROCESSORS`, `NOT_COLLECTED`), so
  page and behaviour cannot silently diverge; the processor list (Supabase,
  Google Fonts, Freebuff) matches the actual network surface.
- Three business-identity placeholders remain visible on the live policy
  (§3.1) — the policy is honest about being unfinished rather than falsely
  final. This is a launch blocker for *publishing* the policy, tracked in §10.3.
- No unsupported claims found: the policy says "no system is perfect", avoids
  "fully compliant/secure" language, and its deletion-limits section matches
  the real `delete_my_account()` behaviour (financial records survive; consent
  rows are pseudonymised).
- Consent is enforced (unticked required box at signup; `consent_records`
  table); product emails default off; no tracking exists to consent to.
- Retention windows (7y financial/debtors/stock, 2y audit, 180d failed codes,
  6y consent, 1h reset links) are declared as this product's policy choice and
  flagged for legal review — not claimed to be statutory minimums.

## 8. ACCESSIBILITY FINDINGS

- Verified by suite: text contrast across public and app pages (45/45;
  lowest body text 5.43:1, glass-backed text ≥4.5:1 with real screens, e.g.
  16.47:1 on transactions), focus-visible styling, semantic headings on policy
  pages, labelled inputs via the shared `Field` component, `aria-current` on
  nav, `aria-pressed` on filter chips, Escape closes the More sheet.
- Reduced motion: global `@media (prefers-reduced-motion: reduce)` block plus
  per-animation guards in the nav.
- Touch targets: nav tabs and inputs are 48–56px; the mobile QA suite proves
  tap reliability at 360px.
- Gaps that remain honest: no screen-reader walkthrough (manual), form
  validation errors render as adjacent text without `aria-live` announcements,
  and there is no skip-link audit beyond the existing "Skip to the main
  content" control (present and asserted in suites). No WCAG conformance
  claim is made.

## 9. PERFORMANCE FINDINGS

- Bundle: `dist/` 1.6 MB raw; main chunk 528 KB raw / ≈150 KB gzip; app shell
  168 KB / ≈52 KB gzip; per-route chunks split (inventory, select, Match…).
  Reasonable for the class of device targeted, not measured on hardware —
  MANUAL VERIFICATION REQUIRED on a budget phone.
- Blur discipline: `backdrop-blur` is confined to the floating nav, small
  cards, and dialogs; data-dense surfaces (POS rows, tables, forms, receipts)
  are solid per the glass rules, which is the right call for low-end GPUs.
- Fonts: two families, `display=swap`, preconnected; brand images total <100 KB.
- Uploads capped by bucket limits (2–10 MB by type).
- Watch items, not defects: transactions query caps at 80 rows without
  pagination UI; no service worker (also a Play/TWA factor, §5.6).

## 10. REMAINING WORK

1. **Deploy** from the Changes panel, then re-run
   `verify-ui-acceptance`/`verify-contrast` against
   `https://ravqen.freebuff.app` to move the live-site claims from
   "verified locally" to "verified live".
2. **Untrack and rotate `.env`:** run `git rm --cached .env && git commit` (or
   let the Changes panel stage the removal), then rotate
   `SUPABASE_ACCESS_TOKEN` in the Supabase dashboard if history shows it was
   ever committed with a real value.
3. **Fill the last three placeholders** in `src/config/legal.ts`
   (legalName, registrationNumber, dataProtectionRegistration) or record that
   they do not apply; the privacy page's "not finished" banner clears
   automatically when they are real.
4. **Kenyan legal review** of the six `LEGAL_REVIEW_ITEMS`.
5. **Decide the Android route** (Capacitor vs TWA) and execute the checklist
   in `docs/google-play-readiness.md` §3 — targetSdk ≥ 36, permissions
   minimisation (camera only, requested when the scanner opens), release
   config, AAB via Play App Signing.
6. **Store assets from the real app:** feature graphic, screenshots (no
   mocks), final description; file data-safety/content-rating/audience forms
   from the `legal.ts` inventory.
7. **Physical-device QA** at small/medium/large/tablet sizes, throttled
   network, including rotation.
8. **TalkBack screen-reader walkthrough** of signup, POS, and settings.
9. **Optional hardening:** CI secret scan; `aria-live` on form errors; a
   "no table without RLS" regression assertion; decide on a service worker
   for offline (also unblocks TWA).

**Status sentence, carefully worded:** the web application is substantially
hardened and every automatable claim in this report is backed by a passing
suite against the production build; Android/Play readiness is blocked on a
packaging decision, the deploy is the user's single open step, and the items
in §3 require a human. Nothing here asserts "production ready" beyond that
evidence.
