import type { Campaign, DatabaseStore, Submission } from "@/lib/db/types";
import { isCampaignFunded } from "@/lib/campaigns/fund";
import { applyWalletDelta } from "@/lib/wallet/ledger";

import {
  EARNING_WINDOW_MS,
  FRAUD_HOLD_MS,
  allocatePoolShares,
  campaignEnded,
  campaignWindowOpen,
  endInstant,
  feeOnDelivered,
  qualifiedViewCount,
  remainingBudgetCents,
  uncappedEarningsCents,
} from "./content-rewards";

function atIso(nowMs: number): string {
  return new Date(nowMs).toISOString();
}

function syncEarnings(sub: Submission) {
  sub.earningsCents = sub.reservedCents + sub.releasedCents;
}

function creditBrand(
  store: DatabaseStore,
  campaign: Campaign,
  cents: number,
  referenceType: "campaign_fund" | "campaign_fee",
  reason: string,
) {
  if (cents <= 0) return;
  applyWalletDelta(store, {
    userId: campaign.brandId,
    availableDelta: cents,
    type: "credit",
    reason,
    referenceType,
    referenceId: campaign.id,
  });
}

function lockedFeeBps(campaign: Campaign): number | undefined {
  return Number.isInteger(campaign.feeBps) ? campaign.feeBps : undefined;
}

function rememberFeeCharge(campaign: Campaign, deliveredCents: number) {
  const fee = Math.min(
    feeOnDelivered(deliveredCents, lockedFeeBps(campaign)),
    Math.max(0, campaign.feeReservedCents - campaign.feeChargedCents),
  );
  campaign.feeChargedCents += fee;
}

function reverseFee(store: DatabaseStore, campaign: Campaign, deliveredCents: number, toBrand: boolean) {
  const fee = Math.min(feeOnDelivered(deliveredCents, lockedFeeBps(campaign)), campaign.feeChargedCents);
  if (fee <= 0) return;
  campaign.feeChargedCents -= fee;
  if (toBrand || campaign.closedAt) {
    creditBrand(store, campaign, fee, "campaign_fee", `Platform fee returned, ${campaign.title}`);
    campaign.feeRefundedCents += fee;
  }
}

function returnCreatorBudget(store: DatabaseStore, campaign: Campaign, cents: number, toBrand: boolean) {
  if (cents <= 0) return;
  campaign.budgetSpentCents = Math.max(0, campaign.budgetSpentCents - cents);
  if ((toBrand || campaign.closedAt) && isCampaignFunded(store, campaign.id)) {
    creditBrand(store, campaign, cents, "campaign_fund", `Returned budget, ${campaign.title}`);
    campaign.unspentReturnedCents += cents;
  }
}

export function markApprovedForPayout(sub: Submission, campaign: Campaign, nowMs: number) {
  const end = endInstant(campaign.endDate);
  let earnEnd = nowMs + EARNING_WINDOW_MS;
  if (end != null) earnEnd = Math.min(earnEnd, end);
  sub.approvedAt = atIso(nowMs);
  if (campaign.payModel === "pool") {
    sub.earningUntil = end != null ? atIso(end) : null;
    sub.holdUntil = null;
    sub.payoutState = "none";
    return;
  }
  sub.earningUntil = atIso(earnEnd);
  sub.holdUntil = atIso(earnEnd + FRAUD_HOLD_MS);
  sub.payoutState = "reserved";
}

function reduceSetAside(
  store: DatabaseStore,
  sub: Submission,
  camp: Campaign,
  amount: number,
  nowMs: number,
  reason: string,
): number {
  let left = amount;
  let recovered = 0;
  if (sub.reservedCents > 0 && left > 0) {
    const take = Math.min(sub.reservedCents, left);
    applyWalletDelta(store, {
      userId: sub.clipperId,
      availableDelta: 0,
      pendingDelta: -take,
      type: "debit",
      reason,
      referenceType: "campaign_clawback",
      referenceId: sub.id,
    });
    sub.reservedCents -= take;
    returnCreatorBudget(store, camp, take, false);
    reverseFee(store, camp, take, false);
    left -= take;
    recovered += take;
  }
  syncEarnings(sub);
  sub.updatedAt = atIso(nowMs);
  camp.updatedAt = sub.updatedAt;
  if (
    camp.status === "completed" &&
    !camp.closedAt &&
    remainingBudgetCents(camp) > 0 &&
    campaignWindowOpen(camp, nowMs)
  ) {
    camp.status = "active";
  }
  return recovered;
}

