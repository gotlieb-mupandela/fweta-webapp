import Link from "next/link";

import { CheckCapsule, Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";

export default async function MarketingHomePage() {
  let session: Awaited<ReturnType<typeof getSession>> = null;
  try {
    session = await getSession();
  } catch {
    // Keep marketing page online if session/cookies fail on serverless.
  }

  return (
    <div className="bg-atmosphere min-h-screen">
      <header className="mx-auto flex w-full max-w-lg items-center justify-between px-5 pt-5 animate-fade-in md:max-w-3xl md:px-8">
        <Logo />
        <div className="flex items-center gap-2">
          {session ? (
            <Link href="/dashboard">
              <Button size="sm">Dashboard</Button>
            </Link>
          ) : (
            <Link href="/signup">
              <Button size="sm">Waitlist</Button>
            </Link>
          )}
          <Link
            href={session ? "/dashboard" : "/login"}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-foreground"
            aria-label="Menu"
          >
            <svg width="16" height="12" viewBox="0 0 16 12" fill="none" aria-hidden>
              <path d="M1 1h14M1 6h14M1 11h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-col px-5 pb-16 pt-14 md:max-w-3xl md:px-8 md:pt-20">
        <h1 className="animate-fade-up font-display text-[2.65rem] leading-[1.08] text-foreground md:text-6xl">
          Turn real <span className="italic text-gold">influence</span> into real{" "}
          <span className="italic text-gold">income</span>.
        </h1>

        <p className="animate-fade-up delay-1 mt-5 max-w-xl text-[15px] leading-relaxed text-muted md:text-base">
          Fweta connects African creators, businesses, and consumers through verified
          campaigns and transparent payouts. One platform, one trust layer, real results.
        </p>

        <div className="animate-fade-up delay-2 mt-8 flex flex-col gap-3">
          <CheckCapsule>Budget capped upfront</CheckCapsule>
          <CheckCapsule>Accept before you create</CheckCapsule>
        </div>

        <div className="animate-fade-up delay-3 mt-8 flex flex-col gap-3 sm:max-w-md">
          <Link href={session ? "/dashboard/clipper" : "/signup?role=creator"}>
            <Button size="lg">I&apos;m a Creator</Button>
          </Link>
          <Link href={session ? "/dashboard/brand" : "/signup?role=brand"}>
            <Button size="lg" variant="secondary">
              I&apos;m a Business
            </Button>
          </Link>
        </div>

        <div className="animate-fade-up delay-4 mt-10 space-y-2">
          <p className="text-sm text-muted-light">Windhoek-built · Namibia · creator marketplace</p>
          <Link href="/story" className="inline-flex items-center gap-1 text-sm font-medium text-foreground">
            Our story <span aria-hidden>→</span>
          </Link>
        </div>
      </main>

      <section className="border-t border-border/80 bg-white/70">
        <div className="mx-auto grid max-w-5xl gap-10 px-5 py-14 md:grid-cols-3 md:px-8">
          {[
            {
              title: "Content rewards",
              body: "Brands set CPM and budget. Clippers earn per verified view until the budget is gone.",
            },
            {
              title: "Influencer booking",
              body: "Creators publish rate cards. Brands book at listed rates with escrow protection.",
            },
            {
              title: "Transparent payouts",
              body: "Wallet balances, ledger history, and manual EFT withdrawals reviewed by admin.",
            },
          ].map((item) => (
            <div key={item.title} className="space-y-2">
              <h2 className="font-display text-2xl text-foreground">{item.title}</h2>
              <p className="text-sm leading-relaxed text-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border px-5 py-8 text-center text-sm text-muted md:px-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 sm:flex-row">
          <Logo />
          <div className="flex gap-5">
            <Link href="/campaigns">Campaigns</Link>
            <Link href="/influencers">Influencers</Link>
            <Link href="/login">Log in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
