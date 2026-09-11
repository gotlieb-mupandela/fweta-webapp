import Link from "next/link";

import { listActiveCampaignsPublic } from "@/app/actions/campaigns";
import { listClipperSubmissions } from "@/app/actions/submissions";
import { SubmitClipForm } from "@/components/forms/submit-clip-form";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils";

export async function ActiveCampaignsList({
  emptyDescription = "Check back soon for new opportunities.",
  emptyAction,
}: {
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
}) {
  const [campaigns, submissions] = await Promise.all([
    listActiveCampaignsPublic(),
    listClipperSubmissions(),
  ]);

  if (campaigns.length === 0) {
    return (
      <EmptyState title="No active campaigns" description={emptyDescription} action={emptyAction} />
    );
  }

  return (
    <ul className="space-y-4">
      {campaigns.map((c) => {
        const remaining = Math.max(0, c.budgetTotalCents - c.budgetSpentCents);
        const excerpt =
          c.description.length > 180 ? `${c.description.slice(0, 180)}…` : c.description;
        const mine = submissions.filter((s) => s.campaignId === c.id);
        return (
          <li key={c.id}>
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-xl">{c.title}</h3>
                  <p className="mt-1 text-sm text-muted">{excerpt}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge tone="gold">{c.type}</Badge>
                    <Badge>{c.category}</Badge>
                    <Badge tone="muted">CPM {formatMoney(c.cpmCents)}</Badge>
                    <Badge tone="muted">Max {formatMoney(c.maxPayoutPerSubmissionCents)}</Badge>
                    <Badge tone="muted">Left {formatMoney(remaining)}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    {c.platforms.join(" · ")}
                    {c.endDate ? ` · Ends ${c.endDate.slice(0, 10)}` : ""}
                  </p>
                  {c.requirements ? (
                    <p className="mt-2 whitespace-pre-wrap text-xs text-muted">{c.requirements}</p>
                  ) : null}
                  <Link
                    href={`/campaigns/${c.id}`}
                    className="mt-2 inline-block text-xs text-gold hover:underline"
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
              <div className="mt-4 border-t border-border pt-4">
                <SubmitClipForm
                  campaignId={c.id}
                  platforms={c.platforms}
                  remainingBudgetCents={remaining}
                />
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
