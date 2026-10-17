import Link from "next/link";
import { redirect } from "next/navigation";

import { CampaignCard } from "@/components/rewards/campaign-card";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";

export default async function SavedCampaignsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const store = await readStore();
  const saved = store.savedCampaigns.filter((item) => item.userId === session.id);
  const rows = saved
    .map((item) => store.campaigns.find((campaign) => campaign.id === item.campaignId))
    .filter((campaign): campaign is NonNullable<typeof campaign> => Boolean(campaign));

  return (
    <div className="dash-stack">
      <PageHeader
        title="Saved campaigns"
        description="Campaigns you marked. A matching new campaign also shows up in notifications."
      />
      {rows.length === 0 ? (
        <EmptyState
          title="Nothing saved"
          description="Open a campaign and save it to come back later."
          action={
            <Link href="/dashboard/clipper/campaigns" className="section-link">
              Discover
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {rows.map((campaign) => (
            <li key={campaign.id}>
              <CampaignCard
                campaign={campaign}
                approvedClips={store.submissions.filter((item) => item.campaignId === campaign.id && item.status === "approved").length}
                href={`/campaigns/${campaign.id}`}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
