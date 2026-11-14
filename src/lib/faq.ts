import faq from "./faq.json";

/**
 * The questions a shop owner actually asks before signing up, and the answers
 * this product can stand behind.
 *
 * **One source, three readers.** `faq.json` is the data: this module types it
 * for the pricing page to render, and `scripts/prerender-heads.mjs` reads the
 * same file to write the `FAQPage` structured data into that page's static
 * head. Google requires the marked-up answer to be the answer on the page, so a
 * hand-written copy in the markup would drift the first time one was edited.
 *
 * Every answer is checked against the code: free means no paid plan exists,
 * M-Pesa means recorded as a payment method, and the privacy claims are the RLS
 * policies in `supabase/migrations/`.
 */
export type FaqItem = { question: string; answer: string };

export const FAQ_ITEMS: readonly FaqItem[] = faq;
