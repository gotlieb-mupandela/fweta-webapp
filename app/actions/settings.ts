"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

import {
  getProfileById,
  refreshSessionFromProfile,
  requireSession,
} from "@/lib/auth/session";
import { nowIso, readStore, updateStore } from "@/lib/db/store";
import {
  notificationPrefsSchema,
  passwordChangeSchema,
  profileUpdateSchema,
  rolesUpdateSchema,
} from "@/lib/validations/auth";
import type { UserRole } from "@/types/enums";

export async function updateProfileAction(raw: unknown) {
  const session = await requireSession();
  const parsed = profileUpdateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Invalid profile." };
  await updateStore((s) => {
    const p = s.profiles.find((x) => x.id === session.id);
    if (!p) return;
    p.displayName = parsed.data.displayName;
    p.bio = parsed.data.bio ?? "";
    p.updatedAt = nowIso();
  });
  const updated = await getProfileById(session.id);
  if (updated) await refreshSessionFromProfile(updated);
  revalidatePath("/dashboard/settings/profile");
  return { ok: true as const };
}

export async function updateRolesAction(raw: unknown) {
  const session = await requireSession();
  const parsed = rolesUpdateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Invalid roles." };
  // Prevent self-granting admin
  const roles = parsed.data.roles.filter((r) => r !== "admin" || session.roles.includes("admin"));
  if (!roles.length) return { ok: false as const, error: "Pick at least one role." };
  const primaryRole = roles.includes(parsed.data.primaryRole)
    ? parsed.data.primaryRole
    : roles[0];

  await updateStore((s) => {
    const p = s.profiles.find((x) => x.id === session.id);
    if (!p) return;
    // Keep admin if already admin
    const next: UserRole[] = session.roles.includes("admin")
      ? Array.from(new Set<UserRole>([...roles, "admin"]))
      : roles;
    p.roles = next;
    p.primaryRole = primaryRole;
    p.updatedAt = nowIso();
  });
  const updated = await getProfileById(session.id);
  if (updated) await refreshSessionFromProfile(updated);
  revalidatePath("/dashboard/settings/roles");
  return { ok: true as const };
}

export async function updateNotificationsAction(raw: unknown) {
  const session = await requireSession();
  const parsed = notificationPrefsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Invalid prefs." };
  await updateStore((s) => {
    const p = s.profiles.find((x) => x.id === session.id);
    if (!p) return;
    Object.assign(p, parsed.data, { updatedAt: nowIso() });
  });
  revalidatePath("/dashboard/settings/notifications");
  return { ok: true as const };
}

export async function changePasswordAction(raw: unknown) {
  const session = await requireSession();
  const parsed = passwordChangeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Check password fields." };
  const profile = await getProfileById(session.id);
  if (!profile) return { ok: false as const, error: "Not found." };
  const ok = await bcrypt.compare(parsed.data.currentPassword, profile.passwordHash);
  if (!ok) return { ok: false as const, error: "Current password incorrect." };
  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await updateStore((s) => {
    const p = s.profiles.find((x) => x.id === session.id);
    if (!p) return;
    p.passwordHash = passwordHash;
    p.updatedAt = nowIso();
  });
  return { ok: true as const };
}

export async function adminListUsers() {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return [];
  const store = await readStore();
  return store.profiles.map((p) => ({
    id: p.id,
    email: p.email,
    displayName: p.displayName,
    roles: p.roles,
    suspended: p.suspended,
    createdAt: p.createdAt,
  }));
}

export async function adminSetUserSuspended(userId: string, suspended: boolean) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };
  await updateStore((s) => {
    const p = s.profiles.find((x) => x.id === userId);
    if (!p) return;
    p.suspended = suspended;
    p.updatedAt = nowIso();
  });
  revalidatePath("/dashboard/admin/users");
  return { ok: true as const };
}

export async function adminAssignRole(userId: string, role: UserRole, enable: boolean) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };
  await updateStore((s) => {
    const p = s.profiles.find((x) => x.id === userId);
    if (!p) return;
    if (enable && !p.roles.includes(role)) p.roles.push(role);
    if (!enable) p.roles = p.roles.filter((r) => r !== role);
    if (!p.roles.includes(p.primaryRole)) p.primaryRole = p.roles[0] || "clipper";
    p.updatedAt = nowIso();
  });
  revalidatePath("/dashboard/admin/users");
  return { ok: true as const };
}

export async function getPlatformStats() {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return null;
  const store = await readStore();
  const gmv =
    store.ledgerEntries
      .filter((e) => e.type === "credit" && e.referenceType !== "admin_credit")
      .reduce((sum, e) => sum + e.amountCents, 0) || 0;
  return {
    users: store.profiles.length,
    activeCampaigns: store.campaigns.filter((c) => c.status === "active").length,
    pendingWithdrawals: store.withdrawalRequests.filter((w) => w.status === "pending").length,
    openFraudFlags: store.fraudFlags.filter((f) => f.status === "open").length,
    gmvCents: gmv,
    submissions: store.submissions.length,
    bookings: store.bookings.length,
  };
}

export async function listFraudFlags() {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return [];
  const store = await readStore();
  return store.fraudFlags
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function resolveFraudFlag(id: string, status: "resolved" | "dismissed") {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };
  await updateStore((s) => {
    const f = s.fraudFlags.find((x) => x.id === id);
    if (!f) return;
    f.status = status;
    f.resolvedAt = nowIso();
  });
  revalidatePath("/dashboard/admin/fraud");
  return { ok: true as const };
}
