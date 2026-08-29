import { redirect } from "next/navigation";

import { RolesSettingsForm } from "@/components/forms/roles-settings-form";
import { PageHeader } from "@/components/ui/card";
import { getProfileById, getSession } from "@/lib/auth/session";

export default async function SettingsRolesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const profile = await getProfileById(session.id);
  if (!profile) redirect("/login");

  return (
    <div>
      <PageHeader title="Roles" description="Choose which dashboards you can access." />
      <RolesSettingsForm roles={profile.roles} primaryRole={profile.primaryRole} />
    </div>
  );
}
