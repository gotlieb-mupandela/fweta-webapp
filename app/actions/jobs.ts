"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { mapCampaign, mapSubmission, type CampaignRow, type SubmissionRow } from "@/lib/db/mappers";
import { adjustWallet } from "@/lib/wallet/ledger";

export async function pollSubmissionViewsJob() {
  const admin = createAdminClient();
  const { data: subRows } = await admin
    .from("submissions")
    .select("*")
    .eq("status", "approved");
  const submissions = ((subRows ?? []) as SubmissionRow[]).map(mapSubmission);
  const { data: campRows } = await admin.from("campaigns").select("*");
  const campaigns = ((campRows ?? []) as CampaignRow[]).map(mapCampaign);
  let updated = 0;

  for (const submission of submissions) {
    const campaign = campaigns.find((c) => c.id === submission.campaignId);
    if (!campaign || campaign.status !== "active") continue;
    if (campaign.budgetSpentCents >= campaign.budgetTotalCents) continue;

    const growth = Math.floor(200 + Math.random() * 1800);
    const newViews = submission.views + growth;

    await admin.from("view_snapshots").insert({
      submission_id: submission.id,
      views: newViews,
    });
    await admin
      .from("submissions")
      .update({ views: newViews })
      .eq("id", submission.id);
    updated += 1;
  }

  const earnings = await recalculateEarningsJob();
  return { updated, ...earnings };
}

export async function recalculateEarningsJob() {
  const admin = createAdminClient();
  const { data: subRows } = await admin
    .from("submissions")
    .select("*")
    .eq("status", "approved");
  const submissions = ((subRows ?? []) as SubmissionRow[]).map(mapSubmission);
  const { data: campRows } = await admin.from("campaigns").select("*");
  const campaigns = ((campRows ?? []) as CampaignRow[]).map(mapCampaign);
  let credited = 0;

  for (const submission of submissions) {
    const campaign = campaigns.find((c) => c.id === submission.campaignId);
    if (!campaign) continue;

    const raw = Math.floor((submission.views / 1000) * campaign.cpmCents);
    const cappedByVideo = Math.min(raw, campaign.maxPayoutPerSubmissionCents);
    const remainingBudget = campaign.budgetTotalCents - campaign.budgetSpentCents;
    const targetEarnings = Math.min(cappedByVideo, remainingBudget + submission.earningsCents);
    const delta = targetEarnings - submission.earningsCents;
    if (delta <= 0) continue;

    await adjustWallet({
      userId: submission.clipperId,
      availableDelta: delta,
      type: "credit",
      reason: `Campaign earnings · ${campaign.title}`,
      referenceType: "campaign_earning",
      referenceId: submission.id,
      admin: true,
    });

    await admin
      .from("submissions")
      .update({ earnings_cents: targetEarnings })
      .eq("id", submission.id);

    const spent = campaign.budgetSpentCents + delta;
    await admin
      .from("campaigns")
      .update({
        budget_spent_cents: spent,
        status: spent >= campaign.budgetTotalCents ? "completed" : campaign.status,
      })
      .eq("id", campaign.id);
    campaign.budgetSpentCents = spent;
    credited += delta;
  }

  revalidatePath("/dashboard/clipper");
  revalidatePath("/dashboard/brand");
  return { creditedCents: credited };
}

export async function budgetAlertsJob() {
  const admin = createAdminClient();
  const { data } = await admin.from("campaigns").select("*").eq("status", "active");
  const alerts = ((data ?? []) as CampaignRow[])
    .map(mapCampaign)
    .filter((c) => c.budgetSpentCents / c.budgetTotalCents >= 0.8)
    .map((c) => ({
      campaignId: c.id,
      title: c.title,
      brandId: c.brandId,
      spentRatio: c.budgetSpentCents / c.budgetTotalCents,
    }));
  return { alerts };
}
