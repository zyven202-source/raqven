import { createFileRoute } from "@tanstack/react-router";

import { ConfigValue, LegalPage, LegalSection, LegalSubhead } from "@/components/app/LegalPage";
import {
  BUSINESS_DETAILS,
  CONTACT_PHONE,
  LEGAL_REVIEW_ITEMS,
  RETENTION_ROWS,
} from "@/config/legal";
import { SITE_URL } from "@/lib/seo";

export const Route = createFileRoute("/legal/terms")({
  head: () => ({
    meta: [
      { title: "Terms of service — RAVQEN" },
      {
        name: "description",
        content:
          "The rules for using RAVQEN: your account, your shop, your staff, your data, and what happens if something goes wrong.",
      },
      { name: "robots", content: "index, follow" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/legal/terms` }],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      intro="These terms are the agreement between you and the business behind RAVQEN. They are written to be read. Where a clause is the kind of thing only a lawyer should settle, it is marked as such rather than dressed up as settled law."
    >
      {/* ------------------------------------------------- the legal review */}
      <LegalSection id="not-legal-advice" title="Read this first">
        <p>The product is published by:</p>
        <p className="font-medium text-foreground">
          <ConfigValue field="legalName" /> (<ConfigValue field="tradingName" />
          ), reachable at <ConfigValue field="contactEmail" />.
        </p>
        <p>
          <strong>
            This document is a starting draft prepared alongside the software, and it is not a
            substitute for legal advice.
          </strong>{" "}
          Nobody building software can tell you what the law in Kenya requires of this product. The
          following clauses are marked in this page because they need a qualified Kenyan lawyer to
          settle before RAVQEN is offered commercially:
        </p>
        <ol className="list-decimal space-y-1.5 pl-5">
          {LEGAL_REVIEW_ITEMS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
        <p>
          Nothing in this document should be read as a statement that RAVQEN&rsquo;s operators
          cannot be sued, cannot be held liable, or are exempt from any law. They are not. If these
          terms turn out to be wrong, the fix is a lawyer and a correction — not a disclaimer here.
        </p>
      </LegalSection>

      {/* ------------------------------------------------------------- who */}
      <LegalSection id="agreement" title="The agreement">
        <p>
          These terms apply to anyone who creates an account for, or uses, RAVQEN. By creating an
          account or using the service you accept them. If you do not accept them, do not use the
          service; you can close your account at any time from Settings.
        </p>
        <p>
          You must be at least 18 years old to hold an account. RAVQEN is a business tool; the
          person who creates the account is the one responsible for it.
        </p>
      </LegalSection>

      {/* --------------------------------------------------------- account */}
      <LegalSection id="account" title="Your account">
        <p>You are responsible for:</p>
        <ul>
          <li>
            <strong>The accuracy of what you enter</strong> — your name, email, phone number, your
            shop&rsquo;s name and details, your products, your prices, your customers&rsquo;
            details. RAVQEN records what you give it. Garbage in produces a garbage ledger, and the
            app cannot tell the difference.
          </li>
          <li>
            <strong>Keeping your sign-in to yourself.</strong> Anyone you give your password to can
            act as you, make sales in your shop, and see your shop&rsquo;s numbers. Use a password
            only you know, and do not write it on the till.
          </li>
          <li>
            <strong>Telling us if you think someone else is in.</strong> Change your password
            immediately if you think it has been seen, and write to{" "}
            <ConfigValue field="supportEmail" />.
          </li>
          <li>
            <strong>Not sharing one login across people.</strong> The app has staff accounts and
            access codes precisely so that each person is identifiable. A shared login destroys the
            audit trail that protects the shop.
          </li>
        </ul>
        <p>
          You are responsible for activity on your account. RAVQEN is not liable for losses caused
          by an account being used by someone you gave access to.
        </p>
      </LegalSection>

      {/* ------------------------------------------------------ shop owner */}
      <LegalSection id="shop-owner" title="If you run a shop on RAVQEN">
        <p>As the owner of a shop on RAVQEN you are responsible for:</p>
        <ul>
          <li>
            <strong>The business, not the software.</strong> RAVQEN records your sales, stock and
            expenses. It does not run your shop, set your prices, decide what you may sell, or
            guarantee that your records satisfy any tax, licensing or regulatory obligation. Those
            remain yours, and where the law requires an accountant, a receipt format, a licence or a
            tax treatment, a shop’s own professional advice is what settles it.
          </li>
          <li>
            <strong>Your customers&rsquo; information.</strong> Debtor names, phone numbers and
            credit balances are personal data about other people. RAVQEN gives you the tools to keep
            them — access is limited to your shop, and you can delete a debtor once the balance is
            settled — but collecting it, explaining it to the person, and honouring their rights is
            your responsibility as the party who decided to collect it. RAVQEN&rsquo;s own Privacy
            Policy covers RAVQEN&rsquo;s processing; it does not discharge your obligations as a
            business.
          </li>
          <li>
            <strong>Backing up what matters.</strong> RAVQEN is the working record, not the only
            record. Export your reports to CSV regularly. A till computer can be stolen, and a
            stolen phone is not a backup strategy.
          </li>
          <li>
            <strong>Staff and access.</strong> You decide who is on your team, what they can do, and
            when they leave. See the next section.
          </li>
        </ul>
      </LegalSection>

      {/* --------------------------------------------------------- employees */}
      <LegalSection id="employees" title="Staff access">
        <p>
          RAVQEN has exactly two roles. <strong>Owners</strong> control everything: shop details,
          receipt settings, the refund switch, staff access codes, and the activity log.{" "}
          <strong>Employees</strong> can use the till, record sales, move stock, log expenses and
          take repayments, but cannot change the shop&rsquo;s settings or manage who is on the team.
        </p>
        <p>
          The distinction is enforced in the database, not by hiding buttons, so an employee cannot
          reach an owner-only action by calling the API directly.
        </p>
        <p>
          Access codes are how a new staff member joins. A code is a bearer token: anyone who has it
          can join as an employee. Keep it to the person it is for, give it out in person, and
          retire it the moment someone leaves. RAVQEN stores codes as a salted hash and cannot
          recover a code for you — if it is lost, mint a new one.
        </p>
        <p>
          Ten wrong guesses at a code in an hour locks that code for an hour. This is deliberate and
          there is no way to switch it off; it is what stops a six-digit code being ground down by
          someone trying every combination.
        </p>
        <p>
          As the owner, you are responsible for the people you admit to your shop&rsquo;s data and
          for telling them what they may do with it.
        </p>
      </LegalSection>

      {/* --------------------------------------------------- acceptable use */}
      <LegalSection id="acceptable-use" title="Acceptable use">
        <p>Do not use RAVQEN to:</p>
        <ul>
          <li>break the law, or store or process anything you have no right to process;</li>
          <li>
            attempt to reach another shop&rsquo;s data, another shop&rsquo;s files, or another
            person&rsquo;s account, by any means including the API;
          </li>
          <li>
            probe, scan, overload or interfere with the service, or circumvent the access controls
            that keep shops separate;
          </li>
          <li>
            upload malware, or content you have no right to upload, or use the file storage to host
            anything other than the images and receipts the product is for;
          </li>
          <li>
            misrepresent who you are, impersonate another person or business, or claim a RAVQEN
            account for a shop you do not run;
          </li>
          <li>
            resell, rebrand or provide RAVQEN to third parties as your own product without written
            permission;
          </li>
          <li>store content that infringes someone else&rsquo;s rights;</li>
        </ul>
        <p>
          RAVQEN may suspend or close an account that breaks these rules, and will tell you why
          where it is safe to do so.
        </p>
      </LegalSection>

      {/* ---------------------------------------------------------- payment */}
      <LegalSection id="payment" title="Subscription and payment">
        <p>
          <strong>RAVQEN currently has no paid tier and takes no payment.</strong> The version
          published at <a href={SITE_URL}>{SITE_URL}</a> is free, and no card, bank or M-Pesa
          details are collected anywhere in it. M-Pesa appears only as a way to record how a
          customer paid; RAVQEN never takes the customer&rsquo;s money and never sees their M-Pesa
          credentials.
        </p>
        <p>
          If a paid plan is ever introduced, its pricing, billing cycle, renewal and cancellation
          terms will be published here before it exists, and the terms below are the place they will
          go. Nothing in this document promises free service indefinitely, and nothing in it
          authorises any charge.
        </p>
      </LegalSection>

      {/* ------------------------------------------------------ availability */}
      <LegalSection id="availability" title="Service availability">
        <p>
          RAVQEN is provided as-is. It works on the networks, phones and browsers it was built for,
          and it will not work perfectly on all of them. Specifically:
        </p>
        <ul>
          <li>
            The service is provided on an &ldquo;as available&rdquo; and &ldquo;as is&rdquo; basis.
            It may be unavailable for maintenance, for network failure, or for reasons outside
            RAVQEN&rsquo;s control, and no uptime percentage is promised anywhere in this document
            or in the product.
          </li>
          <li>
            <strong>Keep your own records.</strong> RAVQEN is the working record. If a till cannot
            reach the network, the sale has not been recorded — do not assume it will appear later.
          </li>
          <li>
            <strong>Software has defects.</strong> RAVQEN is built and tested carefully, but it is
            not certified error-free and this document does not claim it is. If a figure looks
            wrong, check the activity log and the transaction history before acting on it.
          </li>
        </ul>
        <p>
          The service is intended for lawful business use in Kenya and is not designed for
          safety-critical, medical or any other use where a software error could put someone at
          risk.
        </p>
      </LegalSection>

      {/* ------------------------------------------------------------ data */}
      <LegalSection id="data" title="Your data">
        <p>
          The <a href="/legal/privacy">Privacy Policy</a> sets out what RAVQEN collects, why, who
          can see it and how long it is kept. That policy is part of these terms: using RAVQEN means
          accepting it.
        </p>
        <LegalSubhead title="What is kept after you leave">
          <p>
            Your profile and team memberships are deleted when you close your account. Records your
            shop made — sales, refunds, expenses, stock movements, debtor balances — are the
            shop&rsquo;s business records and stay. So does the record of what you agreed to, with
            your name removed. This is not a loophole in your right to deletion; it is the boundary
            between your data and somebody else&rsquo;s records, and it is spelled out in full in
            the Privacy Policy.
          </p>
          <p>
            Because of that boundary, you cannot delete your account while you still own a shop. The
            app will name the shops and ask you to transfer or close them first.
          </p>
        </LegalSubhead>

        <LegalSubhead title="Who RAVQEN is responsible to">
          <p>
            For your own account, RAVQEN is the party deciding what is collected and why. For the
            records inside a shop, the shop is: RAVQEN processes them on the shop&rsquo;s
            instructions. Where RAVQEN&rsquo;s role is one the Data Protection Act 2019 treats as a
            data processor rather than a controller, and the contract that reflects that, are
            matters for a qualified Kenyan lawyer. This is marked in the readiness report.
          </p>
        </LegalSubhead>
      </LegalSection>

      {/* --------------------------------------------------------------- IP */}
      <LegalSection id="intellectual-property" title="Intellectual property">
        <p>
          RAVQEN — the name, the logo, the app icon, the interface, the source code and the
          underlying software — belongs to <ConfigValue field="legalName" /> (
          <ConfigValue field="tradingName" />
          ). These terms grant you a limited, non-exclusive, non-transferable, revocable licence to
          use the service as intended. No rights are granted beyond that.
        </p>
        <p>
          <strong>Your data stays yours.</strong> The records you enter are yours and your
          customers&rsquo;. RAVQEN claims no ownership of them and licences no right to resell,
          publish or use them to build anything else. The same applies to the images you upload: you
          must have the right to use them.
        </p>
        <p>
          <strong>Feedback</strong> you send is welcome, and sending it does not oblige RAVQEN to
          keep it secret — but no confidentiality attaches to it.
        </p>
      </LegalSection>

      {/* ------------------------------------------------------ termination */}
      <LegalSection id="termination" title="Ending the agreement">
        <p>
          You may close your account at any time from Settings › Data & privacy. Closing it removes
          your profile and your team memberships immediately, and ends your right to use the
          service.
        </p>
        <p>
          RAVQEN may suspend access temporarily to protect the service or other shops — for example,
          to investigate a suspected breach of another shop&rsquo;s data — and may close an account
          that has broken these terms. Where it is safe to do so, you will be told why and given the
          chance to put it right.
        </p>
        <p>
          Sections that by their nature should survive termination do: your shop&rsquo;s records
          stay, intellectual property stays ours, and the liability and dispute provisions below
          continue to apply to anything that happened before the account closed.
        </p>
      </LegalSection>

      {/* -------------------------------------------------------- liability */}
      <LegalSection id="liability" title="Limitation of liability">
        <p className="rounded-lg border border-caution/40 bg-caution-soft/50 px-3.5 py-2.5 text-[0.875rem]">
          <strong>Drafting note:</strong> this clause, the indemnity below, and the governing-law
          clause are the three a Kenyan lawyer should rewrite before commercial launch. The version
          below is deliberately plain and deliberately not a shield.
        </p>
        <p>
          To the fullest extent the law allows, RAVQEN is not liable for indirect or consequential
          loss, or for loss of profit, revenue, goodwill or anticipated savings, arising from the
          use of, or inability to use, the service.
        </p>
        <p>
          RAVQEN&rsquo;s total aggregate liability to you for anything connected with the service is
          limited to the amount you actually paid RAVQEN for it. RAVQEN is currently free, so that
          amount is zero — which is not a rhetorical flourish, and is not a promise that RAVQEN will
          never have to account for anything it does.
        </p>
        <p>
          Nothing in these terms excludes or limits liability for death or personal injury caused by
          negligence, for fraud or fraudulent misrepresentation, or for anything else that cannot
          lawfully be excluded. A limitation that a court decides is invalid is struck out; the rest
          of these terms stands.
        </p>
        <p>
          You are responsible for backing up your own data and for checking your figures. RAVQEN is
          a recording tool, not your accountant and not your advisor.
        </p>
      </LegalSection>

      {/* --------------------------------------------------------- indemnity */}
      <LegalSection id="indemnity" title="Indemnity">
        <p>
          <strong>Drafting note:</strong> an indemnity is a promise to cover another party&rsquo;s
          losses. Kenyan consumer-protection rules constrain what can lawfully be demanded of a
          consumer, so a lawyer must settle both what this says and whether it can be said at all.
        </p>
        <p>
          You agree to indemnify RAVQEN against claims, damages and reasonable costs arising from
          your use of the service, your breach of these terms, or content you upload that infringes
          someone else&rsquo;s rights — to the extent the law allows such a promise to be made.
        </p>
      </LegalSection>

      {/* ---------------------------------------------------------- disputes */}
      <LegalSection id="disputes" title="Law and disputes">
        <p>
          <strong>Drafting note:</strong> the governing law, the forum and any arbitration clause
          must be settled by a Kenyan lawyer, together with how Kenyan consumer-protection law
          interacts with them.
        </p>
        <p>
          These terms are governed by the laws of Kenya, and the courts of Kenya have jurisdiction
          over any dispute arising from them. Before starting proceedings, please write to{" "}
          <ConfigValue field="supportEmail" /> — most disagreements are a misunderstanding about
          what the product does, and this page is the fastest way to settle one.
        </p>
        <p>
          If a clause here is found unenforceable, the rest of these terms still applies. A clause
          that cannot be enforced is not a licence to ignore the rest.
        </p>
      </LegalSection>

      {/* ---------------------------------------------------------- changes */}
      <LegalSection id="changes" title="Changes to these terms">
        <p>
          These terms carry a version number and an effective date, and the version you accepted is
          stored with your consent record. Material changes are announced in the app before they
          take effect and require you to accept them; a change that reduces your rights will not be
          applied to you without the chance to accept it or close your account.
        </p>
      </LegalSection>

      {/* -------------------------------------------------------- retention */}
      <LegalSection id="retention-summary" title="Retention summary">
        <p>
          The full policy is in the <a href="/legal/privacy">Privacy Policy</a>. In short:
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-[0.875rem]">
            <caption className="sr-only">How long each kind of record is kept.</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="py-2 pr-3 font-medium text-foreground">
                  Record
                </th>
                <th scope="col" className="py-2 font-medium text-foreground">
                  Kept for
                </th>
              </tr>
            </thead>
            <tbody>
              {RETENTION_ROWS.map((row) => (
                <tr key={row.data} className="border-b border-border/60">
                  <th scope="row" className="py-2.5 pr-3 font-normal text-foreground">
                    {row.data}
                  </th>
                  <td className="py-2.5">{row.period}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LegalSection>

      {/* ---------------------------------------------------------- contact */}
      <LegalSection id="contact" title="Contact">
        <p>
          <ConfigValue field="legalName" />, trading as <ConfigValue field="tradingName" />.
          Registered at <ConfigValue field="physicalAddress" />, registration number{" "}
          <ConfigValue field="registrationNumber" />. Enquiries:{" "}
          <ConfigValue field="contactEmail" />. Support: <ConfigValue field="supportEmail" />.
          Phone:{" "}
          <a
            href={`tel:${CONTACT_PHONE}`}
            className="font-medium text-ink underline underline-offset-4"
          >
            {CONTACT_PHONE}
          </a>
          . Postal: <ConfigValue field="postalAddress" />.
        </p>
        <p className="mt-4 text-[0.8125rem]">
          &copy; {new Date().getFullYear()} {BUSINESS_DETAILS.tradingName}. All rights reserved.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
