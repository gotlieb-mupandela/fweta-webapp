"use server";

import { redirect } from "next/navigation";

import {
  login,
  logout,
  signup,
  getSession,
  getProfileById,
  refreshSessionFromProfile,
  seedDemoAccounts,
} from "@/lib/auth/session";
import { loginSchema, signupSchema } from "@/lib/validations/auth";
import { updateStore, nowIso } from "@/lib/db/store";
import type { UserRole } from "@/types/enums";

export async function loginAction(input: { email: string; password: string }) {
  await seedDemoAccounts().catch(() => undefined);
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid email or password." };
  return login(parsed.data);
}

export async function signupAction(input: {
  email: string;
  password: string;
  displayName: string;
  roles: UserRole[];
}) {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Check your details and try again." };
  return signup(parsed.data);
}

export async function logoutAction() {
  await logout();
  redirect("/");
}

export async function switchPrimaryRoleAction(role: UserRole) {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "Unauthorized" };
  const profile = await getProfileById(session.id);
  if (!profile || !profile.roles.includes(role)) {
    return { ok: false as const, error: "Role not enabled on this account." };
  }
  await updateStore((s) => {
    const p = s.profiles.find((x) => x.id === session.id);
    if (!p) return;
    p.primaryRole = role;
    p.updatedAt = nowIso();
  });
  const updated = await getProfileById(session.id);
  if (updated) await refreshSessionFromProfile(updated);
  return { ok: true as const };
}
