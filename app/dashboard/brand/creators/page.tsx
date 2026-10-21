import Link from "next/link";
import { redirect } from "next/navigation";

import { listPublicInfluencers } from "@/app/actions/influencer";
import { AvatarCircle } from "@/components/ui/avatar-circle";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";

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

      <form className="flex flex-wrap gap-3">
        <input
          name="q"
          defaultValue={params.q}
          placeholder="Search name or niche"
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

      {creators.length === 0 ? (
        <EmptyState
          title="No creators yet"
          description="Creators appear here after they finish onboarding. Try a broader search."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {creators.map((creator) => (
            <li key={creator.id}>
              <Link href={`/influencers/${creator.slug}`} className="block h-full">
                <Card className="h-full transition hover:border-foreground/20">
                  <div className="flex items-start gap-3">
                    <AvatarCircle src={creator.avatarUrl} name={creator.displayName} />
                    <div className="min-w-0">
                      <h2 className="font-display text-xl tracking-tight">{creator.displayName}</h2>
                      <p className="mt-1 text-sm leading-relaxed text-muted">{creator.headline}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge tone="gold">{creator.niche}</Badge>
                    <Badge tone="muted">{creator.location}</Badge>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
