import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { campaignsVisibleToBrand } from "@/lib/onboarding/access";
import { readStore } from "@/lib/db/store";
import { qualifiedViewCount } from "@/lib/rewards/content-rewards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cell(value: string | number): string {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export async function GET() {
  const session = await getSession();
  if (!session?.roles.includes("brand") && !session?.roles.includes("admin")) {
    return NextResponse.json({ ok: false, error: "Brand role required." }, { status: 401 });
  }
  const store = await readStore();
  const campaigns = campaignsVisibleToBrand(store, session);
  const ids = new Set(campaigns.map((item) => item.id));
  const lines = [["campaign", "clip", "platform", "views", "earnings_cents", "status"]];
  for (const submission of store.submissions) {
    if (!ids.has(submission.campaignId)) continue;
    const campaign = campaigns.find((item) => item.id === submission.campaignId);
    lines.push([
      cell(campaign?.title ?? ""),
      cell(submission.postUrl),
      cell(submission.platform),
      cell(qualifiedViewCount(submission)),
      cell(submission.earningsCents),
      cell(submission.status),
    ]);
  }
  const csv = lines.map((row) => row.join(",")).join("\n");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"fweta-analytics.csv\"",
    },
  });
}
