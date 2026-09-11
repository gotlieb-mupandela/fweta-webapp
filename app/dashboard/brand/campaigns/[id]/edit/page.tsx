import { notFound, redirect } from "next/navigation";

import { getCampaign, getCampaignBudgetSummary } from "@/app/actions/campaigns";
import { getMyWallet } from "@/app/actions/wallet";
import { CampaignForm } from "@/components/forms/campaign-form";
import { PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";

export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.roles.includes("brand") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const [campaign, summary, wallet] = await Promise.all([
    getCampaign(id),
    getCampaignBudgetSummary(id),
    getMyWallet(),
  ]);
  if (!campaign) notFound();
  if (campaign.brandId !== session.id && !session.roles.includes("admin")) {
    redirect("/dashboard/brand/campaigns");
  }

  const moneyLocked = campaign.status === "completed" || campaign.status === "cancelled";

  return (
    <div>
      <PageHeader title="Edit campaign" description={campaign.title} />
      <CampaignForm
        mode="edit"
        campaign={campaign}
        walletAvailableCents={wallet.availableCents}
        funded={summary?.funded}
        moneyLocked={moneyLocked}
      />
    </div>
  );
}
