import type { Metadata } from "next";
import Link from "next/link";

import { PublicChrome } from "@/components/public-chrome";

export const metadata: Metadata = {
  title: "Contact",
  description: "How to reach fweta. A public email, phone, and address are not published yet.",
};

export default function ContactPage() {
  return (
    <PublicChrome title="Contact" description="A public mailbox and phone number are not listed yet.">
      <article className="mx-auto max-w-3xl space-y-6 text-sm leading-relaxed text-muted">
        <p className="text-xs uppercase tracking-[0.14em] text-muted-light">
          TODO for Gotlieb: public email, phone number, and postal address.
        </p>
        <p>
          Signed-in accounts can write from Support in the dashboard. That form stays inside the
          workspace and does not publish a mailbox here.
        </p>
        <p>
          <Link href="/login" className="text-foreground underline-offset-2 hover:underline">
            Log in
          </Link>{" "}
          to open Support, or read the{" "}
          <Link href="/faq" className="text-foreground underline-offset-2 hover:underline">
            FAQ
          </Link>
          .
        </p>
      </article>
    </PublicChrome>
  );
}
