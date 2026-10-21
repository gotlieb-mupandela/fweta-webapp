import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  commitLoadedMutation,
  parseStoreRevision,
  StoreConflictError,
} from "../../lib/db/store-commit";

type Profile = { id: string; role: string };
type MiniStore = { profiles: Profile[] };
type Row = { revision: number; profiles: Profile[] };

/**
 * In-memory stand-in for fweta_cas_save_store plus the revision trigger.
 * A mismatched revision does not write. A matching write stores the new
 * document and bumps revision, which is what the trigger does when data changes.
 */
function createDocument(initial: Row) {
  let row: Row = {
    revision: initial.revision,
    profiles: structuredClone(initial.profiles),
  };
  let tail: Promise<void> = Promise.resolve();

  return {
    snapshot(): Row {
      return { revision: row.revision, profiles: structuredClone(row.profiles) };
    },
    /** Direct SQL edit. Bumps revision the same way the trigger does. */
    directEdit(apply: (profiles: Profile[]) => void) {
      const profiles = structuredClone(row.profiles);
      apply(profiles);
      row = { revision: row.revision + 1, profiles };
    },
    async load(): Promise<{ store: MiniStore; revision: number }> {
      return {
        store: { profiles: structuredClone(row.profiles) },
        revision: row.revision,
      };
    },
    save(store: MiniStore, expectedRevision: number | null): Promise<
      { ok: true; revision: number } | { ok: false; conflict: true }
    > {
      const run = tail.then(async () => {
        if (expectedRevision === null || row.revision !== expectedRevision) {
          return { ok: false as const, conflict: true as const };
        }
        row = {
          revision: row.revision + 1,
          profiles: structuredClone(store.profiles),
        };
        return { ok: true as const, revision: row.revision };
      });
      tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}

test("the server save path compare-and-swaps and does not upsert the document", () => {
  const supabaseStore = readFileSync(new URL("../../lib/db/supabase-store.ts", import.meta.url), "utf8");
  const store = readFileSync(new URL("../../lib/db/store.ts", import.meta.url), "utf8");
  assert.match(supabaseStore, /commitLoadedMutation\(/);
  assert.match(store, /commitStoreToSupabase\(mutator\)/);
  assert.equal(supabaseStore.includes(".upsert("), false);
  assert.equal(supabaseStore.includes(".update("), false);
  assert.equal(supabaseStore.includes("__fwetaBlobRevision"), false);
});

test("parseStoreRevision accepts numbers and bigint strings", () => {
  assert.equal(parseStoreRevision(0), 0);
  assert.equal(parseStoreRevision(12), 12);
  assert.equal(parseStoreRevision("12"), 12);
  assert.equal(parseStoreRevision(" 7 "), 7);
  assert.equal(parseStoreRevision("12.5"), null);
  assert.equal(parseStoreRevision("-1"), null);
  assert.equal(parseStoreRevision(null), null);
  assert.equal(parseStoreRevision(1.5), null);
});

test(
  "two stale copies and a direct edit all survive one compare-and-swap",
  { timeout: 5_000 },
  async () => {
    // What each warm instance still has in memory: creator only.
    // The database has already accepted an admin signup.
    const staleCacheA: MiniStore = { profiles: [{ id: "creator", role: "clipper" }] };
    const staleCacheB: MiniStore = { profiles: [{ id: "creator", role: "clipper" }] };
    const doc = createDocument({
      revision: 4,
      profiles: [
        { id: "creator", role: "clipper" },
        { id: "admin", role: "clipper" },
      ],
    });

    let firstWave = 0;
    let openFirstWave: () => void = () => {};
    const firstWaveGate = new Promise<void>((resolve) => {
      openFirstWave = resolve;
    });
    let directEditApplied = false;

    const load = async () => {
      if (firstWave < 2) {
        const stale = await doc.load();
        firstWave += 1;
        if (firstWave === 2) {
          if (!directEditApplied) {
            // SQL editor changes the admin role after both instances have read.
            doc.directEdit((profiles) => {
              const admin = profiles.find((profile) => profile.id === "admin");
              if (!admin) throw new Error("admin missing before direct edit");
              admin.role = "admin";
            });
            directEditApplied = true;
          }
          openFirstWave();
        } else {
          await firstWaveGate;
        }
        return stale;
      }
      return doc.load();
    };

    const saveBoth = Promise.all([
      commitLoadedMutation({
        load,
        save: (store, expectedRevision) => doc.save(store, expectedRevision),
        clone: (store) => structuredClone(store),
        // Instance A adds the brand it just signed up. It must not write staleCacheA.
        mutate: (store) => {
          if (!store.profiles.some((profile) => profile.id === "brand")) {
            store.profiles.push({ id: "brand", role: "brand" });
          }
        },
      }),
      commitLoadedMutation({
        load,
        save: (store, expectedRevision) => doc.save(store, expectedRevision),
        clone: (store) => structuredClone(store),
        mutate: (store) => {
          if (!store.profiles.some((profile) => profile.id === "brand2")) {
            store.profiles.push({ id: "brand2", role: "brand" });
          }
        },
      }),
    ]);

    await saveBoth;

    const saved = doc.snapshot();
    const byId = new Map(saved.profiles.map((profile) => [profile.id, profile]));
    assert.deepEqual(
      [...byId.keys()].sort(),
      ["admin", "brand", "brand2", "creator"],
    );
    assert.equal(byId.get("admin")?.role, "admin");
    assert.equal(byId.get("creator")?.role, "clipper");
    assert.equal(byId.get("brand")?.role, "brand");
    assert.equal(byId.get("brand2")?.role, "brand");
    // The cached copies still lack the admin and the other signup. They were not written.
    assert.deepEqual(staleCacheA.profiles.map((profile) => profile.id), ["creator"]);
    assert.deepEqual(staleCacheB.profiles.map((profile) => profile.id), ["creator"]);
    assert.ok(saved.revision > 4);
  },
);

test("a mutator failure does not write", async () => {
  const doc = createDocument({
    revision: 2,
    profiles: [{ id: "creator", role: "clipper" }],
  });
  await assert.rejects(
    () =>
      commitLoadedMutation({
        load: () => doc.load(),
        save: (store, expectedRevision) => doc.save(store, expectedRevision),
        clone: (store) => structuredClone(store),
        mutate: () => {
          throw new Error("duplicate email");
        },
      }),
    /duplicate email/,
  );
  assert.deepEqual(doc.snapshot().profiles.map((profile) => profile.id), ["creator"]);
  assert.equal(doc.snapshot().revision, 2);
});

test("exhausted conflicts throw and leave the direct edit in place", async () => {
  const doc = createDocument({
    revision: 3,
    profiles: [{ id: "admin", role: "admin" }],
  });
  let saves = 0;
  let edits = 0;
  await assert.rejects(
    () =>
      commitLoadedMutation({
        maxAttempts: 3,
        load: async () => {
          edits += 1;
          const marker = edits;
          doc.directEdit((profiles) => {
            profiles.push({ id: `edit-${marker}`, role: "system" });
          });
          return doc.load();
        },
        save: async () => {
          saves += 1;
          return { ok: false, conflict: true };
        },
        clone: (store) => structuredClone(store),
        mutate: (store) => {
          store.profiles.push({ id: "brand", role: "brand" });
        },
      }),
    StoreConflictError,
  );
  assert.equal(saves, 3);
  const saved = doc.snapshot();
  assert.deepEqual(
    saved.profiles.map((profile) => profile.id),
    ["admin", "edit-1", "edit-2", "edit-3"],
  );
});
