import Link from "next/link";

import { PlatformPicker } from "@/components/platforms/platform-picker";
import { PostingGuide } from "@/components/platforms/posting-guide";
import { PublicChrome } from "@/components/public-chrome";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { readStore } from "@/lib/db/store";
import { PLATFORM_GUIDES } from "@/lib/platforms/guides";
import {
  campaignCardExcerpt,
  campaignTypeLabel,
  filterPublicCampaignList,
  normalizePlatform,
} from "@/lib/public/campaigns";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; platform?: string }>;
}) {
  const params = await searchParams;
  const store = await readStore();
  const campaigns = filterPublicCampaignList(store.campaigns, {
    q: params.q,
    type: params.type,
    platform: params.platform,
  });
  const platform = normalizePlatform(params.platform);
  const platformLabel = platform ? PLATFORM_GUIDES[platform].label : null;

  return (
    <PublicChrome
      title="Open campaigns"
      description="Browse content rewards campaigns and start earning."
    >
      <PlatformPicker basePath="/campaigns" params={params} />
      {platform ? (
        <div className="mt-4">
          <PostingGuide platforms={[platform]} />
        </div>
      ) : null}
      <form className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_10rem_auto]" action="/campaigns" method="get">
        <input
          name="q"
          defaultValue={params.q}
          placeholder="Search…"
          className="input-capsule col-span-2 h-11 sm:col-span-1"
        />
        <select name="type" defaultValue={params.type ?? ""} className="input-capsule h-11">
          <option value="">All types</option>
          <option value="clipping">Clipping</option>
          <option value="ugc">UGC</option>
        </select>
        <select name="platform" defaultValue={platform ?? ""} className="input-capsule h-11">
          <option value="">All platforms</option>
          <option value="tiktok">TikTok</option>
          <option value="youtube">YouTube</option>
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
          <option value="x">X</option>
        </select>
        <Button type="submit" size="sm" className="col-span-2 h-11 sm:col-span-1">
          Filter
        </Button>
      </form>

      {platformLabel ? (
        <p className="mt-4 text-sm text-muted">Showing {platformLabel} campaigns.</p>
      ) : null}

      <div className="mt-10">
        {campaigns.length === 0 ? (
          <EmptyState
            title="No campaigns found"
            description={
              platformLabel
                ? `Nothing open on ${platformLabel} matches these filters.`
                : "Try adjusting your filters."
            }
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {campaigns.map((c) => (
              <li key={c.id}>
                <Link href={`/campaigns/${c.id}`} className="block h-full">
                  <Card className="h-full transition hover:border-foreground/20 hover:shadow-[var(--shadow-lift)]">
                    <h2 className="font-display text-xl tracking-tight">{c.title}</h2>
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">
                      {campaignCardExcerpt(c)}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge tone="gold">{campaignTypeLabel(c.type)}</Badge>
                      <Badge>{c.category}</Badge>
                      <Badge tone="muted">CPM {formatMoney(c.cpmCents)}</Badge>
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
