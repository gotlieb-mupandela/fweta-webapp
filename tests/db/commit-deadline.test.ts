import assert from "node:assert/strict";
import test from "node:test";

import {
  commitLoadedMutation,
  conflictBackoffMs,
  STORE_COMMIT_DEADLINE_MS,
  StoreConflictError,
  StoreDeadlineError,
} from "@/lib/db/store-commit";
import { fetchWithStoreTimeout, STORE_FETCH_TIMEOUT_MS } from "@/lib/db/supabase-store";

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
  t.after(() => {
    t.mock.timers.reset();
  });
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
});

test("a hung save hits the overall deadline", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  t.after(() => {
    t.mock.timers.reset();
  });
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
  assert.equal(STORE_FETCH_TIMEOUT_MS, 15_000);
  const original = globalThis.fetch;
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error("missing signal"));
        return;
      }
      const fail = () => reject(new Error("aborted"));
      if (signal.aborted) {
        fail();
        return;
      }
      signal.addEventListener("abort", fail, { once: true });
    });
  }) as typeof fetch;

  const keepAlive = setTimeout(() => undefined, 5_000);
  const started = Date.now();
  try {
    await assert.rejects(
      () => fetchWithStoreTimeout("https://example.invalid/store", undefined, 40),
      (error: unknown) =>
        error instanceof Error && error.message.toLowerCase().includes("aborted"),
    );
    assert.ok(Date.now() - started < 2_000);
  } finally {
    clearTimeout(keepAlive);
    globalThis.fetch = original;
  }
});

async function flush() {
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
}
