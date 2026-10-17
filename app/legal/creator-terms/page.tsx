import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Creator terms",
  description: "Earnings, submissions, and manual EFT withdrawals for fweta creators.",
};

export default function CreatorTermsPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-6 text-sm leading-relaxed text-muted">
      <h1 className="font-display text-4xl tracking-tight text-foreground">Creator terms</h1>
      <p className="text-xs uppercase tracking-[0.14em] text-muted-light">
        Draft for counsel review · Last updated 17 October 2026
      </p>
      <p>
        These terms apply if you join fweta as a clipper, an influencer, or both. They sit alongside
        the{" "}
        <Link href="/legal/terms" className="text-foreground underline-offset-2 hover:underline">
          terms of use
        </Link>
        .
      </p>
      <h2 className="font-display text-2xl text-foreground">Clip campaigns</h2>
      <p>
        Open campaigns pay from the brand&apos;s budget at the CPM the brand set, up to the
        per-video cap, and only while the campaign is active and still funded. You submit a public
        link on an allowed platform. Views that look non-genuine, paid, or outside the rules are
        not payable. Approval is manual in this version. Posting a clip does not by itself create
        a debt owed by fweta.
      </p>
      <h2 className="font-display text-2xl text-foreground">Influencer bookings</h2>
      <p>
        Your rate card is your price. A brand request holds that amount from the brand wallet. You
        may accept or decline. Delivery and brand approval release the hold to your wallet. If the
        booking is declined or cancelled under the product rules, the hold returns to the brand.
      </p>
      <h2 className="font-display text-2xl text-foreground">Withdrawals</h2>
      <p>
        You can request a withdrawal from available balance once you have saved a payout method and
        the amount is at least N$100. The request moves that amount from available to pending.
        An admin pays it by manual EFT to the account you saved, then marks it paid. If the request
        is rejected, the amount returns to available balance. fweta does not store your card and
        does not push payouts through a payment gateway in this version.
      </p>
      <h2 className="font-display text-2xl text-foreground">View counts</h2>
      <p>
        Campaign earnings use the view count the operator records. This version does not read
        counts from TikTok, Instagram, YouTube, or X.
      </p>
      <h2 className="font-display text-2xl text-foreground">Your content and conduct</h2>
      <p>
        You are responsible for the posts you submit and for having the rights to them. Do not
        inflate views, misrepresent a brand, or share someone else&apos;s payout details. Suspended
        accounts do not earn and cannot withdraw.
      </p>
      <p>These creator terms are a working draft until counsel review.</p>
    </article>
  );
}
