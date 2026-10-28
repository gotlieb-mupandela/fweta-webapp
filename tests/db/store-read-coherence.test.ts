import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { fwetaSupabaseFetch } from "../../lib/db/supabase-fetch";
import {
  createCoherentCache,
  readCoherent,
  rememberCommit,
} from "../../lib/db/read-coherence";
import { commitLoadedMutation } from "../../lib/db/store-commit";
import {
  createMemoryDocument,
  demonstrateInstances,
  initialStore,
} from "../../scripts/repro-two-store-instances";

test("two instances: pinned cache is stale, revision check is not", async () => {
  const report = await demonstrateInstances(createMemoryDocument(1, initialStore()));
  assert.equal(report.pinnedCampaign, "404");
  assert.equal(report.coherentCampaign, "200");
  assert.equal(report.pinnedLogin, "Invalid email or password.");
  assert.equal(report.coherentLogin, "ok");
  assert.equal(report.pinnedSession, "expired");
  assert.equal(report.coherentSession, "ok");
  assert.equal(report.pinnedRateCards, "Create your public profile before adding rate cards.");
  assert.equal(report.coherentRateCards, "ok");
  assert.ok(report.documentLoadsAfterWarm > 0);
  assert.equal(report.blindStaleWriteConflicted, true);
  assert.equal(report.campaignSurvivedBlindWrite, true);
  assert.equal(report.coherentFormKeptBio, true);
  assert.equal(report.staleFormRevertedBio, true);
  assert.equal(report.bothAddsPresent, true);
});

test("a no-op mutator does not write, and a real change does", async () => {
  const doc = createMemoryDocument(4, initialStore());
  let saves = 0;
  const skipped = await commitLoadedMutation({
    load: () => doc.load(),
    save: async (store, expectedRevision) => {
      saves += 1;
      return doc.save(store, expectedRevision);
    },
    clone: (store) => structuredClone(store),
    mutate: () => undefined,
  });
  assert.equal(saves, 0);
  assert.equal(skipped.wrote, false);
  assert.equal(skipped.revision, 4);
  assert.equal((await doc.load()).revision, 4);

  const written = await commitLoadedMutation({
    load: () => doc.load(),
    save: async (store, expectedRevision) => {
      saves += 1;
      return doc.save(store, expectedRevision);
    },
    clone: (store) => structuredClone(store),
    mutate: (store) => {
      store.profiles[0].bio = "next";
    },
  });
  assert.equal(saves, 1);
  assert.equal(written.wrote, true);
  assert.equal(written.revision, 5);
  assert.equal((await doc.load()).store.profiles[0].bio, "next");
});

test("concurrent reads share one load, and a slow load cannot replace a newer commit", async () => {
  const cache = createCoherentCache<{ n: number }>();
  let loads = 0;
  let release: (value: { value: { n: number }; revision: number }) => void = () => {};
  const gate = new Promise<{ value: { n: number }; revision: number }>((resolve) => {
    release = resolve;
  });
  let startedLoad = false;
  const io = {
    readRevision: async () => (cache.revision === undefined ? null : 2),
    load: async () => {
      loads += 1;
      startedLoad = true;
      return gate;
    },
  };

  const first = readCoherent(cache, io);
  const second = readCoherent(cache, io);
  await new Promise<void>((resolve) => {
    const check = () => {
      if (startedLoad) resolve();
      else setImmediate(check);
    };
    check();
  });
  assert.equal(loads, 1);
  rememberCommit(cache, { n: 4 }, 4);
  release({ value: { n: 2 }, revision: 2 });
  assert.equal((await first)?.n, 4);
  assert.equal((await second)?.n, 4);
  assert.equal(cache.revision, 4);

  rememberCommit(cache, { n: 3 }, 3);
  assert.equal(cache.revision, 4);
  assert.equal(cache.value?.n, 4);
});

test("a failed reload does not mark the old copy as the new revision", async () => {
  const cache = createCoherentCache<{ n: number }>();
  rememberCommit(cache, { n: 1 }, 1);
  let loads = 0;
  const io = {
    readRevision: async () => 2,
    load: async () => {
      loads += 1;
      return null;
    },
  };
  assert.equal((await readCoherent(cache, io))?.n, 1);
  assert.equal(cache.revision, 1);
  assert.equal((await readCoherent(cache, io))?.n, 1);
  assert.equal(loads, 2);
});

test("supabase reads are revision-checked and uncached", () => {
  const store = readFileSync(new URL("../../lib/db/store.ts", import.meta.url), "utf8");
  const supabaseStore = readFileSync(new URL("../../lib/db/supabase-store.ts", import.meta.url), "utf8");
  const ensure = store.slice(store.indexOf("async function ensureSupabaseStore"), store.indexOf("async function ensureStore"));
  assert.match(ensure, /readCoherent\(/);
  assert.equal(ensure.includes("__fwetaStore"), false);
  assert.match(store, /activeStoreDriver\(\) === "supabase"/);
  assert.match(store, /rememberCommit\(/);
  assert.match(supabaseStore, /fwetaSupabaseFetch/);
  assert.equal(supabaseStore.includes(".upsert("), false);
  assert.equal(supabaseStore.includes(".update("), false);
});

test("service role fetch sets cache no-store", async () => {
  const calls: Array<RequestInit | undefined> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(init);
    return new Response("ok");
  }) as typeof fetch;
  try {
    await fwetaSupabaseFetch("https://example.test/rest/v1/fweta_app_store", {
      method: "GET",
      cache: "force-cache",
    });
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.method, "GET");
  assert.equal(calls[0]?.cache, "no-store");
});
