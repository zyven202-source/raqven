import { createFileRoute } from "@tanstack/react-router";

import {
  ConfigValue,
  LegalAnchor,
  LegalPage,
  LegalSection,
  LegalSubhead,
} from "@/components/app/LegalPage";
import {
  BUSINESS_DETAILS,
  CONTACT_MAPS_URL,
  CONTACT_PHONE,
  NOT_COLLECTED,
  PERSONAL_DATA_INVENTORY,
  PROCESSORS,
  RETENTION_ROWS,
} from "@/config/legal";
import { pageMeta, SITE_URL } from "@/lib/seo";
import { ACCOUNT_DELETION_URL } from "@/lib/store-links";

/*
 * The Play Console data-deletion form is filled with ACCOUNT_DELETION_URL,
 * which ends in this page's #delete-my-account anchor. If the id on the
 * section below ever changes, this breaks at compile time rather than turning
 * into a dead link a Play reviewer finds.
 */
const _playAnchorCheck: typeof ACCOUNT_DELETION_URL extends `${string}#delete-my-account`
  ? true
  : never = true;

export const Route = createFileRoute("/legal/privacy")({
  head: () =>
    pageMeta({
      title: "Pith — Privacy policy",
      description:
        "What Pith collects, why, who else can see it, how long it is kept, and how to get a copy of it or ask for it to be removed.",
      path: "/legal/privacy",
    }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro="This says what Pith actually does with information — not what a policy template says it could do. It is written for a shopkeeper, not a lawyer. If a sentence here is unclear to you, that is a defect in this page; please tell us."
    >
      {/* ------------------------------------------------- delete my account */}
      {/*
        The account-deletion disclosure Google Play requires. The Play
        Console's data-deletion form takes this page's URL with this anchor
        (`#delete-my-account`, kept in sync with `src/lib/store-links.ts`), and
        a reviewer fetches it signed-out — so this section is the web
        counterpart of the in-app flow, not a copy of it.
      */}
      <LegalSection id="delete-my-account" title="Delete my account">
        <p>
          This page is the account-deletion link Pith publishes. You have two ways to have your
          account deleted, and they remove the same data:
        </p>
        <ol>
          <li>
            <strong>In the app (fastest).</strong> Sign in, open Settings › Data &amp; privacy and
            tap <em>Delete my account</em>. Your profile and your team memberships are removed
            immediately, and the app tells you on the spot what it keeps and why.
          </li>
          <li>
            <strong>Without the app.</strong> Email{" "}
            <a
              className="font-medium text-ink underline underline-offset-4"
              href={`mailto:${BUSINESS_DETAILS.supportEmail}?subject=Delete%20my%20account`}
            >
              {BUSINESS_DETAILS.supportEmail}
            </a>{" "}
            with the subject <em>Delete my account</em>, from the address on the account. We reply
            to that address to confirm the request is yours, delete the account, and confirm the
            deletion in a final email.
          </li>
        </ol>
        <p>
          What deletion removes, and what it deliberately keeps (the shop&rsquo;s own accounting
          record outlives any one member), is described in{" "}
          <LegalAnchor href="#deletion-limits">what deletion does not remove, and why</LegalAnchor>,
          and the retention windows are in{" "}
          <LegalAnchor href="#retention">how long it is kept</LegalAnchor>.
        </p>
      </LegalSection>

      {/* ------------------------------------------------------- the basics */}
      <LegalSection id="who-we-are" title="Who is publishing this">
        <p>
          This policy covers the Pith point-of-sale and stock-keeping application, and the websites
          at <a href={SITE_URL}>{SITE_URL}</a> and its subpages.
        </p>
        <p>The business behind it is:</p>
        <dl className="mt-4 grid gap-x-6 gap-y-2 rounded-lg border border-border bg-sunken px-4 py-3 sm:grid-cols-[minmax(9rem,auto)_1fr]">
          <dt className="font-medium text-foreground">Legal name</dt>
          <dd>
            <ConfigValue field="legalName" />
          </dd>
          <dt className="font-medium text-foreground">Trading name</dt>
          <dd>
            <ConfigValue field="tradingName" />
          </dd>
          <dt className="font-medium text-foreground">Contact email</dt>
          <dd>
            <ConfigValue field="contactEmail" />
          </dd>
          <dt className="font-medium text-foreground">Phone</dt>
          <dd>
            <a
              href={`tel:${CONTACT_PHONE}`}
              className="font-medium text-ink underline underline-offset-4"
            >
              {CONTACT_PHONE}
            </a>
          </dd>
          <dt className="font-medium text-foreground">Postal address</dt>
          <dd>
            <ConfigValue field="postalAddress" />
          </dd>
          <dt className="font-medium text-foreground">Business registration</dt>
          <dd>
            <ConfigValue field="registrationNumber" />
          </dd>
          <dt className="font-medium text-foreground">Data protection registration</dt>
          <dd>
            <ConfigValue field="dataProtectionRegistration" />
          </dd>
        </dl>
        <p>
          Any value shown as <span className="font-medium text-foreground">not yet set</span> is a
          placeholder in this build. It is not a real value, and it will be filled in with the
          registered details before this policy is published as final.
        </p>
      </LegalSection>

      {/* -------------------------------------------------------------- what */}
      <LegalSection id="what-we-collect" title="What Pith collects">
        <p>
          Pith is a till and a stock book. Almost everything it holds is a business record, and most
          of it is about a shop rather than about a person. Personal information enters the system
          in a small number of places. The table below is the complete list — not an example.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-[0.875rem]">
            <caption className="sr-only">
              Every category of personal information Pith collects, why, who can see it, and how
              long it is kept.
            </caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="py-2 pr-3 font-medium text-foreground">
                  What
                </th>
                <th scope="col" className="py-2 pr-3 font-medium text-foreground">
                  Why
                </th>
                <th scope="col" className="py-2 pr-3 font-medium text-foreground">
                  Who can see it
                </th>
                <th scope="col" className="py-2 font-medium text-foreground">
                  Kept for
                </th>
              </tr>
            </thead>
            <tbody>
              {PERSONAL_DATA_INVENTORY.map((row) => (
                <tr key={row.what} className="border-b border-border/60 align-top">
                  <th scope="row" className="py-2.5 pr-3 font-normal text-foreground">
                    {row.what}
                  </th>
                  <td className="py-2.5 pr-3">{row.why}</td>
                  <td className="py-2.5 pr-3">{row.who}</td>
                  <td className="py-2.5">{row.retention}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <LegalSubhead title="What Pith deliberately does not collect">
          <p>
            Data you are not asked for is data that cannot leak, cannot be subpoenaed by accident,
            and cannot be misused. Pith is built so that most of the following is simply true:
          </p>
          <ul>
            {NOT_COLLECTED.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>
            <strong>On children&rsquo;s data:</strong> Pith is built for people running shops, and
            it has no feature that needs a date of birth, an age, or anything about a minor. It does
            not ask for one. If a future version introduces a feature involving children, that
            version will get its own privacy review before it ships, and this policy will be updated
            before that feature is released — not after.
          </p>
        </LegalSubhead>
      </LegalSection>

      {/* ------------------------------------------------------------- why */}
      <LegalSection id="why" title="Why it is collected, and what it is used for">
        <p>
          Pith processes information for the following purposes and no others. There is no secondary
          use, no product improvement mining and no profiling.
        </p>
        <ul>
          <li>
            <strong>To let you sign in.</strong> Your email address and password are checked by the
            authentication service on every request. Your password is never readable by Pith.
          </li>
          <li>
            <strong>To keep one shop separate from another.</strong> Your membership is checked in
            the database on every single read and write, not just when the app loads. A request that
            names another shop&rsquo;s records is refused by the database, not by the screen you
            happen to be looking at.
          </li>
          <li>
            <strong>To run the shop.</strong> Sales, refunds, stock movements, expenses, debtor
            balances and receipts are recorded so the numbers on screen are the numbers in the shop.
          </li>
          <li>
            <strong>To answer disputes.</strong> The activity log records who made a sensitive
            change and when, so a shop can answer &ldquo;who changed this?&rdquo; without guessing.
          </li>
          <li>
            <strong>To keep the service secure.</strong> Repeated wrong staff access codes are
            counted, and the code is temporarily locked.
          </li>
          <li>
            <strong>To honour your rights.</strong> Access, correction and deletion requests, and
            the record of what you agreed to.
          </li>
        </ul>
        <p>
          Pith does not sell personal information, does not rent mailing lists, and does not share
          your shop&rsquo;s data with advertisers. There are no advertising networks in this
          product.
        </p>
      </LegalSection>

      {/* ------------------------------------------------------------- who */}
      <LegalSection id="processors" title="Who else processes it">
        <p>
          Pith does not try to run a database, an authentication service, a font server and a web
          host in-house. Three outside services touch the system, and this is the complete list:
        </p>
        <ul>
          {PROCESSORS.map((processor) => (
            <li key={processor.name}>
              <strong>{processor.name}</strong> — {processor.role}. Sees: {processor.whatItSees}{" "}
              Location: {processor.where}
            </li>
          ))}
        </ul>
        <p>
          None of them is an advertiser, and none is given your debtor lists or your sales figures
          to profile.
        </p>
      </LegalSection>

      {/* ------------------------------------------------------------ cookies */}
      <LegalSection id="cookies" title="Cookies and tracking">
        <p>
          <strong>Pith sets no tracking cookies and runs no analytics.</strong> There is no Google
          Analytics, no Facebook pixel, no advertising tag, no session recorder, no A/B testing tool
          and no fingerprinting. Nothing about your visit is measured and sold.
        </p>
        <p>
          The only browser storage Pith uses is your sign-in session, kept in this browser&rsquo;s
          local storage so you stay signed in, and your choice of shop. It contains no identifier
          that follows you to another site, and it is not readable by any other website.
        </p>
        <p>
          Because there is no non-essential tracking, <strong>there is no cookie banner</strong>. A
          banner asking you to agree to things that do not exist would be theatre, not consent. If a
          future version adds a non-essential technology, that version will ship with a consent
          mechanism switched <em>off</em> by default, and this section will be rewritten before
          anything starts running.
        </p>
      </LegalSection>

      {/* -------------------------------------------------------- retention */}
      <LegalSection id="retention" title="How long it is kept">
        <p>
          Nothing is kept forever because storage is cheap. Different kinds of record have different
          reasons to exist, and therefore different lifetimes:
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-[0.875rem]">
            <caption className="sr-only">How long each kind of record is kept, and why.</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="py-2 pr-3 font-medium text-foreground">
                  Record
                </th>
                <th scope="col" className="py-2 pr-3 font-medium text-foreground">
                  Kept for
                </th>
                <th scope="col" className="py-2 font-medium text-foreground">
                  Why
                </th>
              </tr>
            </thead>
            <tbody>
              {RETENTION_ROWS.map((row) => (
                <tr key={row.data} className="border-b border-border/60 align-top">
                  <th scope="row" className="py-2.5 pr-3 font-normal text-foreground">
                    {row.data}
                  </th>
                  <td className="py-2.5 pr-3">{row.period}</td>
                  <td className="py-2.5">{row.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          When a limit is reached, the record is deleted in a single sweep. Nothing is quietly
          archived &ldquo;just in case&rdquo;.
        </p>
      </LegalSection>

      {/* ----------------------------------------------------------- safety */}
      <LegalSection id="security" title="How it is kept safe">
        <p>
          The controls below are in the code and can be checked; this is not a list of intentions.
        </p>
        <ul>
          <li>
            <strong>Isolation is enforced in the database.</strong> Every table carries row-level
            security. A signed-in person can only read or write rows belonging to a shop they are a
            member of, and this is decided by the database on every request — not by hiding a button
            in the interface.
          </li>
          <li>
            <strong>Owner and employee are different.</strong> Only an owner can change shop
            settings, manage staff access codes, or see the activity log&rsquo; shop-wide
            administration actions.
          </li>
          <li>
            <strong>Files are private.</strong> Uploaded logos, product photos and expense receipts
            are stored in private buckets. The first folder in the path is the shop&rsquo;s ID, and
            access is checked against membership of that shop. There is no public URL that shares
            them.
          </li>
          <li>
            <strong>Passwords are hashed</strong> by the authentication service. Pith cannot read
            them and cannot recover them for you.
          </li>
          <li>
            <strong>Staff access codes are never stored in readable form.</strong> A salted hash is
            stored, so a copy of the database does not reveal anyone&rsquo;s till code.
          </li>
          <li>
            <strong>The activity log cannot be edited from the app.</strong> It has no insert,
            update or delete permission for signed-in users at all; entries are written by the
            database itself.
          </li>
          <li>
            <strong>No privileged key in the browser.</strong> The app ships with a publishable
            Supabase key. It identifies the project; it grants nothing. There is no service-role key
            anywhere a browser, a phone, or a shop member can reach it.
          </li>
        </ul>
        <p>
          No system is perfect, and this page does not claim otherwise. If you believe you have
          found a way into an account or around a shop boundary, contact us at the address above and
          say so plainly.
        </p>
      </LegalSection>

      {/* ----------------------------------------------------------- rights */}
      <LegalSection id="rights" title="Your rights">
        <p>
          These rights are yours regardless of who asked, and most of them you can exercise yourself
          without contacting anyone.
        </p>
        <ul>
          <li>
            <strong>See your data.</strong> Settings › Data &amp; privacy has{" "}
            <em>Download everything we hold about you</em>, which produces the account, membership,
            consent and request records as a file immediately. No waiting, no email round trip.
          </li>
          <li>
            <strong>See your shop&rsquo;s data.</strong> The reports screen exports sales, stock and
            expenses as CSV at any time.
          </li>
          <li>
            <strong>Correct it.</strong> Your name, email, phone and shop details are editable in
            the app. Debtor names and phone numbers are editable by anyone in that shop.
          </li>
          <li>
            <strong>Delete it.</strong> Settings › Data &amp; privacy has <em>Delete my account</em>
            . It removes your profile and your team memberships. See the next section for what it
            will not delete, and why.
          </li>
          <li>
            <strong>Withdraw optional consent.</strong> Product-update emails are switched off in
            the same section, and the switch is off until you turn it on. Withdrawing consent never
            affects your ability to use the app.
          </li>
          <li>
            <strong>Ask about anything not covered here.</strong> Settings › Data &amp; privacy has
            a <em>Contact us about my data</em> form that files a request in writing, with a date on
            it.
          </li>
        </ul>
        <p>
          You do not need to give a reason, and Pith will not ask you for one. Requests are handled
          free of charge. Under Kenyan law a data controller has statutory deadlines for responding;
          the exact deadline, and the escalation route to the Office of the Data Protection
          Commissioner, should be confirmed by a qualified Kenyan lawyer before launch and are
          marked for review in the readiness report.
        </p>
      </LegalSection>

      {/* ------------------------------------------------- what survives */}
      <LegalSection id="deletion-limits" title="What deletion does not remove, and why">
        <p>
          Some records cannot be deleted on request, because deleting them would either destroy
          somebody&rsquo;s accounting record or remove the evidence that a person agreed to
          something. Pith says which, rather than quietly keeping everything.
        </p>
        <ul>
          <li>
            <strong>Your shop&rsquo;s sales, refunds, expenses and stock movements.</strong> These
            are the shop&rsquo;s business records, not yours. They stay because the shop needs them
            to defend or enforce its own position, and because Kenyan tax and accounting rules set a
            floor that this software does not get to choose. Deleting them would also make the
            shop&rsquo;s stock figures stop reconciling.
          </li>
          <li>
            <strong>The operator column on those records.</strong> A sale records which team member
            made it. That attribution is the audit trail. Your personal profile is deleted; the fact
            that an account made the sale is not.
          </li>
          <li>
            <strong>Consent records.</strong> After your account closes, your name is removed and
            only a one-way hash of your account ID remains, so the record that you agreed to
            something still exists and still cannot be read back into a person.
          </li>
          <li>
            <strong>Debtor balances.</strong> If you owe a shop money, the balance is the
            shop&rsquo;s claim. The shop, not Pith, decides when to write it off.
          </li>
        </ul>
        <p>
          Because of this,{" "}
          <strong>you cannot delete your account while you still own a shop</strong>. The app will
          tell you which shops and ask you to transfer or close them first. That is deliberate: an
          accidental tap should not be able to take a business&rsquo;s ledger with it.
        </p>
      </LegalSection>

      {/* ---------------------------------------------------------- changes */}
      <LegalSection id="changes" title="When this policy changes">
        <p>
          This page carries a version number and a date, and both change when the substance changes.
          The version you agreed to at sign-up is stored against your account, so there is always an
          answer to &ldquo;which version did I agree to?&rdquo;.
        </p>
        <p>
          If a change affects what Pith does with your data, the change does not take effect
          silently: it is announced in the app before it applies, and material changes require you
          to accept them before you continue using the affected feature.
        </p>
        <p>
          Version history is kept alongside the published policies so an older version can always be
          read.
        </p>
      </LegalSection>

      {/* --------------------------------------------------------- children */}
      <LegalSection id="children" title="Children">
        <p>
          Pith is not directed at children and is not intended for use by anyone under the age of
          18. The product does not ask for an age, a date of birth, or any information that would
          identify a minor, and it has no feature that requires one.
        </p>
        <p>
          A shopkeeper in Kenya may of course employ or trade with people of any age, and Pith will
          record what a real business transaction requires. It will not build a feature that
          collects children&rsquo;s data as a matter of course. Any future feature that would
          require collecting a child&rsquo;s information is subject to a dedicated privacy and legal
          review, and will not be released until that review is complete.
        </p>
      </LegalSection>

      {/* ------------------------------------------------------------ email */}
      <LegalSection id="email" title="Email Pith sends you">
        <p>Pith separates two kinds of message, and does not confuse them.</p>
        <ul>
          <li>
            <strong>Account and service messages</strong> — a password reset, a confirmation, a
            security notice. These are not marketing, they are the service working, and they carry
            no unsubscribe link because unsubscribing from a password reset would leave you unable
            to get into your own shop.
          </li>
          <li>
            <strong>Product updates</strong> — news about Pith itself. These are optional, switched
            off unless you turn them on, and every one of them carries a one-tap unsubscribe.
            Turning them off does not affect the app.
          </li>
        </ul>
        <p>
          Pith does not sell, rent or share an email address, and does not send a shop&rsquo;s
          customer or debtor data to anyone.
        </p>
      </LegalSection>

      {/* ---------------------------------------------------------- contact */}
      <LegalSection id="contact" title="How to contact us">
        <p>
          For anything in this policy — a rights request, a security report, a question, or a
          correction — use <ConfigValue field="contactEmail" /> for general enquiries and{" "}
          <ConfigValue field="supportEmail" /> for support. You can also call{" "}
          <a
            href={`tel:${CONTACT_PHONE}`}
            className="font-medium text-ink underline underline-offset-4"
          >
            {CONTACT_PHONE}
          </a>
          . Postal correspondence goes to <ConfigValue field="postalAddress" /> (on the map:{" "}
          <a
            href={CONTACT_MAPS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-ink underline underline-offset-4"
          >
            directions
          </a>
          ).
        </p>
        <p>
          You can also lodge a request inside the app under{" "}
          <strong>Settings › Data &amp; privacy</strong>, which writes down what you asked and when,
          and gives you a reference you can quote.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
