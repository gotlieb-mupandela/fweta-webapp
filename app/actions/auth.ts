"use server";

import { redirect } from "next/navigation";

import {
  login,
  logout,
  signup,
  getSession,
  getProfileById,
  seedDemoAccounts,
} from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, signupSchema } from "@/lib/validations/auth";
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
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ primary_role: role })
    .eq("id", session.id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}
