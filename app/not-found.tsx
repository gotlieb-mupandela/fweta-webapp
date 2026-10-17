import type { Metadata } from "next";
import Link from "next/link";

import { LegalFooter } from "@/components/legal-footer";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main
      id="main"
      className="bg-atmosphere flex min-h-[70vh] flex-col items-center justify-center px-6 text-center"
    >
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-light">404</p>
      <h1 className="mt-3 font-display text-3xl tracking-tight text-foreground md:text-4xl">
        Page not found
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
        That link does not match a page in the fweta workspace.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link href="/login">
          <Button>Sign in</Button>
        </Link>
        <Link href="/campaigns">
          <Button variant="secondary">Browse campaigns</Button>
        </Link>
      </div>
      <LegalFooter className="mt-10" />
    </main>
  );
}
