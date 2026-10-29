"use server";

import { cleanDisplayName } from "@/lib/text/display-name";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

import {
  getProfileById,
  getSession,
  refreshSessionFromProfile,
  requireSession,
} from "@/lib/auth/session";
import { nowIso, readStore, updateStore } from "@/lib/db/store";
import { pushAudit } from "@/lib/marketplace/audit";
import { clawbackSubmission } from "@/lib/rewards/earnings";
import { clientIp } from "@/lib/security/client-ip";
import { rateLimit } from "@/lib/security/rate-limit";
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
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Check the display name and bio.",
    };
  }
  // Item 41: clean on save, not only on display.
  const displayName = cleanDisplayName(parsed.data.displayName);
  if (displayName.length < 2) {
    return { ok: false as const, error: "Display name must be at least 2 characters." };
  }
  await updateStore((s) => {
    const p = s.profiles.find((x) => x.id === session.id);
    if (!p) return;
    p.displayName = displayName;
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
  // A stale credential version used to throw Unauthorized and the dashboard
  // error page. The current password is the check, then the cookie is replaced.
  try {
    const session = await getSession();
    if (!session) return { ok: false as const, error: "Sign in again, then change your password." };
    const parsed = passwordChangeSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false as const,
        error: parsed.error.issues[0]?.message ?? "Check password fields.",
      };
    }
    const limited = rateLimit(`password:${await clientIp()}:${session.id}`, 5, 15 * 60 * 1000);
    if (!limited.ok) {
      return { ok: false as const, error: `Too many attempts. Try again in ${limited.retryAfterSec}s.` };
    }
    const profile = await getProfileById(session.id);
    if (!profile) return { ok: false as const, error: "Sign in again, then change your password." };
    if (profile.suspended) return { ok: false as const, error: "Account suspended." };
    const matches = await bcrypt.compare(parsed.data.currentPassword, profile.passwordHash);
    if (!matches) return { ok: false as const, error: "Current password incorrect." };
    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    let nextVersion: number | null = null;
    try {
      await updateStore((s) => {
        nextVersion = null;
        const p = s.profiles.find((x) => x.id === session.id);
        if (!p) return;
        p.passwordHash = passwordHash;
        p.credentialVersion = (p.credentialVersion ?? 0) + 1;
        nextVersion = p.credentialVersion;
        p.updatedAt = nowIso();
      });
    } catch {
      return { ok: false as const, error: "Could not update the password. Try again." };
    }
    if (nextVersion === null) return { ok: false as const, error: "Could not update the password." };
    try {
      await refreshSessionFromProfile({
        ...profile,
        passwordHash,
        credentialVersion: nextVersion,
      });
    } catch {
      return {
        ok: false as const,
        error: "Password updated. Sign in again with the new password.",
      };
    }
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Could not update the password. Sign in and try again." };
  }
}

export async function adminListUsers() {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return [];
  const store = await readStore();
  return store.profiles.map((p) => ({
    id: p.id,
    email: p.email,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
    roles: Array.isArray(p.roles) ? p.roles : [],
    primaryRole: p.primaryRole,
    suspended: Boolean(p.suspended),
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
  revalidatePath(`/dashboard/admin/users/${userId}`);
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
  revalidatePath(`/dashboard/admin/users/${userId}`);
  return { ok: true as const };
}

export async function getPlatformStats() {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return null;
  const store = await readStore();
  const gmv =
    store.ledgerEntries
      .filter(
        (e) =>
          e.type === "credit" &&
          e.referenceType !== "admin_credit" &&
          e.referenceType !== "campaign_release" &&
          e.referenceType !== "campaign_fee" &&
          e.referenceType !== "campaign_fund",
      )
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
    if (!f || f.status !== "open") return;
    f.status = status;
    f.resolvedAt = nowIso();
    pushAudit(s, {
      actorId: session.id,
      action: "fraud.resolve",
      summary: `${status === "dismissed" ? "Dismissed" : "Upheld"} a fraud flag`,
      targetType: "fraud_flag",
      targetId: id,
    });
    if (f.kind !== "score") return;
    const sub = s.submissions.find((item) => item.id === f.submissionId);
    if (!sub) return;
    if (status === "dismissed") {
      sub.fraudState = "dismissed";
      sub.updatedAt = f.resolvedAt;
      return;
    }
    sub.fraudState = "upheld";
    clawbackSubmission(s, sub.id, Date.now(), "Review upheld. This clip was forfeited.");
  });
  revalidatePath("/dashboard/admin/fraud");
  return { ok: true as const };
}
