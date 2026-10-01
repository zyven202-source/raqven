import { SITE_URL } from "@/lib/seo";

/**
 * Store-review and Search Console wiring, written once.
 *
 * # Search Console ownership
 *
 * Verify with the **HTML tag** method: paste Google's `google-site-verification`
 * content string below, redeploy, and click Verify — the tag is emitted for
 * every route from the root head. Google also accepts the DNS `TXT` method,
 * which needs no code change at all.
 */
export const SEARCH_CONSOLE_VERIFICATION_TOKEN = "";

/**
 * # Google Play: the data-deletion disclosure
 *
 * Play's Account Deletion policy requires a **web link where a user can
 * request account deletion** — a place a reviewer (and any user who has lost
 * their device) can reach without installing the app. The in-app deletion
 * flow already exists (Settings › Data & privacy › Delete my account, backed
 * by a database function); this URL is its public-facing address, and the
 * privacy policy anchors to it.
 *
 * The page the anchor lives on is the Privacy Policy, which already documents
 * exactly what deletion removes and what is retained. `#delete-my-account`
 * is the anchor this file and the Play Console Data safety form must agree on.
 */
export const ACCOUNT_DELETION_URL = `${SITE_URL}/legal/privacy#delete-my-account`;

/**
 * # Google Play: the store listing
 *
 * Values the Play Console forms ask for, derived from the same facts the site
 * publishes. Keeping them beside the SEO copy means a listing rewrite cannot
 * drift from what the web app claims.
 */
export const PLAY_LISTING = {
  /** 30 characters max on Play. */
  appName: "RAVQEN — Shop POS Kenya",
  /** 80 characters max on Play. */
  shortDescription:
    "Sales, stock, M-Pesa, debtors and expenses for Kenyan shops — offline-tolerant.",
  /** The Play Privacy Policy URL field. Points at the published policy. */
  privacyPolicyUrl: `${SITE_URL}/legal/privacy`,
  /** The Play "Account deletion" URL field, as the policy requires. */
  accountDeletionUrl: ACCOUNT_DELETION_URL,
  /** Support contact shown on the listing. */
  supportEmail: "mahircade341@gmail.com",
} as const;
