"use server";

import { revalidatePath } from "next/cache";

import { getProfileById, requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  mapFraudFlag,
  mapProfile,
  type FraudFlagRow,
  type ProfileRow,
} from "@/lib/db/mappers";
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
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: parsed.data.displayName,
      bio: parsed.data.bio ?? "",
    })
    .eq("id", session.id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/dashboard/settings/profile");
  return { ok: true as const };
}

export async function updateRolesAction(raw: unknown) {
  const session = await requireSession();
  const parsed = rolesUpdateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Invalid roles." };
  const roles = parsed.data.roles.filter((r) => r !== "admin" || session.roles.includes("admin"));
  if (!roles.length) return { ok: false as const, error: "Pick at least one role." };
  const primaryRole = roles.includes(parsed.data.primaryRole)
    ? parsed.data.primaryRole
    : roles[0];
  const next: UserRole[] = session.roles.includes("admin")
    ? Array.from(new Set<UserRole>([...roles, "admin"]))
    : roles;

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ roles: next, primary_role: primaryRole })
    .eq("id", session.id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/dashboard/settings/roles");
  return { ok: true as const };
}

export async function updateNotificationsAction(raw: unknown) {
  const session = await requireSession();
  const parsed = notificationPrefsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Invalid prefs." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      notify_email: parsed.data.notifyEmail,
      notify_withdrawals: parsed.data.notifyWithdrawals,
      notify_bookings: parsed.data.notifyBookings,
    })
    .eq("id", session.id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/dashboard/settings/notifications");
  return { ok: true as const };
}

export async function changePasswordAction(raw: unknown) {
  const session = await requireSession();
  const parsed = passwordChangeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Check password fields." };
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: session.email,
    password: parsed.data.currentPassword,
  });
  if (signInError) return { ok: false as const, error: "Current password incorrect." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function adminListUsers() {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").order("created_at", {
    ascending: false,
  });
  return ((data ?? []) as ProfileRow[]).map(mapProfile).map((p) => ({
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
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ suspended }).eq("id", userId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/dashboard/admin/users");
  return { ok: true as const };
}

export async function adminAssignRole(userId: string, role: UserRole, enable: boolean) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };
  const profile = await getProfileById(userId);
  if (!profile) return { ok: false as const, error: "Not found." };
  const next = enable
    ? Array.from(new Set<UserRole>([...profile.roles, role]))
    : profile.roles.filter((r) => r !== role);
  const primaryRole = next.includes(profile.primaryRole) ? profile.primaryRole : next[0] || "clipper";
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ roles: next, primary_role: primaryRole })
    .eq("id", userId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/dashboard/admin/users");
  return { ok: true as const };
}

export async function getPlatformStats() {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return null;
  const supabase = await createClient();
  const [profiles, campaigns, withdrawals, flags, ledger, submissions, bookings] =
    await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase
        .from("withdrawal_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase.from("fraud_flags").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("ledger_entries").select("amount_cents, type, reference_type"),
      supabase.from("submissions").select("id", { count: "exact", head: true }),
      supabase.from("bookings").select("id", { count: "exact", head: true }),
    ]);
  const gmv =
    (ledger.data ?? [])
      .filter(
        (e: { type: string; reference_type: string }) =>
          e.type === "credit" && e.reference_type !== "admin_credit",
      )
      .reduce((sum: number, e: { amount_cents: number }) => sum + e.amount_cents, 0) || 0;
  return {
    users: profiles.count ?? 0,
    activeCampaigns: campaigns.count ?? 0,
    pendingWithdrawals: withdrawals.count ?? 0,
    openFraudFlags: flags.count ?? 0,
    gmvCents: gmv,
    submissions: submissions.count ?? 0,
    bookings: bookings.count ?? 0,
  };
}

export async function listFraudFlags() {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("fraud_flags")
    .select("*")
    .order("created_at", { ascending: false });
  return ((data ?? []) as FraudFlagRow[]).map(mapFraudFlag);
}

export async function resolveFraudFlag(id: string, status: "resolved" | "dismissed") {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("fraud_flags")
    .update({ status, resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/dashboard/admin/fraud");
  return { ok: true as const };
}
