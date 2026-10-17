import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { readViewScreenshot, screenshotContentType, screenshotFileNameOk } from "@/lib/views/screenshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  if (!screenshotFileNameOk(name)) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });

  const store = await readStore();
  const snap = store.viewSnapshots.find((item) => item.screenshotPath === name);
  const submission = snap ? store.submissions.find((item) => item.id === snap.submissionId) : undefined;
  const allowed = session.roles.includes("admin") || submission?.clipperId === session.id;
  if (!snap || !allowed) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  const bytes = await readViewScreenshot(name);
  const type = screenshotContentType(name);
  if (!bytes || !type) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
