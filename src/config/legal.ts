/**
 * Business and legal details — the single place they are written down.
 *
 * ## Why this file exists, and why it is full of placeholders
 *
 * A Privacy Policy and a Terms of Service have to answer "who is publishing
 * this and how do I reach them". Answering that honestly needs facts about a
 * real business: a registered name, a postal address, a support inbox, a
 * registration number, a regulator. **SAVO's code cannot know any of those,
 * and inventing one is worse than admitting it is missing** — a fabricated
 * company number in a privacy policy is a false statement that binds nobody and
 * misleads everyone.
 *
 * So every value below is either a fact the code genuinely knows, or a clearly
 * marked placeholder that renders visibly as a placeholder. `TODO` prefixed
 * values are surfaced in the UI with a highlighted `⚠ CONFIGURE` chip and are
 * listed in `UNCONFIGURED_FIELDS`, which the Settings › Data & privacy screen
 * shows to the owner. Nobody can ship with an unmarked placeholder, and nobody
 * has to guess which values are missing.
 *
 * ## What is a fact and what is a choice
 *
 * `POLICY_VERSION` is a fact about the code: it changes when this file's
 * substance changes, and consent records store it so a later "what did they
 * agree to?" question has an answer. The `RETENTION` windows are a *choice*
 * made by this codebase, documented in the Privacy Policy, and flagged in the
 * report as needing a Kenyan lawyer's review — they are not a claim about what
 * the law requires.
 */

/** Bumped whenever the substance of the policies changes. Stored with consent. */
export const POLICY_VERSION = "2026-09-30";

export const POLICY_EFFECTIVE_DATE = "30 September 2026";

/** Shown in the footer and in the report, so a plain-language "who runs this". */
export const PRODUCT_NAME = "SAVO";

/**
 * The business's public phone number and a map link to its premises. Both are
 * facts supplied by the operator, so they are written here like the email:
 * plainly, with no marker. If the phone number changes, this is the one place
 * to change it.
 */
export const CONTACT_PHONE = "0143897900";

/** Google Maps link for the business address, as supplied by the operator. */
export const CONTACT_MAPS_URL = "https://maps.app.goo.gl/PnvNzoYC8GZiXVR29?g_st=ac";

/**
 * The registry entry the Data Protection Act 2019 and its regulations expect a
 * data controller to hold. There is no value here, and this codebase will not
 * invent one.
 */
export interface BusinessDetails {
  /** The registered entity behind the product. */
  legalName: string;
  /** The name the product trades under. Often the same as the legal name. */
  tradingName: string;
  /** The public contact address. */
  contactEmail: string;
  /** Where support requests go. May differ from the contact address. */
  supportEmail: string;
  /** Postal address. Often not published, hence the placeholder. */
  postalAddress: string;
  /** Registration number the Business Registration Service (BRS) issued. */
  registrationNumber: string;
  /** Kenya Data Protection Act registration, once obtained from the OPRC. */
  dataProtectionRegistration: string;
  /** Physical premises, if customers can visit. Often deliberately withheld. */
  physicalAddress: string;
}

/**
 * `TODO_` in the value is the marker. `isPlaceholder()` keys on it, so a
 * placeholder cannot be shipped by forgetting to update a boolean.
 */
export const BUSINESS_DETAILS: BusinessDetails = {
  legalName: "Abdirahman Hilowle Adan",
  tradingName: "SAVO",
  contactEmail: "mahircade341@gmail.com",
  supportEmail: "mahircade341@gmail.com",
  postalAddress: "PRHR+J24, Chai Road Heights, Mweni Rd, Nairobi, Kenya",
  registrationNumber: "TODO_registration_number",
  dataProtectionRegistration: "TODO_oprc_registration_number",
  physicalAddress: "PRHR+J24, Chai Road Heights, Mweni Rd, Nairobi, Kenya",
};

export function isPlaceholder(value: string): boolean {
  return value.startsWith("TODO_");
}

/**
 * The fields an operator has to fill in before launch, by key. Drives the
 * `⚠ CONFIGURE` checklist so "is this ready?" is one click, not a code read.
 */
