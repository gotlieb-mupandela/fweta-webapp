import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 404 });
  const store = await readStore();
  const license = store.contentLicenses.find((item) => item.id === id);
  if (!license) return NextResponse.json({ ok: false }, { status: 404 });
  const allowed = session.roles.includes("admin") || license.brandId === session.id || license.creatorId === session.id;
  if (!allowed) return NextResponse.json({ ok: false }, { status: 404 });
  return new NextResponse(license.summary, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="fweta-license-${license.id}.txt"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
