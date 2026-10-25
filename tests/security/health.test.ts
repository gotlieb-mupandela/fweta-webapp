import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseStoreDiagnostics } from "../../lib/db/supabase-store";
import {
  classifyHealthRequest,
  publicHealthBody,
  STORE_REVISION_MIGRATION,
  supabaseDetailBody,
} from "../../lib/health/store-health";

function diag(overrides: Partial<SupabaseStoreDiagnostics> = {}): SupabaseStoreDiagnostics {
  return {
    jsonBlobLoadOk: true,
    jsonBlobLoadError: null,
    jsonBlobSaveOk: false,
    jsonBlobSaveError: "not probed",
    relationalLoadOk: true,
    relationalLoadError: null,
    profileCount: 4,
    probeRan: false,
    revisionColumn: "unchecked",
    casRpc: "unchecked",
    ...overrides,
  };
}

test("public health is liveness plus load and has no counts", () => {
  const body = publicHealthBody("supabase", true);
  assert.deepEqual(body, { ok: true, mode: "supabase", load: "ok" });
  assert.equal("profileCount" in body, false);
  assert.equal("hint" in body, false);
  assert.deepEqual(publicHealthBody("supabase", false), {
    ok: false,
    mode: "supabase",
    load: "fail",
  });
});

test("skipped save probe does not report JSON save failed", () => {
  const body = supabaseDetailBody(diag(), { probe: false, relationalSync: false });
  assert.equal(body.ok, true);
  assert.equal(body.checks.jsonBlobSave, "not probed");
  assert.equal(body.hint, null);
  assert.equal("revisionMigration" in body, false);
  assert.equal(JSON.stringify(body).includes("JSON save failed"), false);
});

test("JSON save failed hint appears only after a failed authorized probe", () => {
  const missing = supabaseDetailBody(
    diag({
      probeRan: true,
      jsonBlobSaveOk: false,
      jsonBlobSaveError: "Could not find the function",
      revisionColumn: "missing",
      casRpc: "missing",
    }),
    { probe: true, relationalSync: false },
  );
  assert.equal(missing.ok, false);
  assert.match(missing.hint ?? "", /^JSON save failed/);
  assert.equal(missing.revisionMigration?.applied, false);
  assert.equal(missing.revisionMigration?.migration, STORE_REVISION_MIGRATION);
  assert.match(missing.hint ?? "", /20261021165036_fweta_app_store_revision\.sql/);

  const other = supabaseDetailBody(
    diag({
      probeRan: true,
      jsonBlobSaveOk: false,
      jsonBlobSaveError: "permission denied",
      revisionColumn: "ok",
      casRpc: "error",
    }),
    { probe: true, relationalSync: false },
  );
  assert.match(other.hint ?? "", /^JSON save failed/);
  assert.equal(other.revisionMigration?.migration, undefined);

  const ok = supabaseDetailBody(
    diag({
      probeRan: true,
      jsonBlobSaveOk: true,
      jsonBlobSaveError: null,
      revisionColumn: "ok",
      casRpc: "ok",
    }),
    { probe: true, relationalSync: true },
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.hint, null);
  assert.equal(ok.revisionMigration?.applied, true);
});

test("health detail requires a matching cron bearer", () => {
  assert.equal(
    classifyHealthRequest({ authorization: null, probe: false, cronSecret: undefined }),
    "public",
  );
  assert.equal(
    classifyHealthRequest({ authorization: null, probe: true, cronSecret: "secret" }),
    "unauthorized",
  );
  assert.equal(
    classifyHealthRequest({ authorization: "Bearer secret", probe: true, cronSecret: "secret" }),
    "detail",
  );
  assert.equal(
    classifyHealthRequest({ authorization: "Bearer no", probe: false, cronSecret: "secret" }),
    "unauthorized",
  );
  assert.equal(
    classifyHealthRequest({ authorization: null, probe: true, cronSecret: undefined }),
    "unauthorized",
  );
});
