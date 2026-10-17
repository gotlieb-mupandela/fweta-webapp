import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const body = {
  ok: false,
  error: "View checks are manual. Earnings update when an admin saves a count.",
};

/** Disabled. View polling must not run. */
export function GET() {
  return NextResponse.json(body, { status: 410 });
}

export function POST() {
  return NextResponse.json(body, { status: 410 });
}
