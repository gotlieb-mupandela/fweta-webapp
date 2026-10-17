import { redirect } from "next/navigation";

import { RolesSettingsForm } from "@/components/forms/roles-settings-form";
import { ContextHelp } from "@/components/onboarding/context-help";
import { PageHeader } from "@/components/ui/card";
import { getProfileById, getSession } from "@/lib/auth/session";

export default async function SettingsRolesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const profile = await getProfileById(session.id);
  if (!profile) redirect("/login");

  return (
    <div className="dash-stack">
      <PageHeader title="Roles" description="Choose which dashboards you can access." />
      <ContextHelp
        title="One login, two profiles"
        body="Turn on brand and creator together. The role switcher in the sidebar opens the matching workspace. You do not need a second account."
        hint="The active role is the dashboard you are in. Switch it any time."
      />
      <RolesSettingsForm roles={profile.roles} primaryRole={profile.primaryRole} />
    </div>
  );
}
