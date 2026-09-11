import Link from "next/link";
import { redirect } from "next/navigation";

import { ActiveCampaignsList } from "@/components/dashboard/active-campaigns-list";
import { PageHeader } from "@/components/ui/card";
import { canJoinCampaigns } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";

export default async function ClipperCampaignsPage() {
  const session = await getSession();
  if (!canJoinCampaigns(session?.roles)) {
    redirect("/dashboard");
  }

  return (
    <div>
      <PageHeader
        title="Active campaigns"
        description="Join open campaigns and submit your clips."
      />
      <ActiveCampaignsList
        emptyDescription="Check back soon for new clipping and UGC opportunities."
        emptyAction={
          <Link href="/campaigns" className="text-sm text-gold hover:underline">
            Browse the public marketplace →
          </Link>
        }
      />
    </div>
  );
}
