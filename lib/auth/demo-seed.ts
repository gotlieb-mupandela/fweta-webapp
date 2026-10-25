import { readStore, updateStore, newId, nowIso } from "@/lib/db/store";
import type { Profile, Wallet } from "@/lib/db/types";

/** Precomputed bcrypt hash for demo password `password123`. */
const DEMO_PASSWORD_HASH = "$2b$10$zG4dij3FDqNB0B41xbteQ.MqWV4oXM5XqSmLk96dYyuha0hGOxirW";

export const DEMO_EMAILS = ["brand@fweta.test", "creator@fweta.test", "clipper@fweta.test"] as const;

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
    onboardingCompletedAt: "seeded",
  },
  {
    email: "creator@fweta.test",
    displayName: "Amara Nangolo",
    bio: "Windhoek creator. Lifestyle and short-form.",
    avatarUrl: null,
    roles: ["clipper", "influencer"],
    primaryRole: "influencer",
    notifyEmail: true,
    notifyWithdrawals: true,
    notifyBookings: true,
    createdAt: "",
    updatedAt: "",
    suspended: false,
    onboardingCompletedAt: "seeded",
  },
  {
    email: "clipper@fweta.test",
    displayName: "Kai Clips",
    bio: "Clipping specialist across TikTok and Reels.",
    avatarUrl: null,
    roles: ["clipper"],
    primaryRole: "clipper",
    notifyEmail: true,
    notifyWithdrawals: true,
    notifyBookings: true,
    createdAt: "",
    updatedAt: "",
    suspended: false,
    onboardingCompletedAt: "seeded",
  },
];

type SeedEnv = {
  FWETA_SEED_DEMO?: string;
  NODE_ENV?: string;
  VERCEL_ENV?: string;
};

/**
 * Demo accounts stay off unless the flag is exactly `true` and this process
 * is not production. `NODE_ENV=production` and `VERCEL_ENV=production` each
 * refuse the seed, including when the flag is set.
 */
export function shouldSeedDemoAccounts(env: SeedEnv = process.env): boolean {
  if (env.FWETA_SEED_DEMO !== "true") return false;
  if (env.VERCEL_ENV === "production") return false;
  if (env.NODE_ENV === "production") return false;
  return true;
}

/** Emails that would be inserted. Empty when seeding is off or they already exist. */
export function demoEmailsToSeed(existingEmails: string[], env: SeedEnv = process.env): string[] {
  if (!shouldSeedDemoAccounts(env)) return [];
  const have = new Set(existingEmails.map((email) => email.trim().toLowerCase()));
  return DEMO_EMAILS.filter((email) => !have.has(email));
}

function ensureWallet(store: { wallets: Wallet[] }, userId: string, now: string) {
  if (store.wallets.some((wallet) => wallet.userId === userId)) return;
  store.wallets.push({
    userId,
    availableCents: 0,
    pendingCents: 0,
    updatedAt: now,
  });
}

let seedInFlight: Promise<{ seeded: boolean }> | null = null;

async function seedDemoAccountsOnce(): Promise<{ seeded: boolean }> {
  if (!shouldSeedDemoAccounts()) return { seeded: false };
  try {
    const existing = await readStore();
    const missing = demoEmailsToSeed(existing.profiles.map((profile) => profile.email));
    if (missing.length === 0) return { seeded: false };

    const now = nowIso();
    await updateStore((store) => {
      for (const account of DEMO_ACCOUNTS) {
        const email = account.email.trim().toLowerCase();
        if (!missing.includes(email)) continue;
        if (store.profiles.some((profile) => profile.email.trim().toLowerCase() === email)) continue;
        const profile: Profile = {
          ...account,
          id: newId(),
          email,
          createdAt: now,
          updatedAt: now,
          passwordHash: DEMO_PASSWORD_HASH,
        };
        store.profiles.push(profile);
        ensureWallet(store, profile.id, now);
      }
    });
    return { seeded: true };
  } catch (err) {
    console.warn("[fweta] seedDemoAccounts failed:", err instanceof Error ? err.message : err);
    return { seeded: false };
  }
}

/** Insert *@fweta.test demo accounts once per process. Not called from requests. */
export async function seedDemoAccounts(): Promise<{ seeded: boolean }> {
  if (!shouldSeedDemoAccounts()) return { seeded: false };
  if (!seedInFlight) {
    seedInFlight = seedDemoAccountsOnce().finally(() => {
      seedInFlight = null;
    });
  }
  return seedInFlight;
}
