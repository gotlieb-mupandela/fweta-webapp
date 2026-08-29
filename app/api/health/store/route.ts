import { NextResponse } from "next/server";

import { isSupabaseStoreEnabled, loadStoreFromSupabase } from "@/lib/db/supabase-store";

export async function GET() {
  const supabase = isSupabaseStoreEnabled();
  let storeOk = false;
  let profileCount = 0;
  let error: string | null = null;

  if (supabase) {
    try {
      const store = await loadStoreFromSupabase();
      storeOk = Boolean(store);
      profileCount = store?.profiles?.length ?? 0;
    } catch (e) {
      error = e instanceof Error ? e.message : "load failed";
    }
  }

  return NextResponse.json({
    ok: supabase ? storeOk : true,
    supabase,
    relationalSync: process.env.FWETA_RELATIONAL_SYNC === "true",
    profileCount,
    error,
  });
}
