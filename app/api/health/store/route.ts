import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { diagnoseLocalStore } from "@/lib/db/store";
import {
  diagnoseSupabaseStore,
  isSupabaseStoreEnabled,
} from "@/lib/db/supabase-store";
import { authorizeCron } from "@/lib/security/cron";

export async function GET(request: Request) {
  const session = await getSession();
  const admin = Boolean(session?.roles.includes("admin"));
  if (!admin && !authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseStoreEnabled()) {
    const local = await diagnoseLocalStore();
    return NextResponse.json({
      ok: local.persisted,
      mode: "local",
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

  const diag = await diagnoseSupabaseStore();
  return NextResponse.json({
    ok: diag.jsonBlobLoadOk && diag.jsonBlobSaveOk,
    mode: "supabase",
    relationalSync: process.env.FWETA_RELATIONAL_SYNC === "true",
    profileCount: diag.profileCount,
    checks: {
      jsonBlobLoad: diag.jsonBlobLoadOk ? "ok" : diag.jsonBlobLoadError,
      jsonBlobSave: diag.jsonBlobSaveOk ? "ok" : diag.jsonBlobSaveError,
      relationalLoad: diag.relationalLoadOk ? "ok" : diag.relationalLoadError,
    },
    hint:
      !diag.jsonBlobSaveOk
        ? "JSON save failed. Run supabase/migrations/20260829140000_fweta_app_store.sql and verify SUPABASE_SERVICE_ROLE_KEY is the SECRET key (not publishable)."
        : diag.profileCount === 0
          ? "Store empty. Log in once at /login to seed demo users, then re-check."
          : null,
  });
}
