import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { settleRewardsJob } from "@/app/actions/jobs";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

async function run(asOf?: string) {
  try {
    const result = await settleRewardsJob(asOf);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Job failed" },
      { status: 500 },
    );
  }
}

/** Ledger-only. Closes ended campaigns and releases holds. Does not fetch views. */
export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return run();
}

export async function POST(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  let asOf: string | undefined;
  if (process.env.NODE_ENV !== "production") {
    try {
      const body = (await request.json()) as { asOf?: unknown };
      if (typeof body?.asOf === "string") asOf = body.asOf;
    } catch {
      asOf = undefined;
    }
  }
  return run(asOf);
}
