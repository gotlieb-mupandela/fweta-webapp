import { redirect } from "next/navigation";

import { ContextHelp } from "@/components/onboarding/context-help";
import { NewWorkspaceForm, RemoveMemberButton, TeamPanel } from "@/components/onboarding/team-panel";
import { WorkspaceSwitcher } from "@/components/onboarding/workspace-switcher";
import { Card, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { newId, nowIso, readStore, updateStore } from "@/lib/db/store";
import {
  activeMemberships,
  ensureOwnedWorkspace,
  membershipFor,
  pendingInvitesForEmail,
  workspaceName,
} from "@/lib/onboarding/workspaces";

export default async function BrandTeamPage() {
  const session = await getSession();
  if (!session?.roles.includes("brand") && !session?.roles.includes("admin")) redirect("/dashboard");

  if (session.roles.includes("brand")) {
    await updateStore((store) => {
      const current = store.profiles.find((item) => item.id === session.id);
      if (current) ensureOwnedWorkspace(store, current, nowIso(), newId);
    });
  }

  const store = await readStore();
  const profile = store.profiles.find((item) => item.id === session.id);
  const activeId = profile?.activeWorkspaceId ?? null;
  const membership = membershipFor(store, session.id, activeId);
  const members = (store.workspaceMembers ?? []).filter((member) => member.workspaceId === activeId);
  const invites = pendingInvitesForEmail(store, session.email);
  const options = activeMemberships(store, session.id).map((member) => ({
    id: member.workspaceId,
    name: workspaceName(store, member.workspaceId),
    role: member.role,
  }));
  const canInvite = membership?.role === "owner" || membership?.role === "manager" || session.roles.includes("admin");

  return (
    <div className="dash-stack">
      <PageHeader
        title="Team"
        description="Invite managers and viewers, and switch between the brands on this login."
      />
      <ContextHelp
        title="Roles on a brand"
        body="Owners and managers can edit campaigns and invite people. Viewers can look at the workspace. The invited person accepts from the banner at the top of their workspace."
        hint="Adding another brand creates a separate workspace. Campaigns stay with the brand that was open when you created them."
      />
      <Card className="panel-interactive space-y-4">
        <h2 className="font-display text-xl tracking-tight">Brands on this login</h2>
        <WorkspaceSwitcher workspaces={options} activeId={activeId} id="brand-switcher" />
        <NewWorkspaceForm />
      </Card>
      <Card className="panel-interactive">
        <h2 className="font-display text-xl tracking-tight">
          {activeId ? workspaceName(store, activeId) : "This brand"}
        </h2>
        <ul className="mt-4 space-y-2">
          {members.map((member) => (
            <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border px-3 py-2.5 text-sm">
              <div>
                <p className="font-medium">{member.email}</p>
                <p className="text-xs text-muted">
                  {member.role} · {member.status === "active" ? "Active" : "Invited"}
                </p>
              </div>
              {member.role !== "owner" && canInvite ? <RemoveMemberButton memberId={member.id} /> : null}
            </li>
          ))}
        </ul>
        <div className="mt-5">
          <TeamPanel canInvite={canInvite} invites={invites} />
        </div>
      </Card>
    </div>
  );
}
