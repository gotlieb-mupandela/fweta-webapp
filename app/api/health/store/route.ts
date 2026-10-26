import { NextResponse } from "next/server";

import { diagnoseLocalStore } from "@/lib/db/store";
import {
  diagnoseSupabaseStore,
  isSupabaseStoreEnabled,
} from "@/lib/db/supabase-store";
import {
  classifyHealthRequest,
  localDetailBody,
  publicHealthBody,
  supabaseDetailBody,
} from "@/lib/health/store-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const probeRequested = url.searchParams.get("probe") === "1";
  const access = classifyHealthRequest({
    authorization: request.headers.get("authorization"),
    probe: probeRequested,
    cronSecret: process.env.CRON_SECRET,
  });

  if (access === "unauthorized") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const probe = access === "detail" && probeRequested;

  if (!isSupabaseStoreEnabled()) {
    try {
      const local = await diagnoseLocalStore();
      if (access === "public") {
        return NextResponse.json(publicHealthBody("local", local.persisted));
      }
      return NextResponse.json(localDetailBody(local, probe));
    } catch {
      return NextResponse.json(publicHealthBody("local", false));
    }
  }

  const diag = await diagnoseSupabaseStore({ probe });
  if (access === "public") {
    return NextResponse.json(publicHealthBody("supabase", diag.jsonBlobLoadOk));
  }
  return NextResponse.json(
    supabaseDetailBody(diag, {
      probe,
      relationalSync: process.env.FWETA_RELATIONAL_SYNC === "true",
    }),
  );
}
