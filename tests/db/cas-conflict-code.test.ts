import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const dir = new URL("../../supabase/migrations/", import.meta.url);

test("the newest fweta_cas_save_store raises a conflict PostgREST does not retry", () => {
  const files = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
  const latest = files
    .filter((name) => /create or replace function public\.fweta_cas_save_store/i.test(readFileSync(new URL(name, dir), "utf8")))
    .at(-1);
  assert.ok(latest);
  const sql = readFileSync(new URL(latest, dir), "utf8");
  const body = sql.slice(sql.search(/create or replace function public\.fweta_cas_save_store/i));
  // 40001 is retried by PostgREST forever when the revision is stale.
  assert.equal(body.includes("'40001'"), false);
  assert.match(body, /'PT409'/);
});

test("the app reads PT409 as a store conflict", () => {
  const src = readFileSync(new URL("../../lib/db/supabase-store.ts", import.meta.url), "utf8");
  assert.match(src, /error\.code === "PT409"/);
  assert.match(src, /fweta_store_conflict/);
});
