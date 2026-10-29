import Link from "next/link";
import { redirect } from "next/navigation";

import { listClipperSubmissions } from "@/app/actions/submissions";
import { SubmitClipForm } from "@/components/forms/submit-clip-form";
import { PlatformPicker } from "@/components/platforms/platform-picker";
import { PostingGuide } from "@/components/platforms/posting-guide";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { PLATFORM_GUIDES } from "@/lib/platforms/guides";
import {
  campaignCardExcerpt,
  campaignTypeLabel,
  cleanCampaignCardText,
  filterPublicCampaignList,
  normalizePlatform,
} from "@/lib/public/campaigns";
import { PLATFORM_LABEL } from "@/lib/social/platforms";
import { formatMoney } from "@/lib/utils";

export default async function ClipperCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string; q?: string; type?: string }>;
}) {
  const session = await getSession();
  if (
    !session?.roles.includes("clipper") &&
    !session?.roles.includes("influencer") &&
    !session?.roles.includes("admin")
  ) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const [store, submissions] = await Promise.all([readStore(), listClipperSubmissions()]);
  const campaigns = filterPublicCampaignList(store.campaigns, {
    platform: params.platform,
    q: params.q,
    type: params.type,
  });
  const platform = normalizePlatform(params.platform);
  const platformLabel = platform ? PLATFORM_GUIDES[platform].label : null;

  return (
    <div className="dash-stack">
      <PageHeader
        title="Active campaigns"
        description="Join open campaigns and submit your clips."
      />
      <PlatformPicker basePath="/dashboard/clipper/campaigns" params={params} />
      {platform ? <PostingGuide platforms={[platform]} /> : null}
      {platformLabel ? <p className="text-sm text-muted">Showing {platformLabel} campaigns.</p> : null}

      {campaigns.length === 0 ? (
        <EmptyState
          title="No active campaigns"
          description="Check back soon for new clipping and UGC opportunities."
          action={
            <Link href="/campaigns">
              <Button size="sm" variant="secondary">
                Browse marketplace
              </Button>
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3.5">
          {campaigns.map((c) => {
            const remaining = Math.max(0, c.budgetTotalCents - c.budgetSpentCents);
            const cleaned = campaignCardExcerpt(c);
            const excerpt = cleaned.length > 180 ? `${cleaned.slice(0, 180)}…` : cleaned;
            const mine = submissions.filter((s) => s.campaignId === c.id);
            return (
              <li key={c.id}>
                <Card className="panel-interactive">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-xl tracking-tight">{c.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted">{excerpt}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge tone="gold">{campaignTypeLabel(c.type)}</Badge>
                        <Badge>{c.category}</Badge>
                        <Badge tone="muted">CPM {formatMoney(c.cpmCents)}</Badge>
                        <Badge tone="muted">Max {formatMoney(c.maxPayoutPerSubmissionCents)}</Badge>
                        <Badge tone="muted">Left {formatMoney(remaining)}</Badge>
                      </div>
                      <p className="mt-2.5 text-xs text-muted">
                        {c.platforms.map((platform) => PLATFORM_LABEL[platform] ?? platform).join(" · ")}
                        {c.endDate ? ` · Ends ${c.endDate.slice(0, 10)}` : ""}
                      </p>
                      {cleanCampaignCardText(c.requirements ?? "") ? (
                        <p className="mt-2 whitespace-pre-wrap text-xs text-muted">
                          {cleanCampaignCardText(c.requirements ?? "")}
                        </p>
                      ) : null}
                      <Link
                        href={`/campaigns/${c.id}`}
                        className="mt-2.5 inline-block text-xs font-medium text-gold-deep hover:underline"
                      >
                        Open campaign page →
                      </Link>
                    </div>
                  </div>
                  {mine.length > 0 ? (
                    <p className="mt-3 text-xs text-muted">
                      You have {mine.length} submission{mine.length === 1 ? "" : "s"} on this campaign
                      ({mine.map((s) => s.status).join(", ")}).
                    </p>
                  ) : null}
                  <div className="mt-4 border-t border-border/80 pt-4">
                    <PostingGuide platforms={c.platforms} />
                    <div className="mt-4">
                      <SubmitClipForm
                        campaignId={c.id}
                        platforms={c.platforms}
                        remainingBudgetCents={remaining}
                      />
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
