import "server-only";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

import { readStore, updateStore, newId, nowIso } from "@/lib/db/store";
import { getAuthSecretKey, readAuthSecretKey } from "@/lib/auth/secret";
import { sessionGate } from "@/lib/auth/session-gate";
import { referralCodeFor } from "@/lib/marketplace/growth";
import { notifyWelcome } from "@/lib/notifications/events";
import { triggerWelcomeEmail } from "@/lib/onboarding/welcome";
import type { Profile, Wallet } from "@/lib/db/types";
import type { UserRole } from "@/types/enums";

const COOKIE_NAME = "fweta_session";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  roles: UserRole[];
  primaryRole: UserRole;
  credentialVersion: number;
};

async function signSession(user: SessionUser) {
  return new SignJWT({
    email: user.email,
    displayName: user.displayName,
    roles: user.roles,
    primaryRole: user.primaryRole,
    cv: user.credentialVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(getAuthSecretKey());
}

async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const key = readAuthSecretKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    if (!payload.sub || typeof payload.email !== "string") return null;
    return {
      id: payload.sub,
      email: payload.email,
      displayName: String(payload.displayName || ""),
      roles: (payload.roles as UserRole[]) || [],
      primaryRole: (payload.primaryRole as UserRole) || "clipper",
      credentialVersion: typeof payload.cv === "number" ? payload.cv : 0,
    };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const profile = await getProfileById(session.id);
  const gate = sessionGate(session, profile);
  if (gate === "suspended" || gate === "expired") throw new Error("Unauthorized");
  return session;
}

export async function getProfileById(id: string): Promise<Profile | null> {
  const store = await readStore();
  return store.profiles.find((p) => p.id === id) ?? null;
}

function ensureWallet(store: { wallets: Wallet[] }, userId: string) {
  let wallet = store.wallets.find((w) => w.userId === userId);
  if (!wallet) {
    wallet = {
      userId,
      availableCents: 0,
      pendingCents: 0,
      updatedAt: nowIso(),
    };
    store.wallets.push(wallet);
  }
  return wallet;
}

export async function signup(input: {
  email: string;
  password: string;
  displayName?: string;
  roles: UserRole[];
  referralCode?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  if (!email || input.password.length < 8) {
    return { ok: false, error: "Valid email and password (8+ chars) required." };
  }
  if (!input.roles.length) {
    return { ok: false, error: "Select at least one role." };
  }
  if (input.roles.includes("admin")) {
    return { ok: false, error: "Admin role cannot be self-assigned." };
  }

  const store = await readStore();
  if (store.profiles.some((p) => p.email === email)) {
    return { ok: false, error: "An account with this email already exists." };
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  const now = nowIso();
  const profile: Profile = {
    id: newId(),
    email,
    passwordHash,
    displayName: input.displayName?.trim() || email.split("@")[0],
    bio: "",
    avatarUrl: null,
    roles: input.roles,
    primaryRole: input.roles[0],
    notifyEmail: true,
    notifyWithdrawals: true,
    notifyBookings: true,
    createdAt: now,
    updatedAt: now,
    suspended: false,
    onboardingCompletedAt: null,
  };

  // Atomic duplicate check + insert: two concurrent signups for the same
  // email previously both passed the pre-check and created duplicates.
  try {
    await updateStore((s) => {
      if (s.profiles.some((p) => p.email === email)) {
        throw new Error("An account with this email already exists.");
      }
      s.profiles.push(profile);
      ensureWallet(s, profile.id);
      profile.referralCode = referralCodeFor(profile.id);
      const code = input.referralCode?.trim().toUpperCase();
      if (code) {
        const referrer = s.profiles.find(
          (item) => item.id !== profile.id && (item.referralCode === code || referralCodeFor(item.id) === code),
        );
        if (referrer) profile.referredByUserId = referrer.id;
      }
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Signup failed." };
  }

  try {
    const token = await signSession({
      id: profile.id,
      email: profile.email,
      displayName: profile.displayName,
      roles: profile.roles,
      primaryRole: profile.primaryRole,
      credentialVersion: 0,
    });
    await setSessionCookie(token);
  } catch (err) {
    console.warn("[fweta] signup could not start a session:", err instanceof Error ? err.message : err);
    return { ok: false, error: "Account saved, but sign-in is unavailable right now." };
  }
  await notifyWelcome(profile);
  await triggerWelcomeEmail({
    userId: profile.id,
    email: profile.email,
    displayName: profile.displayName,
    roles: profile.roles,
  });
  return { ok: true };
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  const store = await readStore();
  const profile = store.profiles.find((p) => p.email === email);
  if (!profile) return { ok: false, error: "Invalid email or password." };
  if (profile.suspended) return { ok: false, error: "Account suspended." };

  const valid = await bcrypt.compare(input.password, profile.passwordHash);
  if (!valid) return { ok: false, error: "Invalid email or password." };

  try {
    const token = await signSession({
      id: profile.id,
      email: profile.email,
      displayName: profile.displayName,
      roles: profile.roles,
      primaryRole: profile.primaryRole,
      credentialVersion: profile.credentialVersion ?? 0,
    });
    await setSessionCookie(token);
  } catch (err) {
    console.warn("[fweta] login could not start a session:", err instanceof Error ? err.message : err);
    return { ok: false, error: "Sign-in is unavailable right now." };
  }
  return { ok: true };
}

export async function logout() {
  await clearSession();
}

export async function refreshSessionFromProfile(profile: Profile) {
  const token = await signSession({
    id: profile.id,
    email: profile.email,
    displayName: profile.displayName,
    roles: profile.roles,
    primaryRole: profile.primaryRole,
    credentialVersion: profile.credentialVersion ?? 0,
  });
  await setSessionCookie(token);
}

let seedInFlight: Promise<AdminAccountReport> | null = null;
let adminEnvWarningShown = false;

type AdminSeed = { email: string; password: string };

export type AdminAccountReport = {
  seeded: boolean;
  duplicateEmails: string[];
};

function readAdminSeed(): AdminSeed | null {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email && !password) {
    if (!adminEnvWarningShown) {
      adminEnvWarningShown = true;
      console.warn(
        "[fweta] ADMIN_EMAIL and ADMIN_PASSWORD are unset. Admin account was not seeded.",
      );
    }
    return null;
  }
  if (!email.includes("@") || password.length < 8) {
    if (!adminEnvWarningShown) {
      adminEnvWarningShown = true;
      console.warn(
        "[fweta] Set both ADMIN_EMAIL and ADMIN_PASSWORD (8+ characters). Admin account was not seeded.",
      );
    }
    return null;
  }
  return { email, password };
}

function duplicateProfileEmails(profiles: Profile[]): string[] {
  const counts = new Map<string, number>();
  for (const profile of profiles) {
    const email = profile.email.trim().toLowerCase();
    if (!email) continue;
    counts.set(email, (counts.get(email) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([email]) => email)
    .sort();
}

async function ensureAdminOnce(): Promise<AdminAccountReport> {
  try {
    const existing = await readStore();
    const duplicateEmails = duplicateProfileEmails(existing.profiles);
    if (duplicateEmails.length > 0) {
      console.warn(
        "[fweta] duplicate profile emails left unchanged:",
        duplicateEmails.join(", "),
      );
    }

    const adminSeed = readAdminSeed();
    if (!adminSeed) return { seeded: false, duplicateEmails };

    const emailTaken = existing.profiles.some(
      (profile) => profile.email.trim().toLowerCase() === adminSeed.email,
    );
    if (emailTaken) return { seeded: false, duplicateEmails };

    const adminHash = await bcrypt.hash(adminSeed.password, 10);
    const now = nowIso();
    let seeded = false;

    await updateStore((store) => {
      const taken = store.profiles.some(
        (profile) => profile.email.trim().toLowerCase() === adminSeed.email,
      );
      if (taken) return;
      const created: Profile = {
        id: newId(),
        email: adminSeed.email,
        passwordHash: adminHash,
        displayName: "Fweta Admin",
        bio: "Platform operations",
        avatarUrl: null,
        roles: ["admin"],
        primaryRole: "admin",
        notifyEmail: true,
        notifyWithdrawals: true,
        notifyBookings: true,
        createdAt: now,
        updatedAt: now,
        suspended: false,
        onboardingCompletedAt: "seeded",
      };
      store.profiles.push(created);
      ensureWallet(store, created.id);
      seeded = true;
    });

    return { seeded, duplicateEmails };
  } catch (err) {
    console.warn("[fweta] ensureAdminAccount failed:", err instanceof Error ? err.message : err);
    return { seeded: false, duplicateEmails: [] };
  }
}

/**
 * Creates the env admin and a wallet only when no profile already uses ADMIN_EMAIL.
 * Does not change an existing account's email, password hash, or roles.
 * Does not delete duplicate profiles. The report lists those emails instead.
 * Housekeeping is the only caller. A page render or the login form must not call this.
 */
export async function ensureAdminAccount(): Promise<AdminAccountReport> {
  if (!seedInFlight) {
    seedInFlight = ensureAdminOnce().finally(() => {
      seedInFlight = null;
    });
  }
  return seedInFlight;
}
