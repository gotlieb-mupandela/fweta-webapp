import Link from "next/link";

import { PlatformChip } from "@/components/platforms/platform-chip";
import { Badge } from "@/components/ui/card";
import { BudgetBar } from "@/components/rewards/budget-bar";
import type { Campaign } from "@/lib/db/types";
import { campaignCardExcerpt, campaignTypeLabel } from "@/lib/public/campaigns";
import { audienceLabel, remainingBudgetCents } from "@/lib/rewards/content-rewards";
import { formatMoney, formatNumber } from "@/lib/utils";

export function CampaignCard({
  campaign,
  approvedClips,
  href,
}: {
  campaign: Campaign;
  approvedClips: number;
  href: string;
}) {
  const remaining = remainingBudgetCents(campaign);
  const pool = campaign.payModel === "pool";
  return (
    <Link href={href} className="panel panel-interactive block h-full p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            {pool ? "Pool" : "CPM"} · {campaignTypeLabel(campaign.type)} · {campaign.category}
          </p>
          <h2 className="mt-1 font-display text-[1.55rem] leading-tight tracking-tight md:text-[1.75rem]">
            {campaign.title}
          </h2>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-2xl leading-none tracking-tight">
            {pool ? formatMoney(campaign.budgetTotalCents) : formatMoney(campaign.cpmCents)}
          </p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            {pool ? "pot" : "you receive / 1k"}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {campaign.platforms.map((platform) => (
          <PlatformChip key={platform} platform={platform} />
        ))}
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted">{campaignCardExcerpt(campaign)}</p>
      <BudgetBar campaign={campaign} className="mt-4" />
      <p className="mt-2 text-xs text-muted">
        {formatMoney(remaining)} left
        {campaign.endDate ? ` · Ends ${campaign.endDate.slice(0, 10)}` : " · Open until the budget ends"}
        {` · ${approvedClips} approved`}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge>Min {formatNumber(campaign.minViews)} views</Badge>
        <Badge tone="gold">Max {formatMoney(campaign.maxPayoutPerSubmissionCents)} per post</Badge>
      </div>
      <p className="mt-3 text-xs text-muted">{audienceLabel(campaign.countries)} · Brand approves each clip</p>
      <p className="mt-1 text-xs text-muted">
        {campaign.assets.length} source {campaign.assets.length === 1 ? "file" : "files"}
        {campaign.rules ? ` · ${campaignCardExcerpt({ description: campaign.rules.split("\n")[0] ?? "" })}` : ""}
      </p>
    </Link>
  );
}
