import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readRepo(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

test("the revoke migration removes execute on fweta_json_store_set when it exists", () => {
  const revoke = readRepo("supabase/migrations/20261026140000_store_revision_revoke_writes.sql");
  assert.match(revoke, /to_regprocedure\('public\.fweta_json_store_set\(jsonb\)'\) is null/);
  assert.match(
    revoke,
    /revoke execute on function public\.fweta_json_store_set\(jsonb\) from service_role, public, anon, authenticated;/,
  );
});

test("the revoke rollback grants fweta_json_store_set execute to service_role only", () => {
  const rollback = readRepo("supabase/rollbacks/20261026140000_store_revision_revoke_writes_rollback.sql");
  assert.match(rollback, /to_regprocedure\('public\.fweta_json_store_set\(jsonb\)'\) is null/);
  assert.match(rollback, /grant execute on function public\.fweta_json_store_set\(jsonb\) to service_role;/);
  assert.equal(rollback.includes("fweta_json_store_set(jsonb) to public"), false);
  assert.equal(rollback.includes("fweta_json_store_set(jsonb) to anon"), false);
  assert.equal(rollback.includes("fweta_json_store_set(jsonb) to authenticated"), false);
});

test("the revoke rollback restores every table privilege the revoke removes", () => {
  const rollback = readRepo("supabase/rollbacks/20261026140000_store_revision_revoke_writes_rollback.sql");
  const revoke = readRepo("supabase/migrations/20261026140000_store_revision_revoke_writes.sql");
  assert.match(
    rollback,
    /grant select, insert, update, delete, truncate, references, trigger\s+on table public\.fweta_app_store to service_role;/,
  );
  assert.match(revoke, /revoke insert, update, delete, truncate, references, trigger on table public\.fweta_app_store from service_role;/);
  assert.match(rollback, /grant maintain on table public\.fweta_app_store to service_role/);
  assert.match(revoke, /revoke maintain on table public\.fweta_app_store from service_role/);
  assert.match(rollback, /server_version_num/);
  assert.match(revoke, /server_version_num/);
});

test("fweta_cas_save_store execute is granted to service_role only", () => {
  const additive = readRepo("supabase/migrations/20261026130000_store_revision_additive.sql");
  assert.match(
    additive,
    /revoke all on function public\.fweta_cas_save_store\(jsonb, bigint\) from public, anon, authenticated;/,
  );
  assert.match(
    additive,
    /grant execute on function public\.fweta_cas_save_store\(jsonb, bigint\) to service_role;/,
  );
  assert.equal(additive.includes("fweta_cas_save_store(jsonb, bigint) to public"), false);
  assert.equal(additive.includes("fweta_cas_save_store(jsonb, bigint) to anon"), false);
  assert.equal(additive.includes("fweta_cas_save_store(jsonb, bigint) to authenticated"), false);

  const rehearsal = readRepo("scripts/rehearsal/sql/20_after_additive.sql");
  assert.match(rehearsal, /anon is denied execute on fweta_cas_save_store/);
  assert.match(rehearsal, /authenticated is denied execute on fweta_cas_save_store/);
  assert.match(rehearsal, /has_function_privilege\('service_role', 'public\.fweta_cas_save_store\(jsonb,bigint\)'::regprocedure, 'execute'\)/);
});

test("app and lib code does not call fweta_json_store_set", () => {
  const hits: string[] = [];
  for (const dir of ["app", "lib"]) {
    for (const file of sourceFiles(path.join(root, dir))) {
      const text = readFileSync(file, "utf8");
      if (text.includes("fweta_json_store_set")) hits.push(path.relative(root, file));
    }
  }
  assert.deepEqual(hits, []);
});
