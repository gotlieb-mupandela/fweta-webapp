import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "Terms for using the fweta workspace, campaigns, bookings, and manual payouts.",
};

export default function TermsPage() {
  return (
    <article className="legal-copy mx-auto max-w-3xl space-y-6 text-sm leading-relaxed text-muted">
      <h1 className="font-display text-4xl tracking-tight text-foreground">Terms of use</h1>
      <p className="text-xs uppercase tracking-[0.14em] text-muted-light">
        Draft for counsel review · Windhoek · Last updated 17 October 2026
      </p>
      <p>
        These terms govern the fweta workspace at app.fweta.com, operated from Windhoek, Namibia.
        fweta is a marketplace where brands fund creator distribution and creators earn for approved
        work. By creating an account you agree to these terms, the{" "}
        <Link href="/legal/privacy" className="text-foreground underline-offset-2 hover:underline">
          privacy notice
        </Link>
        , and, if you earn on the platform, the{" "}
        <Link href="/legal/creator-terms" className="text-foreground underline-offset-2 hover:underline">
          creator terms
        </Link>
        .
      </p>
      <h2 className="font-display text-2xl text-foreground">Accounts</h2>
      <p>
        You must provide a working email and keep your password confidential. One person may hold
        more than one role (brand, influencer, clipper). You may not create an admin account.
        fweta may suspend an account that is used for fraud, abuse, or to move money that was not
        actually received.
      </p>
      <h2 className="font-display text-2xl text-foreground">Money</h2>
      <p>
        Amounts are stored in cents and shown in Namibian dollars (NAD). Brand wallet credits in
        this version are manual: a deposit is recorded in the app after funds are confirmed, and
        creator withdrawals are paid by manual EFT. There is no card or instant-payment gateway on
        this version of the product. Minimum withdrawal is N$100. fweta may refuse a withdrawal
        that fails a fraud or identity check.
      </p>
      <p>
        Campaign budgets and influencer booking escrow move inside the wallet ledger. A balance
        change is paired with a ledger entry. Funds held for a campaign or booking are not
        available to withdraw until the product rules release them.
      </p>
      <h2 className="font-display text-2xl text-foreground">Campaigns and bookings</h2>
      <p>
        Brands set the price on open campaigns. Influencers set the price on rate cards. Bookings
        are request and accept, not instant purchase. fweta does not guarantee views, approvals, or
        that a campaign budget will last until the end date.
      </p>
      <h2 className="font-display text-2xl text-foreground">Acceptable use</h2>
      <p>
        Do not submit bought views, bots, or content that infringes someone else&apos;s rights. Do
        not attempt to access another user&apos;s wallet, bank details, or session. Bank details
        are collected only to pay a withdrawal and must not be copied out of the admin queue except
        to complete that EFT.
      </p>
      <h2 className="font-display text-2xl text-foreground">Liability</h2>
      <p>
        The workspace is provided as available software. fweta is not liable for social-network
        outages, delayed view counts, or a bank transfer that fails because the payout details were
        wrong. Nothing here limits liability that Namibian law does not allow to be limited.
      </p>
      <p>
        Questions: use the contact address published on fweta.com. These terms are a working draft
        until a lawyer instructed by the operator signs off.
      </p>
    </article>
  );
}
