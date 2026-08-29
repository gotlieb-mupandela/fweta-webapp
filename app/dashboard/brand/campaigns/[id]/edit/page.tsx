import { notFound, redirect } from "next/navigation";

import { getCampaign } from "@/app/actions/campaigns";
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

  const campaign = await getCampaign(id);
  if (!campaign) notFound();
  if (campaign.brandId !== session.id && !session.roles.includes("admin")) {
    redirect("/dashboard/brand/campaigns");
  }

  return (
    <div>
      <PageHeader title="Edit campaign" description={campaign.title} />
      <CampaignForm mode="edit" campaign={campaign} />
    </div>
  );
}
