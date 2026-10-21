import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import { getPayoutSecret } from "@/lib/auth/secret";

import { hydrateStoreCampaigns } from "@/lib/rewards/content-rewards";

import { activeStoreDriver } from "./adapter";
import type { DatabaseStore } from "./types";
import { commitStoreToSupabase, loadStoreFromSupabase, StorePersistError } from "./supabase-store";

/**
 * Store adapter.
 * - Local dev (no Supabase keys, or FWETA_STORE=file): data/store.json
 * - Production (Supabase URL + service role key): Postgres JSON document.
 *   Writes reload that document and compare-and-swap on its revision.
 *   The in-memory copy is a read cache only. It is not the base for a save,
 *   so another instance or a direct SQL edit cannot be overwritten by it.
 *   Relational tables are optional, and only when FWETA_RELATIONAL_SYNC=true.
 * A failed Supabase load serves an empty view for that request and does not
 * write it back. See lib/db/adapter.ts.
 */
const DATA_DIR =
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? path.join("/tmp", "fweta-data")
    : path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

const emptyStore = (): DatabaseStore => ({
  profiles: [],
  campaigns: [],
  submissions: [],
  viewSnapshots: [],
  wallets: [],
  ledgerEntries: [],
  payoutMethods: [],
  withdrawalRequests: [],
  influencerProfiles: [],
  rateCards: [],
  bookings: [],
  brandDeposits: [],
  fraudFlags: [],
  notifications: [],
  notificationDispatches: [],
  linkedAccounts: [],
  socialAccounts: [],
  workspaces: [],
  workspaceMembers: [],
  savedCampaigns: [],
  supportTickets: [],
  supportMessages: [],
  auditLog: [],
  prizeAwards: [],
  platformSettings: [],
  ugcBriefs: [],
  ugcApplications: [],
  ugcDeliveries: [],
  contentLicenses: [],
  licenseDisputes: [],
  creatorPortfolios: [],
  businessListings: [],
  creatorReviews: [],
});

declare global {
  // Read cache for this process. Writes do not use it as the document they save.
  var __fwetaStore: DatabaseStore | undefined;
}

let writeQueue: Promise<void> = Promise.resolve();
let initPromise: Promise<DatabaseStore> | null = null;

function cloneStore(store: DatabaseStore): DatabaseStore {
  // Prevent callers mutating the cached store outside updateStore().
  // Store is small (local MVP) so structuredClone cost is negligible.
  // Hydrate so campaigns saved before content-rewards fields still read cleanly.
  return hydrateStoreCampaigns(structuredClone(store));
}

async function loadFromDisk(): Promise<DatabaseStore | null> {
  let raw: string;
  try {
    raw = await fs.readFile(STORE_PATH, "utf8");
  } catch {
    return null;
  }
  try {
    return { ...emptyStore(), ...JSON.parse(raw) } as DatabaseStore;
  } catch (err) {
    // Corrupted JSON: back it up instead of silently overwriting and losing data.
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const backup = path.join(DATA_DIR, `store.corrupt-${Date.now()}.json`);
      await fs.writeFile(backup, raw, "utf8");
      console.warn(`[fweta] store.json corrupt, backed up to ${backup}`);
    } catch {
      // best-effort backup only
    }
    console.warn(
      "[fweta] store.json parse failed, starting empty:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

async function persist(store: DatabaseStore) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    // Atomic write: tmp + rename so a crash never leaves half-written JSON.
    const tmp = `${STORE_PATH}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
    await fs.rename(tmp, STORE_PATH);
  } catch (err) {
    // Never crash the request if disk is unavailable. The memory store still works.
    console.warn("[fweta] persist skipped:", err instanceof Error ? err.message : err);
  }
}

async function initStore(): Promise<DatabaseStore> {
  if (globalThis.__fwetaStore) {
    return globalThis.__fwetaStore;
  }

  if (activeStoreDriver() === "supabase") {
    try {
      const fromRemote = await loadStoreFromSupabase();
      if (!fromRemote) {
        console.warn(
          "[fweta] Supabase store could not be loaded. Serving an empty view for this request and not writing it back.",
        );
        return hydrateStoreCampaigns(emptyStore());
      }
      const store = hydrateStoreCampaigns(fromRemote);
      globalThis.__fwetaStore = store;
      return store;
    } catch (err) {
      console.warn("[fweta] ensureStore supabase failed:", err instanceof Error ? err.message : err);
      return hydrateStoreCampaigns(emptyStore());
    }
  }

  const fromDisk = await loadFromDisk();
  const store = hydrateStoreCampaigns(fromDisk ?? emptyStore());
  globalThis.__fwetaStore = store;
  if (!fromDisk) {
    await persist(store);
  }
  return store;
}

async function ensureStore(): Promise<DatabaseStore> {
  if (globalThis.__fwetaStore) {
    return globalThis.__fwetaStore;
  }
  if (!initPromise) {
    initPromise = initStore().finally(() => {
      initPromise = null;
    });
  }
  return initPromise;
}

export async function readStore(): Promise<DatabaseStore> {
  const store = await ensureStore();
  return cloneStore(store);
}

export async function updateStore(
  mutator: (store: DatabaseStore) => void | Promise<void>,
): Promise<DatabaseStore> {
  // Chain onto a never-rejected queue: a throwing mutator must not poison
  // all future writes (previously `writeQueue.then(...)` stayed rejected).
  const run = writeQueue.catch(() => undefined).then(async () => {
    if (activeStoreDriver() === "supabase") {
      // commitStoreToSupabase loads the current row itself. Saving the warm
      // cache here is what let one instance drop another instance's signup.
      try {
        const saved = await commitStoreToSupabase(mutator);
        globalThis.__fwetaStore = saved;
      } catch (err) {
        if (err instanceof StorePersistError) {
          globalThis.__fwetaStore = undefined;
        }
        throw err;
      }
      return;
    }

    const current = await ensureStore();
    // Mutate a copy. A throw (insufficient funds, not allowed) must not leave
    // a half-applied wallet debit or an orphan campaign in memory.
    // cloneStore already hydrates campaigns saved before content-rewards fields.
    const draft = cloneStore(current);
    await mutator(draft);
    globalThis.__fwetaStore = draft;
    await persist(draft);
  });
  // Keep the queue healthy for the next caller, but still surface this error.
  writeQueue = run.catch(() => undefined);
  await run;
  return ensureStore();
}

/** Simple reversible encryption for bank details at rest (local MVP). */
function deriveKey() {
  // Same scrypt parameters as before so existing local ciphertext still decrypts.
  return scryptSync(getPayoutSecret(), "fweta-payout-salt", 32);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  if (buf.length < 28) throw new Error("Invalid encrypted payload.");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function diagnoseLocalStore() {
  const store = await readStore();
  let persisted = false;
  try {
    await fs.access(STORE_PATH);
    persisted = true;
  } catch {
    persisted = false;
  }
  return {
    persisted,
    profileCount: store.profiles.length,
    campaignCount: store.campaigns.length,
    submissionCount: store.submissions.length,
    walletCount: store.wallets.length,
    ledgerCount: store.ledgerEntries.length,
  };
}
