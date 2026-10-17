import { NextResponse } from "next/server";

import { authorizeCron } from "@/lib/security/cron";

export const dynamic = "force-dynamic";

/**
 * View counts are entered by an admin. This route no longer fetches or simulates views.
 */
async function disabled(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(
    {
      ok: false,
      error: "View polling is off. An admin enters view counts, and earnings follow from that number.",
    },
    { status: 410 },
  );
}

export async function GET(request: Request) {
  return disabled(request);
}

export async function POST(request: Request) {
  return disabled(request);
}
