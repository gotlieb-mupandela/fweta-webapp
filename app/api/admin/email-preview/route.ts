import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "@/lib/auth/session";
import { isEmailTemplateId, renderEmailPreview } from "@/lib/email/catalog";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.roles.includes("admin")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const template = request.nextUrl.searchParams.get("template") ?? "";
  if (!isEmailTemplateId(template)) {
    return new NextResponse("Unknown template", { status: 404 });
  }

  const rendered = renderEmailPreview(template);
  return new NextResponse(rendered.html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