export const UNCONFIGURED_FIELDS: { key: keyof BusinessDetails; label: string }[] = (
  Object.keys(BUSINESS_DETAILS) as (keyof BusinessDetails)[]
)
  .filter((key) => isPlaceholder(BUSINESS_DETAILS[key]))
  .map((key) => ({
    key,
    label: {
      legalName: "Registered legal name",
      tradingName: "Trading name",
      contactEmail: "Public contact email",
      supportEmail: "Support email",
      postalAddress: "Postal address",
      registrationNumber: "Business registration number",
      dataProtectionRegistration: "ODPC / OPRC registration number",
      physicalAddress: "Physical business address",
    }[key],
  }));

export const businessDetailsAreComplete = UNCONFIGURED_FIELDS.length === 0;

/** Human-readable rendering of a placeholder, for the ⚠ chip. */
export function displayValue(value: string): { text: string; placeholder: boolean } {
  if (!isPlaceholder(value)) return { text: value, placeholder: false };
  return {
    text: value
      .slice(5)
      .replace(/_/g, " ")
      .replace(/^\w/, (c) => c.toUpperCase())
      .concat(" — not yet set"),
    placeholder: true,
  };
}

/**
 * Retention windows, in one table, so the Privacy Policy and the report cannot
 * disagree with each other.
 *
 * These are **this product's policy**, not a legal opinion. Kenyan accounting
 * and tax rules set a floor for business records that this codebase does not
 * get to choose, and the report says so out loud.
 */
export const RETENTION = {
  /** Sales, refunds, expenses: the shop's accounting record. */
  financialRecords: {
    label: "Sales, refunds and expenses",
    years: 7,
    why: "Accounting and tax record. Held for as long as the shop needs them, and at least the retention period a shop's own accountant sets.",
  },
  /** Stock ledger: operational, not personal. */
  stockRecords: {
    label: "Stock movements",
    years: 7,
    why: "Kept with the sales they explain, so a stock figure can always be traced to the movements that produced it.",
  },
  /** Debtors: personal data about a person who owes money. */
  debtorRecords: {
    label: "Debtor balances",
    years: 7,
    why: "The shop is pursuing money this person owes, or defending a claim about it. Removing the balance would defeat the shop's own record.",
  },
  /** Who did what: security record. */
  auditRecords: {
    label: "Activity log",
    years: 2,
    why: "Enough to answer 'who changed this and when' over a plausible dispute window, and no longer.",
  },
  /** Failed access-code guesses: pure security signal. */
  securityRecords: {
    label: "Failed sign-in attempts",
    days: 180,
    why: "Only useful while someone is still trying codes. Six months is the longest anyone should be grinding at a six-digit code.",
  },
  /** Evidence that someone agreed to something. */
  consentRecords: {
    label: "Consent records",
    years: 6,
    why: "Kept after the account is closed, without the name attached, so the record that consent happened still exists.",
  },
  /** Undo a mistyped password, nothing more. */
  resetLinks: {
    label: "Password reset links",
    hours: 1,
    why: "A reset link is a temporary key to the account. It expires in an hour whether it is used or not.",
  },
} as const;

export const RETENTION_ROWS = [
  {
    data: RETENTION.financialRecords.label,
    period: `${RETENTION.financialRecords.years} years`,
    why: RETENTION.financialRecords.why,
  },
  {
    data: RETENTION.stockRecords.label,
    period: `${RETENTION.stockRecords.years} years`,
    why: RETENTION.stockRecords.why,
  },
  {
    data: RETENTION.debtorRecords.label,
    period: `${RETENTION.debtorRecords.years} years`,
    why: RETENTION.debtorRecords.why,
  },
  {
    data: RETENTION.auditRecords.label,
    period: `${RETENTION.auditRecords.years} years`,
    why: RETENTION.auditRecords.why,
  },
  {
    data: RETENTION.securityRecords.label,
    period: `${RETENTION.securityRecords.days} days`,
    why: RETENTION.securityRecords.why,
  },
  {
    data: RETENTION.consentRecords.label,
    period: `${RETENTION.consentRecords.years} years`,
    why: RETENTION.consentRecords.why,
  },
  {
    data: RETENTION.resetLinks.label,
    period: `${RETENTION.resetLinks.hours} hour`,
    why: RETENTION.resetLinks.why,
  },
] as const;

/**
 * The exact set of data the product collects, with a reason and an audience for
 * each. §6 of the readiness pass asks for this to be written down; the Privacy
 * Policy renders it, so the page and the code cannot drift apart.
 */
export interface DataInventoryRow {
  what: string;
  why: string;
  who: string;
  retention: string;
}

