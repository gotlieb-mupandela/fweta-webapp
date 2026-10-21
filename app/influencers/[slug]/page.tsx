import Link from "next/link";
import { notFound } from "next/navigation";

import { getPublicInfluencer } from "@/app/actions/influencer";
import { PlatformChip } from "@/components/platforms/platform-chip";
import { PublicChrome } from "@/components/public-chrome";
import { AvatarCircle } from "@/components/ui/avatar-circle";
import { Badge, Card, ListRow } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { RATE_TYPE_LABEL, ratePlatformLabel } from "@/lib/platforms/guides";
import { PLATFORM_LABEL, SOCIAL_PLATFORMS, profileUrl } from "@/lib/social/platforms";
import { formatMoney } from "@/lib/utils";

export default async function PublicInfluencerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getPublicInfluencer(slug);
  if (!data) notFound();

  const { profile, rates } = data;
  const session = await getSession();

  return (
    <PublicChrome>
      <div className="mx-auto max-w-3xl">
        <Link href="/influencers" className="section-link">
          ← All influencers
        </Link>

        <div className="mt-6 flex items-start gap-4">
          <AvatarCircle src={profile.avatarUrl} name={profile.displayName} size="lg" />
          <div className="min-w-0">
            <Badge tone="gold">{profile.niche}</Badge>
            <h1 className="mt-3 font-display text-4xl tracking-tight md:text-5xl">
              {profile.displayName}
            </h1>
            <p className="mt-2 text-lg text-muted">{profile.headline}</p>
            <p className="mt-1 text-sm text-muted-light">{profile.location}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {SOCIAL_PLATFORMS.filter((platform) => profile.socials?.[platform]).map((platform) => (
                <PlatformChip key={platform} platform={platform} />
              ))}
            </div>
          </div>
        </div>

        <Card className="mt-8">
          <h2 className="font-display text-xl">About</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">{profile.bio}</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {SOCIAL_PLATFORMS.map((platform) => {
              const value = profile.socials[platform];
              if (!value) return null;
              return (
                <li key={platform}>
                  <a
                    href={profileUrl(platform, value)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-gold-deep hover:underline"
                  >
                    {PLATFORM_LABEL[platform]}
                  </a>
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="mt-8">
          <h2 className="font-display text-2xl tracking-tight">Rate card</h2>
          {rates.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No active rates listed.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {rates.map((r) => (
                <li key={r.id}>
                  <ListRow>
                    <div>
                      <p className="font-medium">{r.title}</p>
                      <p className="text-sm text-muted">
                        {RATE_TYPE_LABEL[r.type] ?? r.type} · {ratePlatformLabel(r.platform)}
                      </p>
                    </div>
                    <p className="font-display text-lg">{formatMoney(r.priceCents)}</p>
                  </ListRow>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-10">
          {session?.roles.includes("brand") ? (
            <Link href={`/influencers/${slug}/book`}>
              <Button size="lg">Request booking</Button>
            </Link>
          ) : (
            <Link href={session ? "/dashboard" : "/signup?role=brand"}>
              <Button size="lg" variant="secondary">
                {session ? "Switch to brand role to book" : "Sign up as a brand"}
              </Button>
            </Link>
          )}
        </div>
      </div>
    </PublicChrome>
  );
}
