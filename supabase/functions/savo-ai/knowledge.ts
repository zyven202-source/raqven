/**
 * SAVO knowledge base.
 *
 * Every sentence here describes something the app in this repository actually
 * does. There are no prices, testimonials, partner logos or growth claims,
 * because none of those are verifiable from the product and a model that
 * repeats an invented one turns it into a promise.
 *
 * The platform admin can override any entry at runtime (app.ai_knowledge). The
 * bundled copy is the seed and the fallback, so the assistant still answers if
 * the table is empty.
 */

export interface KnowledgeEntry {
  slug: string;
  title: string;
  body: string;
}

export const KNOWLEDGE: KnowledgeEntry[] = [
  {
    slug: "what-is-savo",
    title: "What SAVO is",
    body: "SAVO is a shop management app for Kenyan retailers: a point of sale, stock control, expenses, credit customers (debtors), receipts, refunds, and reports. It works on a phone and in a browser, and a sale can still be recorded when the connection drops. Each shop's records are private to the people who belong to that shop.",
  },
  {
    slug: "pos-and-sales",
    title: "Point of sale",
    body: "Open POS from the bottom dock. Scan a barcode or search for a product, add it to the cart, set quantity, and apply a discount if needed. Choose a payment method: cash, M-Pesa, card, bank, or credit. Cash shows change due. A completed sale gets a receipt number from the shop's own counter and the stock is reduced in the same database step, so the ledger and the shelf cannot disagree. A sale that was recorded offline is queued and sent when the connection returns; it is not counted twice.",
  },
  {
    slug: "inventory-and-stock",
    title: "Inventory and stock",
    body: "Products carry a name, price, buying price, unit, category and a low-stock threshold. Stock is changed only by recording a movement: stock in when goods arrive, a sale, an adjustment after a physical count, damage, a refund return, or a transfer. The stock movements screen lists every movement with who made it and when. Products that have sales or stock history can be archived instead of deleted, so history is never erased.",
  },
  {
    slug: "expenses",
    title: "Expenses",
    body: "Record what the shop spent with a category (for example rent, electricity, transport, packaging, restocking), an amount, a payment method and an optional receipt photo. Expenses are listed by date. Staff can record expenses at the counter; the reports that combine them with sales are for the owner.",
  },
  {
    slug: "debtors-and-credit",
    title: "Debtors and credit",
    body: "A credit sale creates a debtor with a balance owed. Record a repayment against that debtor and the balance updates with a payment record. The debtors screen shows who owes what; a reminder can be prepared for WhatsApp. SAVO does not claim the message was delivered — it hands the text to WhatsApp and the person sends it.",
  },
  {
    slug: "receipts",
    title: "Receipts",
    body: "Receipt settings control the header, footer, logo, tax line, receipt prefix and paper width (58 mm or 80 mm). Receipt numbers come from a per-shop counter so two tills in the same shop cannot issue the same number. A receipt can be shared from the sale screen.",
  },
  {
    slug: "refunds",
    title: "Refunds",
    body: "A refund is recorded against the original sale and specific lines, with an optional reason and a choice of whether the goods go back into stock. Refunds have a status (pending, approved or rejected) and are visible in sales history. Whether refunds are allowed at all is an owner setting.",
  },
  {
    slug: "reports-and-pulse",
    title: "Reports and SAVO Pulse",
    body: "Reports show recorded takings, estimated gross profit (takings minus the buying price on file), expenses and the resulting figure for today, this month or this year. They can be exported as CSV. SAVO Pulse looks at the same recorded data to point out patterns such as best sellers, quiet days and stock that is about to run out. Gross profit is an estimate; it is not the same as net profit.",
  },
  {
    slug: "employees-and-roles",
    title: "Employees and roles",
    body: "A shop has an owner and employees. The owner can turn employee joining on or off and create access codes; an employee joins by entering a code, which the database resolves to the right shop and role. Employees run the till, stock and expenses. Owner-only screens include reports, the profit figures and employee management. Permissions are enforced in the database, not just hidden in the interface.",
  },
  {
    slug: "multiple-shops",
    title: "Multiple shops",
    body: "One account can belong to more than one shop. The shop name at the top of the app switches the active shop, and every screen, sale and report follows that choice. Records never mix between shops.",
  },
  {
    slug: "offline-and-sync",
    title: "Offline and sync",
    body: "If the connection drops, a sale is queued on the device and synced later from the Sync & offline screen. Each queued sale carries an operation id, so a retry cannot create a duplicate. A sync indicator in the header shows the current state.",
  },
  {
    slug: "privacy-and-data",
    title: "Privacy and your data",
    body: "Shop records are protected by row-level security: another shop cannot read them, and an employee cannot read owner-only figures. SAVO never asks for your contacts or your photo library beyond an image you choose. Settings includes consent controls, a data export request and account deletion. When you ask SAVO AI a question, the question and the minimum data needed to answer it are sent to the AI provider; conversations are not stored by SAVO AI and are cleared when you clear the chat or close the session.",
  },
  {
    slug: "support",
    title: "Getting help",
    body: "For account or data help, contact SAVO support at mahircade341@gmail.com or 0143897900. Include the shop name and what you were doing when the problem happened. Never send your password or an employee access code.",
  },
  {
    slug: "limitations",
    title: "What SAVO does not do",
    body: "SAVO records what a shop enters; it does not connect to M-Pesa statements, file taxes, or move money. It does not print to every thermal printer automatically, and it does not guarantee a WhatsApp message was delivered. SAVO AI can read recorded figures but cannot change prices, stock, refunds, balances or permissions — those actions happen on the normal screens, by a person with the right role.",
  },
];

/** Builds the knowledge section of the system prompt, DB overrides winning. */
export function knowledgeBlock(overrides: KnowledgeEntry[] = [], maxChars = 2600): string {
  const bySlug = new Map<string, KnowledgeEntry>();
  for (const entry of KNOWLEDGE) bySlug.set(entry.slug, entry);
  for (const entry of overrides) {
    if (entry.slug && entry.body) bySlug.set(entry.slug, entry);
  }

  const parts: string[] = [];
  let used = 0;
  for (const entry of bySlug.values()) {
    const block = `## ${entry.title}\n${entry.body}`;
    if (used + block.length > maxChars) break;
    parts.push(block);
    used += block.length;
  }
  return parts.join("\n\n");
}
