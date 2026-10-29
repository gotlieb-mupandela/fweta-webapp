import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminUserProfile } from "@/components/admin/admin-user-profile";
import { EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { loadAdminUserDossier } from "@/lib/admin/user-profile";
import { getSession } from "@/lib/auth/session";
import { isPublicInfluencerSlug } from "@/lib/influencers/public";

export default async function AdminUserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const { id } = await params;
  const dossier = await loadAdminUserDossier(id);
  if (!dossier) {
    return (
      <EmptyState
        title="User not found"
        description="No account is stored with that id."
        action={
          <Link href="/dashboard/admin/users">
            <Button size="sm" variant="secondary">
              Back to users
            </Button>
          </Link>
        }
      />
    );
  }

  const isPublic = await isPublicInfluencerSlug(dossier.influencer?.slug);
  return <AdminUserProfile dossier={dossier} isPublic={isPublic} />;
}
