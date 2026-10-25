import assert from "node:assert/strict";
import test from "node:test";

import {
  commitLoadedMutation,
  conflictBackoffMs,
  STORE_COMMIT_DEADLINE_MS,
  StoreConflictError,
  StoreDeadlineError,
} from "@/lib/db/store-commit";

test("conflict backoff grows and stays jittered", () => {
  const low = conflictBackoffMs(1, () => 0);
  const high = conflictBackoffMs(1, () => 0.999);
  assert.equal(low, 50);
  assert.ok(high > low);
  assert.ok(high <= 100);
  const later = conflictBackoffMs(4, () => 0);
  assert.ok(later > high);
});

test("a conflict retry waits for backoff before the next save", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  let saves = 0;
  const pending = commitLoadedMutation({
    maxAttempts: 2,
    deadlineMs: 60_000,
    random: () => 0,
    load: async () => ({ store: { n: 1 }, revision: 1 }),
    save: async () => {
      saves += 1;
      if (saves === 1) return { ok: false as const, conflict: true as const };
      return { ok: true as const, revision: 2 };
    },
    clone: (store) => ({ ...store }),
    mutate: () => undefined,
  });

  await flush();
  assert.equal(saves, 1);
  const wait = conflictBackoffMs(1, () => 0);
  t.mock.timers.tick(wait - 1);
  await flush();
  assert.equal(saves, 1);
  t.mock.timers.tick(1);
  await pending;
  assert.equal(saves, 2);
  t.mock.timers.reset();
});

test("a hung save hits the overall deadline", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  let loads = 0;
  const pending = commitLoadedMutation({
    load: (): Promise<{ store: { n: number }; revision: number }> => {
      loads += 1;
      return new Promise(() => undefined);
    },
    save: async () => ({ ok: true as const, revision: 1 }),
    clone: (store: { n: number }) => store,
    mutate: () => undefined,
    random: () => 0,
  });
  const settled = pending.then(
    () => null,
    (error: unknown) => error,
  );
  t.mock.timers.tick(STORE_COMMIT_DEADLINE_MS);
  const error = await settled;
  assert.ok(error instanceof StoreDeadlineError);
  assert.equal(/supabase/i.test(error instanceof Error ? error.message : ""), false);
  assert.equal(loads, 1);
  assert.ok(loads < 8);
  t.mock.timers.reset();
});

test("exhausted conflicts still throw after the retries", async () => {
  let saves = 0;
  await assert.rejects(
    () =>
      commitLoadedMutation({
        maxAttempts: 3,
        deadlineMs: 60_000,
        random: () => 0,
        sleep: async () => undefined,
        load: async () => ({ store: { n: 1 }, revision: 1 }),
        save: async () => {
          saves += 1;
          return { ok: false as const, conflict: true as const };
        },
        clone: (store) => ({ ...store }),
        mutate: () => undefined,
      }),
    StoreConflictError,
  );
  assert.equal(saves, 3);
});

test("the service client fetch aborts when its timeout signal fires", async () => {
  const { spawn } = await import("node:child_process");
  const script = [
    'import { fetchWithStoreTimeout, STORE_FETCH_TIMEOUT_MS } from "./lib/db/supabase-store.ts";',
    'if (STORE_FETCH_TIMEOUT_MS !== 15000) throw new Error("expected 15s");',
    "globalThis.fetch = ((_input, init) => new Promise((_resolve, reject) => {",
    '  const signal = init?.signal;',
    '  if (!signal) reject(new Error("missing signal"));',
    '  else signal.addEventListener("abort", () => reject(new Error("aborted")));',
    "}));",
    "const started = Date.now();",
    "const keepAlive = setTimeout(() => undefined, 5000);",
    'try { await fetchWithStoreTimeout("https://example.invalid/store", undefined, 40); throw new Error("should abort"); }',
    'catch (error) { if (!(error instanceof Error) || !error.message.toLowerCase().includes("aborted")) throw error; }',
    "finally { clearTimeout(keepAlive); }",
    'if (Date.now() - started > 2000) throw new Error("too slow");',
    'console.log("ok");',
  ].join("\n");

  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn("npx", ["tsx", "--input-type=module", "-e", script], {
      cwd: "/workspace",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 && stdout.includes("ok")) resolve(stdout);
      else reject(new Error(stderr || stdout || `exit ${code}`));
    });
  });
  assert.match(output, /ok/);
});

async function flush() {
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
}
