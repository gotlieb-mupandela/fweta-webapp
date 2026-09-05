import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import { getPayoutSecret } from "@/lib/auth/secret";

import type { DatabaseStore } from "./types";
import {
  isSupabaseStoreEnabled,
  loadStoreFromSupabase,
  saveStoreToSupabase,
} from "./supabase-store";

/**
 * Local dev: file store at data/store.json (+ in-memory cache).
 * Vercel/production: set SUPABASE_SERVICE_ROLE_KEY to persist via Supabase.
 * - Relational tables (fweta_*) when migration 20260829150000 is applied
 * - JSON backup in fweta_app_store (migration 20260829140000)
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
});

declare global {
  // Persist store across hot reloads / warm serverless instances
  var __fwetaStore: DatabaseStore | undefined;
}

let writeQueue: Promise<void> = Promise.resolve();
let initPromise: Promise<DatabaseStore> | null = null;

function cloneStore(store: DatabaseStore): DatabaseStore {
  // Prevent callers mutating the cached store outside updateStore().
  // Store is small (local MVP) so structuredClone cost is negligible.
  return structuredClone(store);
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
    // Never crash the request if disk is unavailable — memory store still works.
    console.warn("[fweta] persist skipped:", err instanceof Error ? err.message : err);
  }
}

async function initStore(): Promise<DatabaseStore> {
  if (globalThis.__fwetaStore) {
    return globalThis.__fwetaStore;
  }

  if (isSupabaseStoreEnabled()) {
    try {
      const fromRemote = await loadStoreFromSupabase();
      const store = fromRemote ?? emptyStore();
      globalThis.__fwetaStore = store;
      return store;
    } catch (err) {
      console.warn("[fweta] ensureStore supabase failed:", err instanceof Error ? err.message : err);
      const store = emptyStore();
      globalThis.__fwetaStore = store;
      return store;
    }
  }

  const fromDisk = await loadFromDisk();
  const store = fromDisk ?? emptyStore();
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
    const store = await ensureStore();
    await mutator(store);
    globalThis.__fwetaStore = store;

    if (isSupabaseStoreEnabled()) {
      try {
        await saveStoreToSupabase(store);
      } catch (err) {
        console.warn("[fweta] supabase save failed:", err instanceof Error ? err.message : err);
      }
      return;
    }

    await persist(store);
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
