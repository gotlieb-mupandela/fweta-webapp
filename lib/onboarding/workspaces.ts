import type {
  DatabaseStore,
  Profile,
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
} from "@/lib/db/types";

export function workspacesOf(store: Pick<DatabaseStore, "workspaces">): Workspace[] {
  return store.workspaces ?? [];
}

export function membersOf(store: Pick<DatabaseStore, "workspaceMembers">): WorkspaceMember[] {
  return store.workspaceMembers ?? [];
}

export function activeMemberships(store: DatabaseStore, userId: string): WorkspaceMember[] {
  return membersOf(store).filter((member) => member.userId === userId && member.status === "active");
}

export function membershipFor(
  store: DatabaseStore,
  userId: string,
  workspaceId: string | null | undefined,
): WorkspaceMember | null {
  if (!workspaceId) return null;
  return (
    activeMemberships(store, userId).find((member) => member.workspaceId === workspaceId) ?? null
  );
}

export function canEditWorkspace(role: WorkspaceRole | null, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  return role === "owner" || role === "manager";
}

export function canInviteRole(actor: WorkspaceRole | null, isAdmin: boolean, next: WorkspaceRole): boolean {
  if (isAdmin || actor === "owner") return next === "manager" || next === "viewer";
  if (actor === "manager") return next === "viewer";
  return false;
}

export function pendingInvitesForEmail(store: DatabaseStore, email: string): WorkspaceMember[] {
  const needle = email.trim().toLowerCase();
  return membersOf(store).filter(
    (member) => member.status === "invited" && member.email.trim().toLowerCase() === needle,
  );
}

/**
 * Creates the owner's first workspace and attaches older campaigns that
 * were saved before workspaces existed.
 */
export function ensureOwnedWorkspace(
  store: DatabaseStore,
  profile: Profile,
  now: string,
  id: () => string,
): string | null {
  if (!profile.roles.includes("brand")) return profile.activeWorkspaceId ?? null;
  if (!store.workspaces) store.workspaces = [];
  if (!store.workspaceMembers) store.workspaceMembers = [];

  let workspace = store.workspaces.find((item) => item.ownerUserId === profile.id);
  if (!workspace) {
    workspace = {
      id: id(),
      name: profile.companyName?.trim() || profile.displayName || "Brand",
      ownerUserId: profile.id,
      createdAt: now,
      updatedAt: now,
    };
    store.workspaces.push(workspace);
  }

  const owner = store.workspaceMembers.find(
    (member) => member.workspaceId === workspace.id && member.userId === profile.id,
  );
  if (!owner) {
    store.workspaceMembers.push({
      id: id(),
      workspaceId: workspace.id,
      userId: profile.id,
      email: profile.email,
      role: "owner",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const campaign of store.campaigns) {
    if (campaign.brandId === profile.id && !campaign.workspaceId) {
      campaign.workspaceId = workspace.id;
    }
  }

  if (!profile.activeWorkspaceId) profile.activeWorkspaceId = workspace.id;
  return profile.activeWorkspaceId;
}

export function workspaceName(store: DatabaseStore, workspaceId: string): string {
  return workspacesOf(store).find((item) => item.id === workspaceId)?.name ?? "Brand";
}
