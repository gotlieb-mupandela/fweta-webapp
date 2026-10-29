import type { Metadata } from "next";
import Link from "next/link";

import { PublicChrome } from "@/components/public-chrome";

export const metadata: Metadata = {
  title: "Confirm your email",
  description: "Email confirmation is not turned on for fweta accounts yet.",
};

export default function VerifyEmailPage() {
  return (
    <PublicChrome title="Confirm your email" description="Signup does not send a verification link yet.">
      <article className="mx-auto max-w-3xl space-y-6 text-sm leading-relaxed text-muted">
        <p>
          Creating an account does not ask you to confirm the email address. There is no
          verification message to click.
        </p>
        <p className="text-xs uppercase tracking-[0.14em] text-muted-light">
          TODO for Gotlieb: confirm the sender address and whether signup should wait for a
          verified email.
        </p>
        <p>
          <Link href="/login" className="text-foreground underline-offset-2 hover:underline">
            Log in
          </Link>
          {" · "}
          <Link href="/signup" className="text-foreground underline-offset-2 hover:underline">
            Create an account
          </Link>
        </p>
      </article>
    </PublicChrome>
  );
}
