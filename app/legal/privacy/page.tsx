import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "How fweta handles account, wallet, and bank-detail data.",
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-6 text-sm leading-relaxed text-muted">
      <h1 className="font-display text-4xl tracking-tight text-foreground">Privacy notice</h1>
      <p className="text-xs uppercase tracking-[0.14em] text-muted-light">
        Draft for counsel review · POPIA-aligned practices · Last updated 17 October 2026
      </p>
      <p>
        fweta processes personal information to run accounts, campaigns, bookings, and manual
        payouts for users in Namibia and elsewhere in the region. The operator is the fweta
        business published on fweta.com, based in Windhoek.
      </p>
      <h2 className="font-display text-2xl text-foreground">What we store</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>Account data: name, email, password hash, roles, profile, and social handles you add.</li>
        <li>Workspace data: campaigns, submissions, bookings, view snapshots, and messages you send in the product.</li>
        <li>Money data: wallet balances, ledger entries, deposit notes, and withdrawal requests.</li>
        <li>
          Payout data: bank name, branch code, account type, account holder, and the account number
          encrypted at rest. The full number is shown to admins only while paying an EFT.
        </li>
        <li>Technical data: session cookie, and error reports if an error webhook is configured.</li>
      </ul>
      <h2 className="font-display text-2xl text-foreground">Why</h2>
      <p>
        We use this information to authenticate you, operate the marketplace, calculate earnings,
        pay withdrawals, investigate fraud, and keep the service reliable. We do not sell personal
        information. We do not send it to a card network, because this version does not use a
        payment gateway.
      </p>
      <h2 className="font-display text-2xl text-foreground">Where it lives</h2>
      <p>
        Production data is intended to live in a Supabase Postgres project chosen by the operator,
        with the app hosted on Vercel. Local development can use a file on the developer machine.
        Bank account numbers are encrypted with a key that stays in the host environment.
      </p>
      <h2 className="font-display text-2xl text-foreground">Sharing</h2>
      <p>
        Admins see the payout details they need to send an EFT. A brand sees the creator content
        submitted to that brand&apos;s campaign. Public influencer profiles show only what the
        creator publishes. Processors (hosting, database, optional error reporting, optional view
        polling) receive the minimum required to perform that job.
      </p>
      <h2 className="font-display text-2xl text-foreground">Retention and your requests</h2>
      <p>
        Ledger and withdrawal records are kept so balances can be explained later. You may ask for
        a copy of your account data or for deletion of profile fields that we do not have to keep
        for a payout, dispute, or legal duty. Email the contact address on fweta.com. We will not
        delete a ledger row that is the only record of a balance movement.
      </p>
      <p>
        This notice is a working draft. It is written to support POPIA-style limits (purpose,
        minimisation, security, and access) and should be reviewed by counsel before go-live.
      </p>
    </article>
  );
}