export const PERSONAL_DATA_INVENTORY: DataInventoryRow[] = [
  {
    what: "Your name and email address",
    why: "They are your sign-in. Your email is where a password reset goes.",
    who: "You, and the other people in your shop (they can see your name).",
    retention: "Until you delete your account.",
  },
  {
    what: "Your phone number, if you give one",
    why: "Optional. It is put on receipts your shop prints.",
    who: "You, and the other people in your shop.",
    retention: "Until you delete your account, or clear it in Settings.",
  },
  {
    what: "Your password",
    why: "To prove you are you. It is hashed by the authentication service and never readable by SAVO.",
    who: "Nobody at SAVO. The authentication service checks it, not us.",
    retention: "Not stored in a form we can read.",
  },
  {
    what: "Which shops you belong to and your role in each",
    why: "This is what grants you access. It is checked on every single request, in the database.",
    who: "You, the shop owner, and the other people in that shop.",
    retention: "While you are on the team. Removed when you are removed.",
  },
  {
    what: "Sales, stock movements and expenses you record",
    why: "The shop's business. Each row names the member who did it.",
    who: "Everyone in the shop. It stays when you leave.",
    retention: RETENTION.financialRecords.years + " years.",
  },
  {
    what: "Debtor names, phone numbers and balances",
    why: "Only if your shop sells on credit. This is your shop's record of who owes it money.",
    who: "Everyone in the shop.",
    retention:
      RETENTION.debtorRecords.years +
      " years, or until your shop settles the balance and removes the record.",
  },
  {
    what: "An activity log of sensitive actions",
    why: "So a shop can answer “who changed this, and when” — a sale, a refund, a stock movement, a staff change.",
    who: "Everyone in the shop.",
    retention: RETENTION.auditRecords.years + " years.",
  },
  {
    what: "Failed staff access-code attempts",
    why: "A six-digit code can be guessed. Ten wrong tries in an hour locks the door for an hour.",
    who: "The shop owner. Never anyone outside the shop.",
    retention: RETENTION.securityRecords.days + " days.",
  },
  {
    what: "Which policy version you agreed to, and when",
    why: "Proof that consent was given.",
    who: "You. Kept without your name after your account closes.",
    retention: RETENTION.consentRecords.years + " years.",
  },
];

/** What SAVO deliberately does *not* collect. Rendered on the privacy page. */
export const NOT_COLLECTED: string[] = [
  "No advertising or cross-site tracking pixels.",
  "No analytics SDK, no behavioural profiling, no session recording.",
  "No advertising cookies and no third-party cookies of any kind.",
  "No date of birth, no age, and no children's data — SAVO has no feature that needs one.",
  "No ID number, no KRA PIN, and no bank or M-Pesa credentials. M-Pesa payments are recorded as a payment method, not as a transaction.",
  "No contacts from your phone, no photos of your phone's gallery beyond images you pick for a product.",
];

/** The only third parties that can see anything a user types. */
export interface ProcessorRow {
  name: string;
  role: string;
  whatItSees: string;
  where: string;
}

export const PROCESSORS: ProcessorRow[] = [
  {
    name: "Supabase",
    role: "Database, authentication and file storage",
    whatItSees:
      "Everything described above: your account, your shop's records, the images you upload.",
    where: "Servers operated by Supabase. Choose the region closest to Kenya at signup.",
  },
  {
    name: "Google Fonts",
    role: "Web font delivery (Fraunces and Manrope)",
    whatItSees:
      "Your IP address and browser, as any web server does when it serves a file. Nothing you typed.",
    where: "Google's servers.",
  },
  {
    name: "Freebuff",
    role: "Hosting and deployment for this site",
    whatItSees: "The request needed to deliver the page. Nothing inside the app.",
    where: "Freebuff's servers.",
  },
];

/** The marked items that need a qualified Kenyan lawyer, surfaced in-app. */
export const LEGAL_REVIEW_ITEMS: string[] = [
  "The limitation of liability and indemnity wording in the Terms of Service.",
  "The governing law and dispute resolution clause (currently: Kenya, courts of Kenya).",
  "The statement of lawful basis for processing under the Data Protection Act 2019.",
  "The retention windows listed above, against Kenyan tax and accounting record-keeping rules.",
  "Whether SAVO's operator is a data controller, a data processor, or both for shop data.",
  "The consumer refund position, given that each shop sets its own refund policy.",
];
