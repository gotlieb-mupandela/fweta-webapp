import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { runHousekeepingJob } from "@/lib/jobs/housekeeping";
import { reportServerError } from "@/lib/monitoring/report";
import { authorizeCron } from "@/lib/security/cron";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/jobs/housekeeping
 * Vercel Cron. Ends campaigns, settles unused budget, releases stale booking holds.
 * Does not fetch view counts.
 */
export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runHousekeepingJob();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    await reportServerError(error, { source: "housekeeping" });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Job failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
