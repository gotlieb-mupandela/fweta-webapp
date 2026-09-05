"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

import { readStore, updateStore, newId, nowIso } from "@/lib/db/store";
import { getAuthSecretKey } from "@/lib/auth/secret";
import type { Profile, Wallet } from "@/lib/db/types";
import type { UserRole } from "@/types/enums";

const COOKIE_NAME = "fweta_session";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  roles: UserRole[];
  primaryRole: UserRole;
};

async function signSession(user: SessionUser) {
  return new SignJWT({
    email: user.email,
    displayName: user.displayName,
    roles: user.roles,
    primaryRole: user.primaryRole,
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
  // Resolved outside try: a missing prod secret must throw loudly,
  // never masquerade as "logged out".
  const key = getAuthSecretKey();
  try {
    const { payload } = await jwtVerify(token, key);
    if (!payload.sub || typeof payload.email !== "string") return null;
    return {
      id: payload.sub,
      email: payload.email,
      displayName: String(payload.displayName || ""),
      roles: (payload.roles as UserRole[]) || [],
      primaryRole: (payload.primaryRole as UserRole) || "clipper",
    };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
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
  displayName: string;
  roles: UserRole[];
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
    displayName: input.displayName.trim() || email.split("@")[0],
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
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Signup failed." };
  }

  const token = await signSession({
    id: profile.id,
    email: profile.email,
    displayName: profile.displayName,
    roles: profile.roles,
    primaryRole: profile.primaryRole,
  });
  await setSessionCookie(token);
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

  const token = await signSession({
    id: profile.id,
    email: profile.email,
    displayName: profile.displayName,
    roles: profile.roles,
    primaryRole: profile.primaryRole,
  });
  await setSessionCookie(token);
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
  });
  await setSessionCookie(token);
}

const DEMO_ACCOUNTS: Array<Omit<Profile, "passwordHash" | "id">> = [
  {
    email: "brand@fweta.test",
    displayName: "Desert Brands",
    bio: "Namibian DTC brand running creator campaigns.",
    avatarUrl: null,
    roles: ["brand"],
    primaryRole: "brand",
    notifyEmail: true,
    notifyWithdrawals: true,
    notifyBookings: true,
    createdAt: "",
    updatedAt: "",
    suspended: false,
  },
  {
    email: "creator@fweta.test",
    displayName: "Amara Nangolo",
    bio: "Windhoek creator · lifestyle & short-form.",
    avatarUrl: null,
    roles: ["clipper", "influencer"],
    primaryRole: "influencer",
    notifyEmail: true,
    notifyWithdrawals: true,
    notifyBookings: true,
    createdAt: "",
    updatedAt: "",
    suspended: false,
  },
  {
    email: "clipper@fweta.test",
    displayName: "Kai Clips",
    bio: "Clipping specialist across TikTok & Reels.",
    avatarUrl: null,
    roles: ["clipper"],
    primaryRole: "clipper",
    notifyEmail: true,
    notifyWithdrawals: true,
    notifyBookings: true,
    createdAt: "",
    updatedAt: "",
    suspended: false,
  },
  {
    email: "admin@fweta.test",
    displayName: "Fweta Admin",
    bio: "Platform operations",
    avatarUrl: null,
    roles: ["admin"],
    primaryRole: "admin",
    notifyEmail: true,
    notifyWithdrawals: true,
    notifyBookings: true,
    createdAt: "",
    updatedAt: "",
    suspended: false,
  },
];

let seedInFlight: Promise<{ seeded: boolean }> | null = null;

/** Precomputed bcrypt hash for demo password `password123` — avoids hashing on every cold start. */
const DEMO_PASSWORD_HASH = "$2b$10$zG4dij3FDqNB0B41xbteQ.MqWV4oXM5XqSmLk96dYyuha0hGOxirW";

async function seedDemoAccountsOnce(): Promise<{ seeded: boolean }> {
  try {
    const existing = await readStore();
    const seen = new Set<string>();
    const deduped = existing.profiles.filter((p) => {
      const email = p.email.trim().toLowerCase();
      if (seen.has(email)) return false;
      seen.add(email);
      return true;
    });
    const needsDedupe = deduped.length !== existing.profiles.length;

    const missingAccounts = DEMO_ACCOUNTS.filter(
      (account) =>
        !existing.profiles.some(
          (p) => p.email.trim().toLowerCase() === account.email.trim().toLowerCase(),
        ),
    );

    if (!needsDedupe && missingAccounts.length === 0) {
      return { seeded: false };
    }

    const now = nowIso();
    let added = 0;

    await updateStore((s) => {
      if (needsDedupe) {
        s.profiles = deduped;
      }

      for (const account of missingAccounts) {
        const email = account.email.trim().toLowerCase();
        if (s.profiles.some((p) => p.email.trim().toLowerCase() === email)) continue;

        const profile: Profile = {
          ...account,
          id: newId(),
          email,
          createdAt: now,
          updatedAt: now,
          passwordHash: DEMO_PASSWORD_HASH,
        };
        s.profiles.push(profile);
        ensureWallet(s, profile.id);
        added += 1;
      }
    });

    return { seeded: added > 0 || needsDedupe };
  } catch (err) {
    console.warn("[fweta] seedDemoAccounts failed:", err);
    return { seeded: false };
  }
}

export async function seedDemoAccounts() {
  if (!seedInFlight) {
    seedInFlight = seedDemoAccountsOnce().finally(() => {
      seedInFlight = null;
    });
  }
  return seedInFlight;
}
