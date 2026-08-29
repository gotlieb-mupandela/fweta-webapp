import { redirect } from "next/navigation";

import { ProfileSettingsForm } from "@/components/forms/profile-settings-form";
import { PageHeader } from "@/components/ui/card";
import { getProfileById, getSession } from "@/lib/auth/session";

export default async function SettingsProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const profile = await getProfileById(session.id);
  if (!profile) redirect("/login");

  return (
    <div>
      <PageHeader title="Profile" description="Update your display name and bio." />
      <ProfileSettingsForm displayName={profile.displayName} bio={profile.bio} />
    </div>
  );
}
