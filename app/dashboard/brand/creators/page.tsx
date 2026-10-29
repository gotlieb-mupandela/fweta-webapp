import Link from "next/link";
import { redirect } from "next/navigation";

import { listPublicInfluencers } from "@/lib/influencers/public";
import { AvatarCircle } from "@/components/ui/avatar-circle";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { cleanDisplayName } from "@/lib/text/display-name";

export default async function BrandCreatorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; niche?: string }>;
}) {
  const session = await getSession();
  if (!session?.roles.includes("brand") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const creators = await listPublicInfluencers({
    q: params.q,
    niche: params.niche,
  });

  return (
    <div className="dash-stack">
      <PageHeader
        title="Creators"
        description="Influencers and clippers who finished setup. Open a profile to view rates and request a booking."
      />

      <form className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-[minmax(0,1fr)_10rem_auto] min-[400px]:items-center">
        <input
          name="q"
          defaultValue={params.q}
          placeholder="Search name or niche"
          aria-label="Search name or niche"
          className="input-capsule h-11 w-full min-w-0"
        />
        <input
          name="niche"
          defaultValue={params.niche}
          placeholder="Niche"
          aria-label="Niche"
          className="input-capsule h-11 w-full min-w-0"
        />
        <Button type="submit" size="sm" className="w-fit">
          Search
        </Button>
      </form>

      {creators.length === 0 ? (
        <EmptyState
          title="No creators yet"
          description="Creators appear here after they finish onboarding. Try a broader search."
        />
      ) : (
        <ul className="creator-grid creator-grid-2">
          {creators.map((creator) => {
            const name = cleanDisplayName(creator.displayName) || "Creator";
            return (
            <li key={creator.id} className="min-w-0">
              <Link href={`/influencers/${creator.slug}`} className="block h-full min-w-0">
                <Card className="h-full min-w-0 overflow-hidden transition hover:border-foreground/20">
                  <div className="flex min-w-0 items-start gap-3">
                    <AvatarCircle src={creator.avatarUrl} name={name} />
                    <div className="min-w-0">
                      <h2 className="wrap-anywhere font-display text-xl tracking-tight">{name}</h2>
                      <p className="mt-1 wrap-anywhere text-sm leading-relaxed text-muted">{creator.headline}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge tone="gold">{creator.niche}</Badge>
                    <Badge tone="muted">{creator.location}</Badge>
                  </div>
                </Card>
              </Link>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
