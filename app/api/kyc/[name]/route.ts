import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { kycContentType, kycFileNameOk, readKycDocument } from "@/lib/kyc/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  if (!kycFileNameOk(name)) return NextResponse.json({ ok: false }, { status: 404 });
  const session = await getSession();
  if (!session?.roles.includes("admin")) return NextResponse.json({ ok: false }, { status: 404 });
  const store = await readStore();
  const owner = store.profiles.find((profile) => profile.kyc?.documentPath === name);
  if (!owner) return NextResponse.json({ ok: false }, { status: 404 });
  const bytes = await readKycDocument(name);
  const type = kycContentType(name);
  if (!bytes || !type) return NextResponse.json({ ok: false }, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
