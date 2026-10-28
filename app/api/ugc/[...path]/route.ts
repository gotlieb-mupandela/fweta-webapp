import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { ugcOwnerIds } from "@/lib/storage/access";
import { openDownload } from "@/lib/storage/download";
import { isStoredObjectName } from "@/lib/storage/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const name = path.join("/");
  if (!isStoredObjectName(name) || (name.includes("/") && !name.includes("/ugc/"))) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 404 });
  const store = await readStore();
  const ownerIds = ugcOwnerIds(store, name);
  const isAdmin = session.roles.includes("admin");
  if (ownerIds.length === 0 || (!isAdmin && !ownerIds.includes(session.id))) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const loaded = await openDownload({
    purpose: "ugc",
    name,
    requesterId: session.id,
    ownerIds,
    isAdmin,
    filenameBase: "file",
    attachment: true,
  });
  if (!loaded) return NextResponse.json({ ok: false }, { status: 404 });
  return new NextResponse(new Uint8Array(loaded.bytes), { status: 200, headers: loaded.headers });
}
