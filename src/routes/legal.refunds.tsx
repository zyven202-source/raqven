import { createFileRoute } from "@tanstack/react-router";

import { ConfigValue, LegalPage, LegalSection, LegalSubhead } from "@/components/app/LegalPage";
import { SITE_URL } from "@/lib/seo";

export const Route = createFileRoute("/legal/refunds")({
  head: () => ({
    meta: [
      { title: "Refund policy — RAVQEN" },
      {
        name: "description",
        content:
          "How refunds work in RAVQEN: each shop decides whether it accepts them, and what the app records when it does.",
      },
      { name: "robots", content: "index, follow" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/legal/refunds` }],
  }),
  component: RefundsPage,
});

function RefundsPage() {
  return (
    <LegalPage
      title="Refund policy"
      intro="RAVQEN does not sell your customer's goods and does not decide whether a return is allowed. Your shop does. This page explains how that switch works, what the app does when it is off, and what is recorded when it is on."
    >
      <LegalSection id="who-decides" title="Your shop decides, not RAVQEN">
        <p>
          Every shop on RAVQEN has its own refund switch, off by default. Only the shop&rsquo;s
          owner can change it, in <strong>Settings › Refunds</strong>. Until the owner turns it on,
          that shop does not accept refunds.
        </p>
        <p>
          RAVQEN is the record book, not the merchant. A customer asking for their money back is
          dealing with the shop, under the shop&rsquo;s own policy and the law that applies to it.
          RAVQEN&rsquo;s role is to make what the shop decided impossible to lose, dispute or
          quietly reverse.
        </p>
      </LegalSection>

      <LegalSection id="when-off" title="When refunds are switched off">
        <p>
          The switch is enforced in the database, not just in the interface. All four of these hold:
        </p>
        <ul>
          <li>
            <strong>No refund controls appear.</strong> The sale detail screen shows a plain notice
            saying the shop does not take refunds and to ask the owner, instead of an empty form.
          </li>
          <li>
            <strong>There is no hidden way in.</strong> Refunds are created by a single database
            function, and that function checks the shop&rsquo;s switch and refuses with an error if
            it is off. Calling it directly with a crafted request, from a script, or from another
            member&rsquo;s phone, fails exactly as the button would.
          </li>
          <li>
            <strong>The database rejects it too.</strong> A row-level policy independently refuses
            any refund row for a shop that is not accepting refunds — so even a bug that skipped the
            check could not write the row.
          </li>
          <li>
            <strong>Stock does not move.</strong> No refund means no restock. Shelf quantities
            cannot quietly grow because someone posted a return.
          </li>
        </ul>
        <p>
          Turning refunds off does not delete or hide refunds that already happened. They were real
          transactions, and they stay in the shop&rsquo;s history.
        </p>
      </LegalSection>

      <LegalSection id="when-on" title="When refunds are switched on">
        <p>
          A refund is a new record, never an edit to an old one. When staff take goods back, RAVQEN
          writes down:
        </p>
        <ul>
          <li>
            <strong>What was returned</strong> — each line of the original sale, with the quantity,
            so a partial return is possible and a return of more than was sold is refused.
          </li>
          <li>
            <strong>How much was refunded</strong> — at the price actually charged on that sale, not
            today&rsquo;s price, and not an estimate.
          </li>
          <li>
            <strong>Who did it</strong> — the member who pressed the button, recorded at the moment
            it happened, along with who approved it and when.
          </li>
          <li>
            <strong>When</strong> — the timestamp, kept with the record permanently.
          </li>
          <li>
            <strong>Why</strong> — the staff member&rsquo;s reason, if they gave one. It is
            optional; RAVQEN records whether a reason was given, not that a reason is mandatory.
          </li>
          <li>
            <strong>Whether stock went back.</strong> A return that goes on the shelf is recorded as
            a stock movement, so the shelf count and the ledger agree.
          </li>
          <li>
            <strong>What it did to the balance.</strong> On a credit sale, a refund reduces what the
            customer owes and what the shop is owed, so the two books cannot disagree.
          </li>
        </ul>
        <p>
          The original sale is never modified. A sale of three items that gets one of them returned
          is still recorded as three items sold, with a separate refund of one. A sale is a fact
          about what happened; changing it would destroy the very record a dispute depends on.
        </p>
      </LegalSection>

      <LegalSection id="audit" title="The audit trail">
        <LegalSubhead title="Every sensitive action is written down">
          <p>
            Sales, refunds, stock movements, expenses, staff joining and leaving, access-code
            changes and the refund switch itself all write a line to the shop&rsquo;s activity log,
            naming the member, the action, the record and the time. The log is the same one the app
            shows in Settings › Activity.
          </p>
        </LegalSubhead>

        <LegalSubhead title="You cannot edit it from the app">
          <p>
            The activity log has no insert, update or delete permission for signed-in users at all.
            Entries are written by the database itself, when the action happens. A shop owner with
            full access to the app cannot quietly remove a line — which is exactly what makes the
            log worth having.
          </p>
          <p>
            Kept for two years, then deleted in one sweep. Not personal information: it records the
            fact that an account did something, not who that person is. See the{" "}
            <a href="/legal/privacy">Privacy Policy</a> for the full retention table.
          </p>
        </LegalSubhead>
      </LegalSection>

      <LegalSection id="no-money" title="What RAVQEN does not do with refunds">
        <p>
          RAVQEN never moves money. It records that a refund happened; it does not pay it. The shop
          pays its customer — in cash, back to the M-Pesa account, or however it operates — and
          RAVQEN has no connection to that money.
        </p>
        <p>
          RAVQEN makes no claim about your shop&rsquo;s legal obligation to accept a return, about
          cooling-off rights, or about what a customer is entitled to. Those depend on the
          transaction, the goods, the payment method and the law that applies — not on which
          software kept the ledger. Where the law says a customer is entitled to something, the law
          wins over this page and over the shop&rsquo;s switch.
        </p>
        <p>
          <strong>Drafting note:</strong> the consumer refund position under Kenyan law, and how it
          interacts with a per-shop setting, is one of the items marked for review by a qualified
          Kenyan lawyer in the readiness report.
        </p>
      </LegalSection>

      <LegalSection id="questions" title="Questions">
        <p>
          About a refund in your own shop, ask the owner — they are the one who decides. About how
          RAVQEN records refunds, write to <ConfigValue field="supportEmail" />. The product is
          published by <ConfigValue field="legalName" />, reachable at{" "}
          <ConfigValue field="contactEmail" />.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
