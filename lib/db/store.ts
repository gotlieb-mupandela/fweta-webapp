import { promises as fs } from "fs";
import path from "path";

import { decryptSecret, encryptSecret, reencryptStoreSecrets } from "@/lib/security/payout-cipher";

import { hydrateStoreCampaigns } from "@/lib/rewards/content-rewards";

import { activeStoreDriver } from "./adapter";
import type { DatabaseStore } from "./types";
import { commitStoreToSupabase, loadStoreFromSupabase, StorePersistError } from "./supabase-store";

/**
 * Store adapter.
 * - Local dev (no Supabase keys, or FWETA_STORE=file): data/store.json
 *   Development and tests may set FWETA_DATA_DIR. Production ignores it.
 * - Production (Supabase URL + service role key): Postgres JSON document.
 *   Writes reload that document and compare-and-swap on its revision.
 *   The in-memory copy is a read cache only. It is not the base for a save,
 *   so another instance or a direct SQL edit cannot be overwritten by it.
 *   Relational tables are optional, and only when FWETA_RELATIONAL_SYNC=true.
 * A failed Supabase load serves an empty view for that request and does not
 * write it back. See lib/db/adapter.ts.
 */
type StoreDirEnv = {
  NODE_ENV?: string;
  FWETA_DATA_DIR?: string;
  VERCEL?: string;
  AWS_LAMBDA_FUNCTION_NAME?: string;
};

const DATA_DIR =
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? path.join("/tmp", "fweta-data")
    : path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

/**
 * Local JSON directory. FWETA_DATA_DIR overrides the default in development
 * and tests. Production ignores that variable.
 */
export function resolveStoreDataDir(env: StoreDirEnv = process.env): string {
  if (env.NODE_ENV !== "production") {
    const override = env.FWETA_DATA_DIR?.trim();
    if (override) return path.resolve(override);
  }
  if (env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join("/tmp", "fweta-data");
  }
  return path.join(process.cwd(), "data");
}

/** Set only outside production. Production file access stays on STORE_PATH. */
function devDataDirOverride(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  const override = process.env.FWETA_DATA_DIR?.trim();
  return override ? path.resolve(override) : null;
}

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

async function readStoreText(file: string, dynamic: boolean): Promise<string | null> {
  try {
    if (dynamic) return await fs.readFile(/*turbopackIgnore: true*/ file, "utf8");
    return await fs.readFile(STORE_PATH, "utf8");
  } catch {
    return null;
  }
}

async function loadFromDisk(): Promise<DatabaseStore | null> {
  const override = devDataDirOverride();
  const raw = await readStoreText(override ? path.join(override, "store.json") : STORE_PATH, override != null);
  if (raw == null) return null;
  try {
    return { ...emptyStore(), ...JSON.parse(raw) } as DatabaseStore;
  } catch (err) {
    // Corrupted JSON: back it up instead of silently overwriting and losing data.
    try {
      const backupName = `store.corrupt-${Date.now()}.json`;
      const backup = override ? path.join(override, backupName) : path.join(DATA_DIR, backupName);
      if (override) {
        await fs.mkdir(/*turbopackIgnore: true*/ override, { recursive: true });
        await fs.writeFile(/*turbopackIgnore: true*/ backup, raw, "utf8");
      } else {
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.writeFile(path.join(DATA_DIR, backupName), raw, "utf8");
      }
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
    const body = JSON.stringify(store, null, 2);
    const override = devDataDirOverride();
    if (override) {
      const file = path.join(override, "store.json");
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.mkdir(/*turbopackIgnore: true*/ override, { recursive: true });
      await fs.writeFile(/*turbopackIgnore: true*/ tmp, body, "utf8");
      await fs.rename(/*turbopackIgnore: true*/ tmp, file);
      return;
    }
    await fs.mkdir(DATA_DIR, { recursive: true });
    // Atomic write: tmp + rename so a crash never leaves half-written JSON.
    const tmp = `${STORE_PATH}.${process.pid}.tmp`;
    await fs.writeFile(tmp, body, "utf8");
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
    reencryptStoreSecrets(draft);
    globalThis.__fwetaStore = draft;
    await persist(draft);
  });
  // Keep the queue healthy for the next caller, but still surface this error.
  writeQueue = run.catch(() => undefined);
  await run;
  return ensureStore();
}

export { decryptSecret, encryptSecret };

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
    const override = devDataDirOverride();
    if (override) await fs.access(/*turbopackIgnore: true*/ path.join(override, "store.json"));
    else await fs.access(STORE_PATH);
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
