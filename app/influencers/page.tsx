import Link from "next/link";

import { listPublicInfluencers } from "@/app/actions/influencer";
import { PublicChrome } from "@/components/public-chrome";
import { AvatarCircle } from "@/components/ui/avatar-circle";
import { Badge, Card, EmptyState } from "@/components/ui/card";
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
    <PublicChrome
      title="Influencers"
      description="Browse creator profiles and book at listed rates."
    >
      <form className="flex flex-wrap gap-3">
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
                <Link href={`/influencers/${p.slug}`} className="block h-full">
                  <Card className="h-full transition hover:border-foreground/20 hover:shadow-[var(--shadow-lift)]">
                    <div className="flex items-start gap-3">
                      <AvatarCircle src={p.avatarUrl} name={p.displayName} />
                      <div className="min-w-0">
                        <h2 className="font-display text-xl tracking-tight">{p.displayName}</h2>
                        <p className="mt-1 text-sm leading-relaxed text-muted">{p.headline}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge tone="gold">{p.niche}</Badge>
                      <Badge tone="muted">{p.location}</Badge>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PublicChrome>
  );
}
