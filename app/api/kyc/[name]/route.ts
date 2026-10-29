import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { canViewKycDocument, kycFileNameOk, readKycDocument } from "@/lib/kyc/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notFound() {
  return NextResponse.json({ ok: false }, { status: 404 });
}

export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  if (!kycFileNameOk(name)) return notFound();
  const session = await getSession();
  const store = await readStore();
  const owner = store.profiles.find((profile) => profile.kyc?.documentPath === name);
  if (!owner || !canViewKycDocument(session, owner.id)) return notFound();
  const file = await readKycDocument(owner.id, name);
  if (!file) return notFound();
  return new NextResponse(new Uint8Array(file.bytes), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="${name}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
