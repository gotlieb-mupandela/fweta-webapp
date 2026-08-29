import { NextResponse } from "next/server";

import { pollSubmissionViewsJob } from "@/app/actions/jobs";

/**
 * POST /api/jobs/poll-views
 * Trigger view polling job (cron or manual).
 */
export async function POST() {
  try {
    const result = await pollSubmissionViewsJob();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Job failed" },
      { status: 500 },
    );
  }
}
