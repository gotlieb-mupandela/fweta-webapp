import Link from "next/link";

export default function StoryPage() {
  return (
    <main className="bg-atmosphere mx-auto min-h-screen max-w-2xl px-5 py-16 md:px-8">
      <p className="text-sm text-muted">Our story</p>
      <h1 className="mt-3 font-display text-4xl text-foreground md:text-5xl">
        Built in Windhoek for African creator commerce.
      </h1>
      <p className="mt-6 text-base leading-relaxed text-muted">
        Fweta brings two models together: open content-rewards campaigns where brands pay
        for distribution, and an influencer marketplace where creators set their own rates.
        One trust layer, transparent payouts, local-first operations.
      </p>
      <Link href="/" className="mt-8 inline-flex text-sm font-medium text-foreground">
        ← Back home
      </Link>
    </main>
  );
}
