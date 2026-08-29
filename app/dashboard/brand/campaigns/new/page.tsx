import { redirect } from "next/navigation";

import { CampaignForm } from "@/components/forms/campaign-form";
import { PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";

export default async function NewCampaignPage() {
  const session = await getSession();
  if (!session?.roles.includes("brand") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  return (
    <div>
      <PageHeader title="New campaign" description="Set budget, CPM, and platform rules." />
      <CampaignForm mode="create" />
    </div>
  );
}
