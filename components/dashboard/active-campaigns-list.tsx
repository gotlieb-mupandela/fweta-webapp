import { listActiveCampaignsPublic } from "@/app/actions/campaigns";
import { SubmitClipForm } from "@/components/forms/submit-clip-form";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils";

export async function ActiveCampaignsList({
  emptyDescription = "Check back soon for new opportunities.",
}: {
  emptyDescription?: string;
}) {
  const campaigns = await listActiveCampaignsPublic();

  if (campaigns.length === 0) {
    return <EmptyState title="No active campaigns" description={emptyDescription} />;
  }

  return (
    <ul className="space-y-4">
      {campaigns.map((c) => (
        <li key={c.id}>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-xl">{c.title}</h3>
                <p className="mt-1 text-sm text-muted">
                  {c.description.length > 160 ? `${c.description.slice(0, 160)}…` : c.description}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone="gold">{c.type}</Badge>
                  <Badge>{c.category}</Badge>
                  <Badge tone="muted">CPM {formatMoney(c.cpmCents)}</Badge>
                </div>
              </div>
            </div>
            <div className="mt-4 border-t border-border pt-4">
              <SubmitClipForm campaignId={c.id} platforms={c.platforms} />
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
