import { NextResponse } from "next/server";

import { reportServerError } from "@/lib/monitoring/report";
import { clientIp } from "@/lib/security/client-ip";
import { rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/** Browser error boundaries post a short report here. No stack traces are forwarded. */
export async function POST(request: Request) {
  const limited = rateLimit(`obs:${await clientIp()}`, 30, 10 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  let body: { message?: unknown; digest?: unknown; source?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.slice(0, 300) : "client error";
  const digest = typeof body.digest === "string" ? body.digest.slice(0, 80) : "";
  const source = typeof body.source === "string" ? body.source.slice(0, 40) : "client";

  await reportServerError(new Error(message), { source, digest });
  return NextResponse.json({ ok: true });
}
