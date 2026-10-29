import type { Metadata } from "next";
import Link from "next/link";

import { PublicChrome } from "@/components/public-chrome";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Platform fees for fweta campaigns, bookings, and withdrawals are not published yet.",
};

export default function PricingPage() {
  return (
    <PublicChrome
      title="Pricing"
      description="Fees are not listed here until they are confirmed."
    >
      <article className="mx-auto max-w-3xl space-y-6 text-sm leading-relaxed text-muted">
        <p className="text-xs uppercase tracking-[0.14em] text-muted-light">
          TODO for Gotlieb: do not treat the lines below as prices.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Campaign fee: TODO. No percentage is published on this page.</li>
          <li>Booking fee: TODO. No percentage is published on this page.</li>
          <li>Withdrawal fee: TODO. No percentage is published on this page.</li>
        </ul>
        <p>
          Creator withdrawals already follow the product rule of at least N$100, paid by manual EFT
          after an admin sends the transfer. Brand deposits are recorded after the transfer is
          confirmed. There is no card charge.
        </p>
        <p>
          Questions about a future fee go through{" "}
          <Link href="/contact" className="text-foreground underline-offset-2 hover:underline">
            contact
          </Link>
          .
        </p>
      </article>
    </PublicChrome>
  );
}
