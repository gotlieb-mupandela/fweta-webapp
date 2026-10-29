import type { Metadata } from "next";

import { PublicChrome } from "@/components/public-chrome";

export const metadata: Metadata = {
  title: "About",
  description: "fweta is a marketplace for brands and African creators, built in Windhoek.",
};

export default function AboutPage() {
  return (
    <PublicChrome title="About fweta" description="Brands pay for distribution. Creators set the terms.">
      <article className="mx-auto max-w-3xl space-y-6 text-sm leading-relaxed text-muted">
        <p>
          fweta is one workspace for two ways of working together. A brand can fund an open campaign
          and pay for qualified views, or book a creator at the rate that creator published.
        </p>
        <p>
          The product is built in Windhoek for African creators. Payouts in this version are manual
          Namibian EFT. There is no card checkout.
        </p>
        <p className="text-xs uppercase tracking-[0.14em] text-muted-light">
          TODO for Gotlieb: legal entity name, registered address, and registration number are not
          published on this page.
        </p>
      </article>
    </PublicChrome>
  );
}