function accrueCpm(store: DatabaseStore, sub: Submission, camp: Campaign, nowMs: number): number {
  const qualified = Math.max(0, sub.views - (sub.baselineViews ?? 0));
  sub.payableViews = qualified;
  const capped = qualified < camp.minViews ? 0 : uncappedEarningsCents(qualified, camp);
  const already = sub.reservedCents + sub.releasedCents;
  const room = Math.max(0, camp.budgetTotalCents - camp.budgetSpentCents) + already;
  const target = Math.min(capped, room);
  const delta = target - already;
  if (delta < 0) {
    return -reduceSetAside(store, sub, camp, -delta, nowMs, `View count corrected, ${camp.title}`);
  }
  if (camp.budgetSpentCents >= camp.budgetTotalCents && camp.status === "active") {
    camp.status = "completed";
    camp.updatedAt = atIso(nowMs);
  }
  if (delta <= 0) return 0;
  const at = atIso(nowMs);
  applyWalletDelta(store, {
    userId: sub.clipperId,
    availableDelta: 0,
    pendingDelta: delta,
    type: "credit",
    reason: `Set aside for verified views, ${camp.title}`,
    referenceType: "campaign_reserve",
    referenceId: sub.id,
  });
  sub.reservedCents += delta;
  syncEarnings(sub);
  camp.budgetSpentCents += delta;
  rememberFeeCharge(camp, delta);
  sub.updatedAt = at;
  camp.updatedAt = at;
  if (camp.budgetSpentCents >= camp.budgetTotalCents && camp.status === "active") {
    camp.status = "completed";
  }
  if (sub.payoutState === "none") sub.payoutState = "reserved";
  return delta;
}

/** Apply an admin-confirmed view total and recompute money in the same write. */
export function applyConfirmedViews(
  store: DatabaseStore,
  submissionId: string,
  views: number,
  likes: number | null,
  comments: number | null,
  nowMs: number,
): void {
  const sub = store.submissions.find((item) => item.id === submissionId);
  const camp = sub ? store.campaigns.find((item) => item.id === sub.campaignId) : undefined;
  if (!sub || !camp) return;
  if (sub.baselineViews == null) sub.baselineViews = 0;
  sub.views = views;
  if (likes != null) sub.likes = likes;
  if (comments != null) sub.comments = comments;
  sub.postLive = true;
  sub.lastPolledAt = atIso(nowMs);
  sub.payableViews = Math.max(0, views - (sub.baselineViews ?? 0));
  sub.updatedAt = sub.lastPolledAt;
  if (sub.status === "approved" && camp.payModel === "cpm" && sub.payoutState !== "clawed_back" && sub.fraudState !== "upheld") {
    const earningUntilMs = sub.earningUntil ? Date.parse(sub.earningUntil) : null;
    const canIncrease =
      camp.status === "active" &&
      remainingBudgetCents(camp) > 0 &&
      campaignWindowOpen(camp, nowMs) &&
      (earningUntilMs == null || nowMs < earningUntilMs);
    const already = sub.reservedCents + sub.releasedCents;
    const capped = sub.payableViews < camp.minViews ? 0 : uncappedEarningsCents(sub.payableViews, camp);
    if (canIncrease || capped < already) accrueCpm(store, sub, camp, nowMs);
  }
  if (camp.payModel === "pool" || camp.budgetSpentCents >= camp.budgetTotalCents || camp.status === "completed") {
    finalizeCampaign(store, camp, nowMs);
  }
}

