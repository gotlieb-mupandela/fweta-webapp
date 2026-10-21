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
import { clientIp } from "@/lib/security/client-ip";
import { rateLimit } from "@/lib/security/rate-limit";
import type { UserRole } from "@/types/enums";

export async function loginAction(input: { email: string; password: string }) {
  const ip = await clientIp();
  const burstCap = process.env.NODE_ENV === "production" ? 20 : 80;
  const burst = rateLimit(`login:${ip}`, burstCap, 15 * 60 * 1000);
  if (!burst.ok) {
    return { ok: false as const, error: `Too many attempts. Try again in ${burst.retryAfterSec}s.` };
  }
  await seedDemoAccounts().catch(() => undefined);
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid email or password." };
  const loginCap = process.env.NODE_ENV === "production" ? 8 : 40;
  const limited = rateLimit(`login:${ip}:${parsed.data.email}`, loginCap, 15 * 60 * 1000);
  if (!limited.ok) {
    return { ok: false as const, error: `Too many attempts. Try again in ${limited.retryAfterSec}s.` };
  }
  return login(parsed.data);
}

export async function signupAction(input: {
  email: string;
  password: string;
  displayName?: string;
  roles: UserRole[];
  referralCode?: string;
}) {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Check your details and try again." };
  const ip = await clientIp();
  const signupCap = process.env.NODE_ENV === "production" ? 5 : 30;
  const limited = rateLimit(`signup:${ip}`, signupCap, 60 * 60 * 1000);
  if (!limited.ok) {
    return { ok: false as const, error: `Too many signups from this network. Try again in ${limited.retryAfterSec}s.` };
  }
  const code = input.referralCode?.trim();
  return signup({ ...parsed.data, referralCode: code || undefined });
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
