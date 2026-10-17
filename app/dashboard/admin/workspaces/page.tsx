import { redirect } from "next/navigation";

import { AdminMemberActions } from "@/components/onboarding/admin-account-actions";
import { ContextHelp } from "@/components/onboarding/context-help";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";

export default async function AdminWorkspacesPage() {
  const session = await getSession();
  if (!session?.roles.includes("admin")) redirect("/dashboard");

  const store = await readStore();
  const workspaces = [...(store.workspaces ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="dash-stack">
      <PageHeader
        title="Workspaces"
        description="Every brand workspace, its owner, and the people invited onto it."
      />
      <ContextHelp
        title="Teams and extra brands"
        body="A person can own more than one brand and can also be a manager or viewer on someone else's. Change a role or remove a member from here."
      />
      {workspaces.length === 0 ? (
        <EmptyState title="No workspaces yet" description="A brand workspace is created when a brand opens Team." />
      ) : (
        <ul className="space-y-3">
          {workspaces.map((workspace) => {
            const members = (store.workspaceMembers ?? []).filter((member) => member.workspaceId === workspace.id);
            const owner = store.profiles.find((profile) => profile.id === workspace.ownerUserId);
            return (
              <li key={workspace.id} className="rounded-2xl border border-border bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-medium">{workspace.name}</h2>
                  <Badge tone="muted">{owner?.email ?? "Owner"}</Badge>
                </div>
                <ul className="mt-3 space-y-2">
                  {members.map((member) => (
                    <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <div>
                        <p>{member.email}</p>
                        <p className="text-xs text-muted">
                          {member.role} · {member.status}
                        </p>
                      </div>
                      <AdminMemberActions memberId={member.id} role={member.role} />
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
