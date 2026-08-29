import { NextResponse } from "next/server";

import { pollSubmissionViewsJob } from "@/app/actions/jobs";

/**
 * POST /api/jobs/poll-views
 * Trigger view polling job (cron or manual).
 * Requires `Authorization: Bearer $JOBS_SECRET`.
 */
export async function POST(request: Request) {
  const secret = process.env.JOBS_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

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
