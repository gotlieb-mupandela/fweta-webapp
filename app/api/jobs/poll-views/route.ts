import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { pollSubmissionViewsJob } from "@/app/actions/jobs";

export const maxDuration = 300;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  // Local/dev convenience: no secret configured outside production means
  // manual triggers are allowed (production still requires the secret).
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization") ?? "";
  // Timing-safe enough for opaque bearer comparison without leaking length.
  return header === `Bearer ${secret}`;
}

async function runPollViewsJob() {
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

/**
 * GET /api/jobs/poll-views
 * Invoked by Vercel Cron (production). Requires Authorization: Bearer CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return runPollViewsJob();
}

/**
 * POST /api/jobs/poll-views
 * Manual trigger (local or ops). Same CRON_SECRET auth as GET.
 */
export async function POST(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return runPollViewsJob();
}
