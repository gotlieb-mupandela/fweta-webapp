import { redirect } from "next/navigation";

import { AppShell } from "@/components/dashboard/app-shell";
import { DashboardOnboarding } from "@/components/onboarding/dashboard-chrome";
import { getProfileById, getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { needsOnboarding } from "@/lib/onboarding/steps";
import { activeMemberships, workspaceName } from "@/lib/onboarding/workspaces";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const profile = await getProfileById(session.id);
  if (profile && needsOnboarding(profile)) {
    redirect("/onboarding");
  }

  const role =
    session.roles.includes(session.primaryRole) ? session.primaryRole : session.roles[0] ?? "clipper";

  const store = await readStore();
  const workspaces = activeMemberships(store, session.id).map((member) => ({
    id: member.workspaceId,
    name: workspaceName(store, member.workspaceId),
    role: member.role,
  }));

  return (
    <AppShell
      role={role}
      roles={session.roles.length ? session.roles : [role]}
      displayName={session.displayName}
      workspaces={workspaces}
      activeWorkspaceId={profile?.activeWorkspaceId ?? null}
    >
      <DashboardOnboarding userId={session.id} role={role} />
      {children}
    </AppShell>
  );
}
