import { redirect } from "next/navigation";

import { listActiveCampaignsPublic } from "@/app/actions/campaigns";
import { SubmitClipForm } from "@/components/forms/submit-clip-form";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { formatMoney } from "@/lib/utils";

export default async function ClipperCampaignsPage() {
  const session = await getSession();
  if (!session?.roles.includes("clipper") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const campaigns = await listActiveCampaignsPublic();

  return (
    <div>
      <PageHeader
        title="Active campaigns"
        description="Join open campaigns and submit your clips."
      />

      {campaigns.length === 0 ? (
        <EmptyState title="No active campaigns" description="Check back soon for new opportunities." />
      ) : (
        <ul className="space-y-4">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-xl">{c.title}</h3>
                    <p className="mt-1 text-sm text-muted">{c.description.slice(0, 160)}…</p>
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
      )}
    </div>
  );
}
