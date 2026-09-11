import Link from "next/link";
import { redirect } from "next/navigation";

import { SubmissionsList } from "@/components/dashboard/submissions-list";
import { PageHeader } from "@/components/ui/card";
import { canJoinCampaigns } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";

export default async function InfluencerSubmissionsPage() {
  const session = await getSession();
  if (!canJoinCampaigns(session?.roles)) {
    redirect("/dashboard");
  }

  return (
    <div>
      <PageHeader title="My submissions" description="Track review status and clip earnings." />
      <SubmissionsList
        emptyAction={
          <Link href="/dashboard/influencer/campaigns" className="text-sm text-gold hover:underline">
            Browse campaigns →
          </Link>
        }
      />
    </div>
  );
}