export function clawbackSubmission(
  store: DatabaseStore,
  submissionId: string,
  nowMs: number,
  reason: string,
): number {
  const sub = store.submissions.find((s) => s.id === submissionId);
  const camp = sub ? store.campaigns.find((c) => c.id === sub.campaignId) : undefined;
  if (!sub || !camp) return 0;
  if (sub.payoutState === "clawed_back") return 0;
  const at = atIso(nowMs);
  let recovered = 0;
  if (sub.reservedCents > 0) {
    applyWalletDelta(store, {
      userId: sub.clipperId,
      availableDelta: 0,
      pendingDelta: -sub.reservedCents,
      type: "debit",
      reason,
      referenceType: "campaign_clawback",
      referenceId: sub.id,
    });
    recovered += sub.reservedCents;
    returnCreatorBudget(store, camp, sub.reservedCents, true);
    reverseFee(store, camp, sub.reservedCents, true);
    sub.reservedCents = 0;
  }
  syncEarnings(sub);
  sub.payoutState = sub.releasedCents > 0 ? "released" : "clawed_back";
  sub.reviewNote = sub.reviewNote || reason;
  sub.updatedAt = at;
  camp.updatedAt = at;
  if (
    camp.status === "completed" &&
    !camp.closedAt &&
    remainingBudgetCents(camp) > 0 &&
    campaignWindowOpen(camp, nowMs)
  ) {
    camp.status = "active";
  }
  return recovered;
}

function releaseReserved(store: DatabaseStore, sub: Submission, camp: Campaign, nowMs: number): number {
  const amount = sub.reservedCents;
  const at = atIso(nowMs);
  if (amount > 0) {
    applyWalletDelta(store, {
      userId: sub.clipperId,
      availableDelta: amount,
      pendingDelta: -amount,
      type: "credit",
      reason: `Hold released, ${camp.title}`,
      referenceType: "campaign_release",
      referenceId: sub.id,
    });
  }
  sub.releasedCents += amount;
  sub.reservedCents = 0;
  syncEarnings(sub);
  sub.payoutState = "released";
  sub.releasedAt = at;
  sub.updatedAt = at;
  return amount;
}

export type SettleResult = { reserved: number; released: number; clawed: number };

export function settleSubmission(
  store: DatabaseStore,
  submissionId: string,
  nowMs: number,
  live: boolean | null,
  liveChecked: boolean,
): SettleResult {
  const result: SettleResult = { reserved: 0, released: 0, clawed: 0 };
  const sub = store.submissions.find((s) => s.id === submissionId);
  if (!sub || sub.status !== "approved") return result;
  if (sub.payoutState === "released" || sub.payoutState === "clawed_back") return result;
  const camp = store.campaigns.find((c) => c.id === sub.campaignId);
  if (!camp) return result;

  if (sub.fraudState === "upheld") {
    result.clawed = clawbackSubmission(store, sub.id, nowMs, "Review upheld. This clip was forfeited.");
    return result;
  }

  const ended = campaignEnded(camp, nowMs) || camp.status === "completed" || camp.status === "paused";
  const earningUntilMs = sub.earningUntil ? Date.parse(sub.earningUntil) : null;
  const inWindow =
    camp.payModel === "cpm" &&
    camp.status === "active" &&
    !ended &&
    campaignWindowOpen(camp, nowMs) &&
    (earningUntilMs == null || nowMs < earningUntilMs);

  if (inWindow) {
    result.reserved = accrueCpm(store, sub, camp, nowMs);
  } else if (camp.payModel === "cpm" && (sub.payoutState === "reserved" || sub.payoutState === "none")) {
    if (sub.baselineViews != null) {
      sub.payableViews = Math.max(sub.payableViews, qualifiedViewCount(sub, earningUntilMs ?? nowMs));
    }
    sub.payoutState = "holding";
    const holdFromNow = nowMs + FRAUD_HOLD_MS;
    const existing = sub.holdUntil ? Date.parse(sub.holdUntil) : holdFromNow;
    sub.holdUntil = atIso(Math.min(existing, holdFromNow));
    sub.updatedAt = atIso(nowMs);
  }

  const holdMs = sub.holdUntil ? Date.parse(sub.holdUntil) : null;
  const holdDue = holdMs != null && nowMs >= holdMs && sub.payoutState === "holding";
  const fraudBlocked = sub.fraudState === "review" || sub.fraudState === "appealed";
  if (holdDue && !fraudBlocked) {
    if (liveChecked && live === false) {
      result.clawed += clawbackSubmission(store, sub.id, nowMs, "The post was not live at payout. This clip was forfeited.");
    } else if (liveChecked && live === true) {
      result.released += releaseReserved(store, sub, camp, nowMs);
    }
  }
  return result;
}

