import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { readStore, updateStore } from "@/lib/db/store";
import { pushAudit } from "@/lib/marketplace/audit";
import { kycOwnerIds } from "@/lib/storage/access";
import { openDownload } from "@/lib/storage/download";
import { isStoredObjectName } from "@/lib/storage/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const name = path.join("/");
  if (!isStoredObjectName(name) || (name.includes("/") && !name.includes("/kyc/"))) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 404 });
  const store = await readStore();
  const ownerIds = kycOwnerIds(store, name);
  const isAdmin = session.roles.includes("admin");
  if (!isAdmin && !ownerIds.includes(session.id)) return NextResponse.json({ ok: false }, { status: 404 });
  if (ownerIds.length === 0) return NextResponse.json({ ok: false }, { status: 404 });

  const loaded = await openDownload({
    purpose: "kyc",
    name,
    requesterId: session.id,
    ownerIds,
    isAdmin,
    filenameBase: "identity",
    attachment: true,
  });
  if (!loaded) return NextResponse.json({ ok: false }, { status: 404 });

  await updateStore((draft) => {
    pushAudit(draft, {
      actorId: session.id,
      action: "kyc.read",
      summary: "Opened an identity document",
      targetType: "profile",
      targetId: ownerIds[0] ?? null,
    });
  });

  return new NextResponse(new Uint8Array(loaded.bytes), { status: 200, headers: loaded.headers });
}
