import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminUserProfile } from "@/components/admin/admin-user-profile";
import { EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { loadAdminUserDossier } from "@/lib/admin/user-profile";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const store = await readStore();
    const profile = store.profiles.find((row) => row.id === id);
    if (!profile) return { title: "User" };
    return {
      title: profile.displayName,
      description: "Account, clips, and payout details.",
    };
  } catch {
    return { title: "User" };
  }
}

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

  return <AdminUserProfile dossier={dossier} />;
}
