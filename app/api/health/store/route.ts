import { NextResponse } from "next/server";

import {
  diagnoseSupabaseStore,
  isSupabaseStoreEnabled,
} from "@/lib/db/supabase-store";

export async function GET() {
  if (!isSupabaseStoreEnabled()) {
    return NextResponse.json({
      ok: false,
      mode: "local",
      message: "SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL missing — using in-memory/file store only on serverless.",
      checks: {},
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
