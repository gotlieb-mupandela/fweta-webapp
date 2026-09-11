import { NextResponse } from "next/server";

import {
  diagnoseSupabaseStore,
  isSupabaseStoreEnabled,
} from "@/lib/db/supabase-store";
import { getLocalStoreDiagnostics } from "@/lib/db/store";

export async function GET() {
  if (!isSupabaseStoreEnabled()) {
    const diag = await getLocalStoreDiagnostics();
    return NextResponse.json({
      ok: diag.persistExists,
      mode: "local",
      profileCount: diag.profileCount,
      campaignCount: diag.campaignCount,
      walletCount: diag.walletCount,
      depositCount: diag.depositCount,
      bookingCount: diag.bookingCount,
      ledgerCount: diag.ledgerCount,
      persist: diag.persistExists ? "ok" : "missing",
      message: diag.persistExists
        ? "Using local file store (data/store.json). Deposits and campaigns persist across restarts."
        : "Local store file not written yet — sign in once to seed demo accounts.",
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
        ? "JSON save failed — run supabase/migrations/20260829140000_fweta_app_store.sql and verify SUPABASE_SERVICE_ROLE_KEY is the SECRET key (not publishable)."
        : diag.profileCount === 0
          ? "Store empty — log in once at /login to seed demo users, then re-check."
          : null,
  });
}
