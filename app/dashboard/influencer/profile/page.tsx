import { redirect } from "next/navigation";

import { getMyInfluencerProfile } from "@/app/actions/influencer";
import { InfluencerProfileForm } from "@/components/forms/influencer-profile-form";
import { PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";

export default async function InfluencerProfilePage() {
  const session = await getSession();
  if (!session?.roles.includes("influencer") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const profile = await getMyInfluencerProfile();

  return (
    <div>
      <PageHeader
        title="Public profile"
        description="Your marketplace profile visible to brands."
      />
      <InfluencerProfileForm profile={profile} />
    </div>
  );
}
