import { budgetUsedRatio } from "@/lib/rewards/content-rewards";
import type { Campaign } from "@/lib/db/types";
import { formatMoney } from "@/lib/utils";

export function BudgetBar({
  campaign,
  className = "",
}: {
  campaign: Pick<Campaign, "budgetSpentCents" | "budgetTotalCents">;
  className?: string;
}) {
  const ratio = budgetUsedRatio(campaign as Campaign);
  const pct = Math.round(ratio * 100);
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px] text-muted">
        <span>{formatMoney(campaign.budgetSpentCents)} paid</span>
        <span>
          {pct}% of {formatMoney(campaign.budgetTotalCents)}
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Budget used"
      >
        <div
          className="h-full rounded-full bg-gold"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
