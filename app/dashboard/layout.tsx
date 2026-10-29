import { redirect } from "next/navigation";

import type { Metadata } from "next";

import { AppShell } from "@/components/dashboard/app-shell";
import { DashboardOnboarding } from "@/components/onboarding/dashboard-chrome";
import { PendingInvites } from "@/components/onboarding/pending-invites";
import { sessionGate } from "@/lib/auth/session-gate";
import { getProfileById, getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { countUnreadNotifications } from "@/lib/notifications/queries";
import { needsOnboarding } from "@/lib/onboarding/steps";
import { activeMemberships, pendingInvitesForEmail, workspaceName } from "@/lib/onboarding/workspaces";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const profile = await getProfileById(session.id);
  const gate = sessionGate(session, profile);
  if (gate === "suspended" || gate === "expired") {
    redirect(`/api/auth/end-session?reason=${gate}`);
  }
  if (profile && needsOnboarding(profile)) {
    redirect("/onboarding");
  }

  const role =
    session.roles.includes(session.primaryRole) ? session.primaryRole : session.roles[0] ?? "clipper";
  const unreadCount = await countUnreadNotifications(session.id);

  const store = await readStore();
  const workspaces = activeMemberships(store, session.id).map((member) => ({
    id: member.workspaceId,
    name: workspaceName(store, member.workspaceId),
    role: member.role,
  }));
  const invites = pendingInvitesForEmail(store, session.email).map((invite) => ({
    id: invite.id,
    role: invite.role,
    workspaceName: workspaceName(store, invite.workspaceId),
  }));

  return (
    <AppShell
      role={role}
      roles={session.roles.length ? session.roles : [role]}
      displayName={session.displayName}
      avatarUrl={profile?.avatarUrl ?? null}
      unreadCount={unreadCount}
      workspaces={workspaces}
      activeWorkspaceId={profile?.activeWorkspaceId ?? null}
    >
      <DashboardOnboarding userId={session.id} role={role} />
      <PendingInvites invites={invites} />
      {children}
    </AppShell>
  );
}
