"use server";

import { revalidatePath } from "next/cache";

import { getProfileById, refreshSessionFromProfile, requireSession } from "@/lib/auth/session";
import { newId, nowIso, updateStore } from "@/lib/db/store";
import { pushNotification } from "@/lib/notifications/inbox";
import type { WorkspaceRole } from "@/lib/db/types";
import {
  canInviteRole,
  ensureOwnedWorkspace,
  membershipFor,
  membersOf,
} from "@/lib/onboarding/workspaces";
import { createWorkspaceSchema, inviteMemberSchema } from "@/lib/validations/workspaces";

function revalidateTeam() {
  revalidatePath("/dashboard/brand");
  revalidatePath("/dashboard/brand/team");
  revalidatePath("/dashboard/brand/campaigns");
  revalidatePath("/dashboard/admin/workspaces");
  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard");
}

export async function ensureBrandWorkspaceAction() {
  const session = await requireSession();
  if (!session.roles.includes("brand") && !session.roles.includes("admin")) {
    return { ok: false as const, error: "Brand role required." };
  }
  await updateStore((store) => {
    const profile = store.profiles.find((item) => item.id === session.id);
    if (!profile) return;
    ensureOwnedWorkspace(store, profile, nowIso(), newId);
  });
  revalidateTeam();
  return { ok: true as const };
}

export async function createWorkspaceAction(raw: unknown) {
  const session = await requireSession();
  if (!session.roles.includes("brand")) return { ok: false as const, error: "Brand role required." };
  const parsed = createWorkspaceSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Enter a brand name." };

  const now = nowIso();
  const workspaceId = newId();
  try {
  await updateStore((store) => {
    const profile = store.profiles.find((item) => item.id === session.id);
    if (!profile) throw new Error("Profile not found.");
    if (!store.workspaces) store.workspaces = [];
    if (!store.workspaceMembers) store.workspaceMembers = [];
    store.workspaces.push({
      id: workspaceId,
      name: parsed.data.name,
      ownerUserId: profile.id,
      createdAt: now,
      updatedAt: now,
    });
    store.workspaceMembers.push({
      id: newId(),
      workspaceId,
      userId: profile.id,
      email: profile.email,
      role: "owner",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    profile.activeWorkspaceId = workspaceId;
    profile.updatedAt = now;
  });
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Could not create that brand." };
  }
  revalidateTeam();
  return { ok: true as const, id: workspaceId };
}

export async function switchWorkspaceAction(workspaceId: string) {
  const session = await requireSession();
  let found = false;
  await updateStore((store) => {
    const profile = store.profiles.find((item) => item.id === session.id);
    if (!profile) return;
    const member = membershipFor(store, session.id, workspaceId);
    if (!member && !session.roles.includes("admin")) return;
    profile.activeWorkspaceId = workspaceId;
    profile.updatedAt = nowIso();
    found = true;
  });
  if (!found) return { ok: false as const, error: "You are not a member of that brand." };
  revalidateTeam();
  return { ok: true as const };
}

export async function inviteMemberAction(raw: unknown) {
  const session = await requireSession();
  const parsed = inviteMemberSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Enter a valid email and role." };

  try {
    await updateStore((store) => {
      const profile = store.profiles.find((item) => item.id === session.id);
      if (!profile?.activeWorkspaceId && !session.roles.includes("admin")) {
        throw new Error("Open a brand workspace first.");
      }
      const workspaceId = profile?.activeWorkspaceId;
      if (!workspaceId) throw new Error("Open a brand workspace first.");
      const actor = membershipFor(store, session.id, workspaceId);
      const actorRole = actor?.role ?? null;
      if (!canInviteRole(actorRole, session.roles.includes("admin"), parsed.data.role)) {
        throw new Error("You cannot invite that role.");
      }
      const email = parsed.data.email.trim().toLowerCase();
      if (email === profile.email.trim().toLowerCase()) {
        throw new Error("You are already in this brand.");
      }
      const existing = membersOf(store).find(
        (member) => member.workspaceId === workspaceId && member.email.trim().toLowerCase() === email,
      );
      if (existing) throw new Error("That email is already on this brand.");
      const known = store.profiles.find((item) => item.email.trim().toLowerCase() === email);
      const now = nowIso();
      if (!store.workspaceMembers) store.workspaceMembers = [];
      const memberId = newId();
      store.workspaceMembers.push({
        id: memberId,
        workspaceId,
        userId: null,
        email: known?.email ?? parsed.data.email.trim(),
        role: parsed.data.role,
        status: "invited",
        createdAt: now,
        updatedAt: now,
      });
      if (known && !known.suspended) {
        const workspace = (store.workspaces ?? []).find((item) => item.id === workspaceId);
        pushNotification(store, {
          id: newId(),
          userId: known.id,
          kind: "workspace_invite",
          title: "Brand invite",
          body: `${profile.displayName} invited you to ${workspace?.name ?? "a brand"} as ${parsed.data.role}. Accept it from the banner in your workspace.`,
          href: "/dashboard",
          readAt: null,
          createdAt: now,
        });
      }
    });
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Could not send the invite." };
  }
  revalidateTeam();
  return { ok: true as const };
}

export async function acceptInviteAction(memberId: string) {
  const session = await requireSession();
  try {
    await updateStore((store) => {
      const member = membersOf(store).find((item) => item.id === memberId);
      const profile = store.profiles.find((item) => item.id === session.id);
      if (!member || !profile) throw new Error("Invite not found.");
      if (member.status !== "invited") throw new Error("That invite is no longer open.");
      if (member.email.trim().toLowerCase() !== profile.email.trim().toLowerCase()) {
        throw new Error("Sign in with the invited email to accept.");
      }
      const now = nowIso();
      member.userId = profile.id;
      member.status = "active";
      member.updatedAt = now;
      if (!profile.roles.includes("brand")) profile.roles = [...profile.roles, "brand"];
      profile.activeWorkspaceId = member.workspaceId;
      profile.updatedAt = now;
    });
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Could not accept the invite." };
  }
  const profile = await getProfileById(session.id);
  if (profile) await refreshSessionFromProfile(profile);
  revalidateTeam();
  return { ok: true as const };
}

export async function revokeMemberAction(memberId: string) {
  const session = await requireSession();
  try {
    await updateStore((store) => {
      const member = membersOf(store).find((item) => item.id === memberId);
      if (!member) throw new Error("Member not found.");
      if (member.role === "owner") throw new Error("The owner stays on the brand.");
      const actor = membershipFor(store, session.id, member.workspaceId);
      const allowed =
        session.roles.includes("admin") || actor?.role === "owner" || (actor?.role === "manager" && member.role === "viewer");
      if (!allowed) throw new Error("You cannot remove that member.");
      store.workspaceMembers = membersOf(store).filter((item) => item.id !== memberId);
    });
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Could not update the team." };
  }
  revalidateTeam();
  return { ok: true as const };
}

export async function adminSetMemberRoleAction(memberId: string, role: WorkspaceRole) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };
  if (role === "owner") return { ok: false as const, error: "Transfer of ownership is not available." };
  let found = false;
  await updateStore((store) => {
    const member = membersOf(store).find((item) => item.id === memberId);
    if (!member || member.role === "owner") return;
    member.role = role;
    member.updatedAt = nowIso();
    found = true;
  });
  if (!found) return { ok: false as const, error: "Member not found." };
  revalidateTeam();
  return { ok: true as const };
}
