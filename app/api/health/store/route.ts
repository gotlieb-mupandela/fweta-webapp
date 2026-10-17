import { NextResponse } from "next/server";

import { activeStoreDriver } from "@/lib/db/adapter";
import { diagnoseLocalStore } from "@/lib/db/store";
import { diagnoseSupabaseStore } from "@/lib/db/supabase-store";
import { safeBearerEqual } from "@/lib/security/bearer";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const driver = activeStoreDriver();
  if (driver === "file") {
    const local = await diagnoseLocalStore();
    return NextResponse.json({
      ok: local.persisted,
      mode: "local",
      driver,
      profileCount: local.profileCount,
      campaignCount: local.campaignCount,
      submissionCount: local.submissionCount,
      walletCount: local.walletCount,
      ledgerCount: local.ledgerCount,
      checks: {
        filePersist: local.persisted ? "ok" : "store.json not on disk yet",
      },
      message: local.persisted
        ? "Using local file store (data/store.json). Data survives server restarts."
        : "Local store has not been written to disk yet.",
    });
  }

  const secret = process.env.CRON_SECRET?.trim() ?? "";
  const probe =
    secret.length > 0 &&
    safeBearerEqual(request.headers.get("authorization"), secret) &&
    new URL(request.url).searchParams.get("probe") === "1";
  const diag = await diagnoseSupabaseStore({ probe });
  return NextResponse.json({
    ok: diag.jsonBlobLoadOk,
    mode: "supabase",
    driver,
    relationalSync: process.env.FWETA_RELATIONAL_SYNC === "true",
    profileCount: diag.profileCount,
    checks: {
      jsonBlobLoad: diag.jsonBlobLoadOk ? "ok" : diag.jsonBlobLoadError,
      jsonBlobSave: probe ? (diag.jsonBlobSaveOk ? "ok" : diag.jsonBlobSaveError) : "not probed",
      relationalLoad: diag.relationalLoadOk ? "ok" : diag.relationalLoadError,
    },
    hint: !diag.jsonBlobLoadOk
      ? "JSON load failed — run supabase/migrations in order and verify SUPABASE_SERVICE_ROLE_KEY is the secret key."
      : !probe
        ? "Read-only check. Call with ?probe=1 and Authorization: Bearer CRON_SECRET to test a write."
        : !diag.jsonBlobSaveOk
          ? "JSON save probe failed. Confirm the service role key and fweta_app_store grants."
          : diag.profileCount === 0
            ? "Store is empty. Sign in once so the admin seed can run, then re-check."
            : null,
  });
}
