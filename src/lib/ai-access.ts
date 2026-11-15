/**
 * Who may open Studio — the advertisement and copy generator inside SAVO AI.
 *
 * The owner asked for this to be one account, not a role: it is not "every shop
 * owner" and not "every platform admin", it is this address. So the check is an
 * address, written once here for the UI and once in the edge function, which is
 * the copy that actually matters — a hidden tab is a convenience, not a control.
 * `supabase/functions/savo-ai/index.ts` refuses the `studio` action for anyone
 * else, so a crafted request from a different account is rejected too.
 *
 * Comparing lower-cased and trimmed keeps a phone keyboard's stray capital from
 * locking the owner out of their own feature.
 */
export const STUDIO_EMAIL = "mahircade341@gmail.com";

export function canUseStudio(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === STUDIO_EMAIL;
}
