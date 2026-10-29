import type { Metadata } from "next";
import Link from "next/link";

import { PublicChrome } from "@/components/public-chrome";
import { HELP_ARTICLES } from "@/lib/onboarding/help";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Short answers for setup, campaigns, bookings, and payouts on fweta.",
};

export default function FaqPage() {
  const groups = [...new Set(HELP_ARTICLES.map((article) => article.group))];

  return (
    <PublicChrome title="FAQ" description="The same answers as the help center, on a public page.">
      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group}>
            <h2 className="font-display text-2xl tracking-tight">{group}</h2>
            <div className="mt-3 space-y-3">
              {HELP_ARTICLES.filter((article) => article.group === group).map((article) => (
                <article key={article.id} className="rounded-2xl border border-border bg-white px-4 py-4">
                  <h3 className="text-sm font-medium">{article.question}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{article.answer}</p>
                </article>
              ))}
            </div>
          </section>
        ))}
        <p className="text-sm text-muted">
          More detail sits on{" "}
          <Link href="/help" className="text-foreground underline-offset-2 hover:underline">
            the help page
          </Link>
          .
        </p>
      </div>
    </PublicChrome>
  );
}
