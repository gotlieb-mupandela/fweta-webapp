import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import type { DatabaseStore } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
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

let writeQueue: Promise<void> = Promise.resolve();

async function ensureStore(): Promise<DatabaseStore> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    return { ...emptyStore(), ...JSON.parse(raw) } as DatabaseStore;
  } catch {
    const store = emptyStore();
    await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
    return store;
  }
}

export async function readStore(): Promise<DatabaseStore> {
  return ensureStore();
}

export async function updateStore(
  mutator: (store: DatabaseStore) => void | Promise<void>,
): Promise<DatabaseStore> {
  writeQueue = writeQueue.then(async () => {
    const store = await ensureStore();
    await mutator(store);
    await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
  });
  await writeQueue;
  return ensureStore();
}

/** Simple reversible encryption for bank details at rest (local MVP). */
function deriveKey() {
  const secret =
    process.env.PAYOUT_ENCRYPTION_KEY ||
    process.env.AUTH_SECRET ||
    "fweta-local-dev-secret-change-me";
  return scryptSync(secret, "fweta-payout-salt", 32);
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
