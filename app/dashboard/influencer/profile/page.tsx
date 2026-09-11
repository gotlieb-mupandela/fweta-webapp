import Link from "next/link";
import { redirect } from "next/navigation";

import { getMyInfluencerProfile } from "@/app/actions/influencer";
import { InfluencerProfileForm } from "@/components/forms/influencer-profile-form";
import { PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { canUseInfluencerWorkspace } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";

export default async function InfluencerProfilePage() {
  const session = await getSession();
  if (!canUseInfluencerWorkspace(session?.roles)) {
    redirect("/dashboard");
  }

  const profile = await getMyInfluencerProfile();

  return (
    <div>
      <PageHeader
        title="Public profile"
        description="Your marketplace profile visible to brands."
        action={
          profile?.published && profile.slug ? (
            <Link href={`/influencers/${profile.slug}`}>
              <Button variant="secondary" size="sm">
                View public page
              </Button>
            </Link>
          ) : null
        }
      />
      <InfluencerProfileForm profile={profile} />
    </div>
  );
}
