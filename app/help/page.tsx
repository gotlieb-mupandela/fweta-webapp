import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { HELP_ARTICLES } from "@/lib/onboarding/help";

export const metadata: Metadata = {
  title: "Help",
  description: "Answers for the first campaign, the first clip, and the first payout.",
};

export default function HelpPage() {
  const groups = [...new Set(HELP_ARTICLES.map((article) => article.group))];

  return (
    <div className="bg-atmosphere min-h-dvh">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 md:py-12">
        <header className="mb-8 flex items-center justify-between gap-3">
          <Logo href="/" size="sm" />
          <Link href="/dashboard" className="text-sm font-medium text-muted hover:text-foreground">
            Back to workspace
          </Link>
        </header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-deep">Help center</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight">How fweta works</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
          Short answers for setup, campaigns, social accounts, brand teams, earnings, and the admin checks.
        </p>
        <div className="mt-8 space-y-8">
          {groups.map((group) => (
            <section key={group}>
              <h2 className="font-display text-2xl tracking-tight">{group}</h2>
              <div className="mt-3 space-y-3">
                {HELP_ARTICLES.filter((article) => article.group === group).map((article) => (
                  <article key={article.id} id={article.id} className="rounded-2xl bg-white px-5 py-5 shadow-[var(--shadow-card)]">
                    <h3 className="text-sm font-medium">{article.question}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{article.answer}</p>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
