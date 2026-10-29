import assert from "node:assert/strict";
import test from "node:test";

import type { RateCardItem } from "../../lib/db/types";
import { commitLoadedMutation } from "../../lib/db/store-commit";
import { addRateCardOnce } from "../../lib/influencers/rate-cards";

type Doc = { rateCards: RateCardItem[] };

function createDocument() {
  let row = { revision: 1, store: { rateCards: [] as RateCardItem[] } };
  let tail: Promise<unknown> = Promise.resolve();
  return {
    get: () => row,
    async load() {
      return { store: structuredClone(row.store), revision: row.revision };
    },
    save(store: Doc, expected: number | null) {
      const run = tail.then(() => {
        if (expected === null || row.revision !== expected) {
          return { ok: false as const, conflict: true as const };
        }
        row = { revision: row.revision + 1, store: structuredClone(store) };
        return { ok: true as const, revision: row.revision };
      });
      tail = run.catch(() => undefined);
      return run;
    },
  };
}

const card = {
  influencerProfileId: "p1",
  title: "One reel",
  description: "",
  type: "per_reel" as const,
  platform: "tiktok" as const,
  priceCents: 50000,
  active: true,
};

test("two simultaneous rate card adds produce one card", async () => {
  const doc = createDocument();
  // Both requests load the same revision before either saves.
  let loads = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  const load = async () => {
    const loaded = await doc.load();
    loads += 1;
    if (loads === 2) release();
    if (loads <= 2) await gate;
    return loaded;
  };
  let n = 0;
  const add = () =>
    commitLoadedMutation<Doc>({
      load,
      save: (store, rev) => doc.save(store, rev),
      clone: (store) => structuredClone(store),
      mutate: (store) => {
        addRateCardOnce(store, card, () => `id-${++n}`);
      },
    });
  await Promise.all([add(), add()]);
  assert.equal(doc.get().store.rateCards.length, 1);
});

test("the same card later than the window is a new card", () => {
  const store: Doc = { rateCards: [] };
  const t = Date.parse("2026-10-29T10:00:00Z");
  addRateCardOnce(store, card, () => "a", t);
  const again = addRateCardOnce(store, card, () => "b", t + 1000);
  assert.deepEqual(again, { id: "a", created: false });
  const later = addRateCardOnce(store, card, () => "c", t + 20_000);
  assert.equal(later.created, true);
  assert.equal(store.rateCards.length, 2);
});
