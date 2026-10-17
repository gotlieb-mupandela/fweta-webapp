import { NextResponse } from "next/server";

import { readStore } from "@/lib/db/store";
import type { Campaign } from "@/lib/db/types";
import { buildPublicCatalog, remainingBudgetCents } from "@/lib/rewards/content-rewards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function card(row: { campaign: Campaign; approvedClips: number; views: number }) {
  return {
    id: row.campaign.id,
    title: row.campaign.title,
    type: row.campaign.type,
    payModel: row.campaign.payModel,
    category: row.campaign.category,
    platforms: row.campaign.platforms,
    rateCents: row.campaign.payModel === "pool" ? row.campaign.budgetTotalCents : row.campaign.cpmCents,
    remainingCents: remainingBudgetCents(row.campaign),
    countries: row.campaign.countries,
    endDate: row.campaign.endDate,
    approvedClips: row.approvedClips,
    views: row.views,
  };
}

/** Public catalog only. No wallets, notes, or fraud inputs. */
export async function GET(request: Request) {
  const country = new URL(request.url).searchParams.get("country") ?? undefined;
  const store = await readStore();
  const catalog = buildPublicCatalog(store, country ?? undefined);
  return NextResponse.json({
    featured: catalog.featured.map(card),
    topCampaigns: catalog.topCampaigns.map(card),
    topClips: catalog.topClips.map((clip) => ({
      submissionId: clip.submissionId,
      campaignId: clip.campaignId,
      campaignTitle: clip.campaignTitle,
      creatorName: clip.creatorName,
      handle: clip.handle,
      views: clip.views,
    })),
  });
}
