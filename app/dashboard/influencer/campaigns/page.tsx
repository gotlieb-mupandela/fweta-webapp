import { redirect } from "next/navigation";

import { ActiveCampaignsList } from "@/components/dashboard/active-campaigns-list";
import { PageHeader } from "@/components/ui/card";
import { canJoinCampaigns } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";

export default async function InfluencerCampaignsPage() {
  const session = await getSession();
  if (!canJoinCampaigns(session?.roles)) {
    redirect("/dashboard");
  }

  return (
    <div>
      <PageHeader
        title="Open campaigns"
        description="Join clipping and UGC campaigns — earn per verified view."
      />
      <ActiveCampaignsList />
    </div>
  );
}
