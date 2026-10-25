import { AsyncLocalStorage } from "node:async_hooks";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Next's server bundle uses the real ALS only when it is already global.
const globalAls = globalThis as typeof globalThis & {
  AsyncLocalStorage?: typeof AsyncLocalStorage;
};
if (!globalAls.AsyncLocalStorage) globalAls.AsyncLocalStorage = AsyncLocalStorage;

const dir = mkdtempSync(path.join(tmpdir(), "fweta-role-"));

const previous = {
  store: process.env.FWETA_STORE,
  dir: process.env.FWETA_DATA_DIR,
  auth: process.env.AUTH_SECRET,
};

process.env.FWETA_STORE = "file";
process.env.FWETA_DATA_DIR = dir;
process.env.AUTH_SECRET = "fweta-test-auth-secret";

export const authDataDir = dir;

export function restoreAuthEnv(): void {
  if (previous.store === undefined) delete process.env.FWETA_STORE;
  else process.env.FWETA_STORE = previous.store;
  if (previous.dir === undefined) delete process.env.FWETA_DATA_DIR;
  else process.env.FWETA_DATA_DIR = previous.dir;
  if (previous.auth === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = previous.auth;
}
