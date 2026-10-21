import { nowIso } from "@/lib/db/store";
import type { DatabaseStore } from "@/lib/db/types";
import { applyWalletDelta } from "@/lib/wallet/ledger";

/**
 * CPM: floor(views / 1000 * cpm), capped by the per-video max and the budget
 * still left. Only positive deltas are credited. Already-paid earnings are not clawed back.
 */
export function creditSubmissionEarnings(store: DatabaseStore, submissionId: string): number {
  const submission = store.submissions.find((item) => item.id === submissionId);
  if (!submission || submission.status !== "approved") return 0;
  const campaign = store.campaigns.find((item) => item.id === submission.campaignId);
  if (!campaign) return 0;

  const raw = Math.floor((submission.views / 1000) * campaign.cpmCents);
  const cappedByVideo = Math.min(raw, campaign.maxPayoutPerSubmissionCents);
  const remainingBudget = campaign.budgetTotalCents - campaign.budgetSpentCents;
  const targetEarnings = Math.max(
    0,
    Math.min(cappedByVideo, remainingBudget + submission.earningsCents),
  );
  const delta = targetEarnings - submission.earningsCents;
  if (delta <= 0) return 0;

  applyWalletDelta(store, {
    userId: submission.clipperId,
    availableDelta: delta,
    type: "credit",
    reason: `Campaign earnings: ${campaign.title}`,
    referenceType: "campaign_earning",
    referenceId: submission.id,
  });
  submission.earningsCents = targetEarnings;
  submission.updatedAt = nowIso();
  campaign.budgetSpentCents += delta;
  if (campaign.budgetSpentCents >= campaign.budgetTotalCents) {
    campaign.status = "completed";
  }
  campaign.updatedAt = nowIso();
  return delta;
}
