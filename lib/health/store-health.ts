import { safeBearerEqual } from "@/lib/security/bearer";

import type { SupabaseStoreDiagnostics } from "@/lib/db/supabase-store";

export const STORE_REVISION_MIGRATION =
  "supabase/migrations/20261021165036_fweta_app_store_revision.sql";

export type HealthAccess = "public" | "detail" | "unauthorized";

export type PublicHealthBody = {
  ok: boolean;
  mode: "local" | "supabase";
  load: "ok" | "fail";
};

export type RevisionMigrationReport = {
  applied: boolean;
  revisionColumn: "ok" | "missing" | "error";
  casRpc: "ok" | "missing" | "error";
  migration?: string;
};

/**
 * Public requests stay on liveness plus load.
 * Detail and the save probe require a matching CRON_SECRET bearer.
 * An unset secret never authorizes, including outside production.
 */
export function classifyHealthRequest(input: {
  authorization: string | null;
  probe: boolean;
  cronSecret: string | undefined;
}): HealthAccess {
  const secret = input.cronSecret?.trim() ?? "";
  const header = input.authorization;
  const attempted = input.probe || Boolean(header);
  if (!secret) return attempted ? "unauthorized" : "public";
  if (safeBearerEqual(header, secret)) return "detail";
  if (attempted) return "unauthorized";
  return "public";
}

export function publicHealthBody(mode: "local" | "supabase", loadOk: boolean): PublicHealthBody {
  return {
    ok: loadOk,
    mode,
    load: loadOk ? "ok" : "fail",
  };
}

export function revisionMigrationReport(
  diag: Pick<SupabaseStoreDiagnostics, "revisionColumn" | "casRpc" | "jsonBlobSaveOk">,
): RevisionMigrationReport {
  const revisionColumn = diag.revisionColumn === "unchecked" ? "error" : diag.revisionColumn;
  const casRpc = diag.casRpc === "unchecked" ? "error" : diag.casRpc;
  const applied = revisionColumn === "ok" && casRpc === "ok" && diag.jsonBlobSaveOk;
  const missing = revisionColumn === "missing" || casRpc === "missing";
  return {
    applied,
    revisionColumn,
    casRpc,
    ...(applied || !missing ? {} : { migration: STORE_REVISION_MIGRATION }),
  };
}

function saveFailureHint(migration: RevisionMigrationReport): string {
  if (!migration.applied && migration.migration) {
    return `JSON save failed. Apply ${migration.migration} so fweta_app_store.revision and fweta_cas_save_store exist.`;
  }
  return "JSON save failed. Run supabase/migrations/20260829140000_fweta_app_store.sql and verify SUPABASE_SERVICE_ROLE_KEY is the SECRET key (not publishable).";
}

export function localDetailBody(
  local: {
    persisted: boolean;
    profileCount: number;
    campaignCount: number;
    submissionCount: number;
    walletCount: number;
    ledgerCount: number;
  },
  probe: boolean,
) {
  return {
    ok: local.persisted,
    mode: "local" as const,
    load: local.persisted ? ("ok" as const) : ("fail" as const),
    profileCount: local.profileCount,
    campaignCount: local.campaignCount,
    submissionCount: local.submissionCount,
    walletCount: local.walletCount,
    ledgerCount: local.ledgerCount,
    checks: {
      filePersist: local.persisted ? "ok" : "store.json not on disk yet",
      jsonBlobSave: probe ? "not applicable" : "not probed",
    },
    hint: null,
    message: local.persisted
      ? "Using local file store (data/store.json). Data survives server restarts."
      : "Local store has not been written to disk yet.",
  };
}

export function supabaseDetailBody(
  diag: SupabaseStoreDiagnostics,
  options: { probe: boolean; relationalSync: boolean },
) {
  const loadOk = diag.jsonBlobLoadOk;
  const migration = options.probe ? revisionMigrationReport(diag) : null;
  const probeFailed = options.probe && !diag.jsonBlobSaveOk;
  let hint: string | null = null;
  if (probeFailed && migration) {
    hint = saveFailureHint(migration);
  } else if (!options.probe && loadOk && diag.profileCount === 0) {
    hint = "Store empty. No profiles have been saved yet.";
  }

  return {
    ok: options.probe ? loadOk && diag.jsonBlobSaveOk : loadOk,
    mode: "supabase" as const,
    load: loadOk ? ("ok" as const) : ("fail" as const),
    relationalSync: options.relationalSync,
    profileCount: diag.profileCount,
    checks: {
      jsonBlobLoad: loadOk ? "ok" : diag.jsonBlobLoadError,
      jsonBlobSave: options.probe
        ? diag.jsonBlobSaveOk
          ? "ok"
          : diag.jsonBlobSaveError
        : "not probed",
      relationalLoad: diag.relationalLoadOk ? "ok" : diag.relationalLoadError,
    },
    ...(migration ? { revisionMigration: migration } : {}),
    hint,
  };
}
