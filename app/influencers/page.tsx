import Link from "next/link";

import { listPublicInfluencers } from "@/lib/influencers/public";
import { PlatformChip } from "@/components/platforms/platform-chip";
import { PublicChrome } from "@/components/public-chrome";
import { AvatarCircle } from "@/components/ui/avatar-circle";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cleanDisplayName } from "@/lib/text/display-name";
import type { SocialPlatform } from "@/types/enums";

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
      <form className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-[minmax(0,1fr)_10rem_auto] min-[400px]:items-center" role="search">
        <label className="sr-only" htmlFor="influencer-q">
          Search influencers
        </label>
        <input
          id="influencer-q"
          name="q"
          defaultValue={params.q}
          placeholder="Search…"
          className="input-capsule h-11 w-full min-w-0"
        />
        <label className="sr-only" htmlFor="influencer-niche">
          Niche
        </label>
        <input
          id="influencer-niche"
          name="niche"
          defaultValue={params.niche}
          placeholder="Niche"
          className="input-capsule h-11 w-full min-w-0"
        />
        <Button type="submit" size="sm" className="w-fit">
          Search
        </Button>
      </form>

      <div className="mt-10">
        {influencers.length === 0 ? (
          <EmptyState title="No influencers found" description="Try a different search." />
        ) : (
          <ul className="creator-grid creator-grid-3">
            {influencers.map((p) => {
              const name = cleanDisplayName(p.displayName) || "Creator";
              return (
              <li key={p.id} className="min-w-0">
                <Link href={`/influencers/${p.slug}`} className="block h-full min-w-0">
                  <Card className="h-full min-w-0 overflow-hidden transition hover:border-foreground/20 hover:shadow-[var(--shadow-lift)]">
                    <div className="flex min-w-0 items-start gap-3">
                      <AvatarCircle src={p.avatarUrl} name={name} />
                      <div className="min-w-0">
                        <h2 className="wrap-anywhere font-display text-xl tracking-tight">{name}</h2>
                        <p className="mt-1 wrap-anywhere text-sm leading-relaxed text-muted">{p.headline}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge tone="gold">{p.niche}</Badge>
                      <Badge tone="muted">{p.location}</Badge>
                      {(["tiktok", "instagram", "facebook", "youtube", "x"] as const)
                        .filter((platform): platform is SocialPlatform => Boolean(p.socials?.[platform]))
                        .map((platform) => (
                          <PlatformChip key={platform} platform={platform} />
                        ))}
                    </div>
                  </Card>
                </Link>
              </li>
              );
            })}
          </ul>
        )}
      </div>
    </PublicChrome>
  );
}
