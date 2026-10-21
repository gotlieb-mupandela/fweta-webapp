import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { readUgcFile, ugcContentType, ugcFileNameOk } from "@/lib/ugc/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  if (!ugcFileNameOk(name)) return NextResponse.json({ ok: false }, { status: 404 });
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 404 });
  const store = await readStore();
  const delivery = store.ugcDeliveries.find((item) => item.files.some((file) => file.name === name));
  if (!delivery) return NextResponse.json({ ok: false }, { status: 404 });
  const brief = store.ugcBriefs.find((item) => item.id === delivery.briefId);
  const allowed =
    session.roles.includes("admin") ||
    delivery.creatorId === session.id ||
    brief?.brandId === session.id;
  if (!allowed) return NextResponse.json({ ok: false }, { status: 404 });
  const bytes = await readUgcFile(name);
  const type = ugcContentType(name);
  if (!bytes || !type) return NextResponse.json({ ok: false }, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "attachment",
    },
  });
}
