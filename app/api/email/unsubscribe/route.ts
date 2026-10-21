import { NextResponse, type NextRequest } from "next/server";

import { unsubscribeByToken } from "@/app/actions/email-preferences";
import { parseEmailScope } from "@/lib/email/preferences";

export const dynamic = "force-dynamic";

/**
 * One-click unsubscribe (RFC 8058). Mail clients POST this URL.
 * A normal visit does not change preferences.
 */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const scope = parseEmailScope(request.nextUrl.searchParams.get("scope"));
  if (!token || !scope) {
    return NextResponse.json({ ok: false, error: "Invalid unsubscribe link." }, { status: 400 });
  }
  const result = await unsubscribeByToken(token, scope);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: "This link has expired." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "Use the unsubscribe link in the email to confirm." },
    { status: 405 },
  );
}