export function settlePool(store: DatabaseStore, campaign: Campaign, nowMs: number) {
  if (campaign.payModel !== "pool" || campaign.poolSettledAt) return;
  const clips = store.submissions.filter(
    (sub) =>
      sub.campaignId === campaign.id &&
      sub.status === "approved" &&
      sub.fraudState !== "upheld" &&
      sub.payoutState !== "clawed_back" &&
      qualifiedViewCount(sub, nowMs) >= campaign.minViews,
  );
  const shares = allocatePoolShares(
    campaign.budgetTotalCents,
    clips.map((sub) => ({ id: sub.id, views: qualifiedViewCount(sub, nowMs) })),
    campaign.maxPayoutPerSubmissionCents,
  );
  const at = atIso(nowMs);
  for (const sub of clips) {
    const share = shares.get(sub.id) ?? 0;
    sub.payableViews = qualifiedViewCount(sub, nowMs);
    if (share > 0) {
      applyWalletDelta(store, {
        userId: sub.clipperId,
        availableDelta: 0,
        pendingDelta: share,
        type: "credit",
        reason: `Pool share set aside, ${campaign.title}`,
        referenceType: "campaign_reserve",
        referenceId: sub.id,
      });
      sub.reservedCents += share;
      syncEarnings(sub);
      campaign.budgetSpentCents += share;
      rememberFeeCharge(campaign, share);
    }
    sub.payoutState = "holding";
    sub.holdUntil = atIso(nowMs + FRAUD_HOLD_MS);
    sub.updatedAt = at;
  }
  campaign.poolSettledAt = at;
  campaign.updatedAt = at;
}

export function refundUnspentCampaign(store: DatabaseStore, campaign: Campaign, nowMs: number) {
  if (campaign.closedAt) return;
  if (!isCampaignFunded(store, campaign.id)) {
    campaign.closedAt = atIso(nowMs);
    return;
  }
  const unspent = Math.max(
    0,
    campaign.budgetTotalCents - campaign.budgetSpentCents - campaign.unspentReturnedCents,
  );
  if (unspent > 0) {
    creditBrand(store, campaign, unspent, "campaign_fund", `Unspent campaign budget returned, ${campaign.title}`);
    campaign.unspentReturnedCents += unspent;
  }
  const feeLeft = Math.max(0, campaign.feeReservedCents - campaign.feeChargedCents - campaign.feeRefundedCents);
  if (feeLeft > 0) {
    creditBrand(store, campaign, feeLeft, "campaign_fee", `Unused platform fee returned, ${campaign.title}`);
    campaign.feeRefundedCents += feeLeft;
  }
  campaign.closedAt = atIso(nowMs);
  campaign.updatedAt = campaign.closedAt;
}

export function finalizeCampaign(store: DatabaseStore, campaign: Campaign, nowMs: number) {
  if (campaign.status === "draft" || campaign.status === "pending") return;
  const end = endInstant(campaign.endDate);
  const endPassed = end != null && nowMs > end;
  const budgetFull =
    campaign.payModel !== "pool" &&
    campaign.budgetTotalCents > 0 &&
    campaign.budgetSpentCents >= campaign.budgetTotalCents;
  if (campaign.status === "paused" && !endPassed) return;
  if (!endPassed && !budgetFull && campaign.status !== "completed") return;
  if (campaign.status === "active" && (endPassed || budgetFull)) {
    campaign.status = "completed";
    campaign.updatedAt = atIso(nowMs);
  }
  if (campaign.status !== "completed") return;
  if (campaign.payModel === "pool") settlePool(store, campaign, nowMs);
  for (const sub of store.submissions) {
    if (sub.campaignId === campaign.id) settleSubmission(store, sub.id, nowMs, sub.postLive, false);
  }
  refundUnspentCampaign(store, campaign, nowMs);
}
