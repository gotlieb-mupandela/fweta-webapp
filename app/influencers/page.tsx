import Link from "next/link";

import { listPublicInfluencers } from "@/app/actions/influencer";
import { Logo } from "@/components/brand/logo";
import { Badge, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function InfluencersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; niche?: string }>;
}) {
  const params = await searchParams;
  const influencers = await listPublicInfluencers({
    q: params.q,
    niche: params.niche,
  });

  return (
    <div className="bg-atmosphere min-h-screen">
      <header className="border-b border-border/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 md:px-8">
          <Logo href="/" />
          <Link href="/login">
            <Button size="sm" variant="secondary">
              Log in
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10 md:px-8">
        <h1 className="font-display text-4xl tracking-tight">Influencers</h1>
        <p className="mt-2 text-muted">Browse creator profiles and book at listed rates.</p>

        <form className="mt-8 flex flex-wrap gap-3">
          <input
            name="q"
            defaultValue={params.q}
            placeholder="Search…"
            className="input-capsule h-11 min-w-[200px] flex-1"
          />
          <input
            name="niche"
            defaultValue={params.niche}
            placeholder="Niche"
            className="input-capsule h-11 w-40"
          />
          <Button type="submit" size="sm">
            Search
          </Button>
        </form>

        <div className="mt-10">
          {influencers.length === 0 ? (
            <EmptyState title="No influencers found" description="Try a different search." />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {influencers.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/influencers/${p.slug}`}
                    className="block rounded-3xl border border-border bg-white p-5 hover:border-foreground/20"
                  >
                    <h2 className="font-display text-xl">{p.displayName}</h2>
                    <p className="mt-1 text-sm text-muted">{p.headline}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge tone="gold">{p.niche}</Badge>
                      <Badge tone="muted">{p.location}</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
