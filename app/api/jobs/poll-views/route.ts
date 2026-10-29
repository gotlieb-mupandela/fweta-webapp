import { NextResponse } from "next/server";

import { pollSubmissionViews } from "@/lib/jobs/poll-submission-views";
import { authorizeCron } from "@/lib/security/cron";
import { isApifyConfigured } from "@/lib/social/apify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Without Apify, view checks stay on the admin form and this route returns 410.
 * With Apify configured, a valid cron bearer fetches counts and settles earnings.
 */
async function handle(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isApifyConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "View polling is off. An admin enters view counts, and earnings follow from that number.",
      },
      { status: 410 },
    );
  }
  const result = await pollSubmissionViews();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
