import "./earnings-env";

import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import test from "node:test";

import { earningsDataDir } from "./earnings-env";
import { settleRewardsJob } from "../../app/actions/jobs";
import { allocateCampaignFunds } from "../../lib/campaigns/fund";
import { readStore, updateStore } from "../../lib/db/store";
import type { Campaign, DatabaseStore, Submission, ViewSnapshot } from "../../lib/db/types";
import { hydrateCampaign, hydrateSubmission } from "../../lib/rewards/content-rewards";
import { forfeitUpheldSubmission } from "../../lib/rewards/earnings";
import { reviewSubmissionForActor } from "../../lib/rewards/review-submission";
import {
  confirmCreatorViewForActor,
  recordCheckedViewsForActor,
  recordSubmissionViewsForActor,
  saveAdminViewForActor,
  saveBulkViewsForActor,
  setManualViewsForActor,
} from "../../lib/rewards/view-entry";

const brand = "11111111-1111-4111-8111-111111111111";
const clipper = "22222222-2222-4222-8222-222222222222";
const admin = "33333333-3333-4333-8333-333333333333";
const campId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const subId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sub2Id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const snapId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const now = Date.parse("2026-10-17T12:00:00.000Z");
const nowIso = new Date(now).toISOString();

const brandActor = { id: brand, email: "brand@fweta.test", roles: ["brand"] };
const adminActor = { id: admin, email: "admin@fweta.test", roles: ["admin"] };

function wallet(userId: string, availableCents: number) {
  return { userId, availableCents, pendingCents: 0, updatedAt: nowIso };
}

function campaign(partial: Partial<Campaign> = {}): Campaign {
  return hydrateCampaign({
    id: campId,
    brandId: brand,
    title: "QA",
    description: "Cut",
    type: "clipping",
    category: "podcast",
    status: "active",
    budgetTotalCents: 200_000,
    budgetSpentCents: 0,
    cpmCents: 5_000,
    minPayoutCents: 0,
    minViews: 0,
    payModel: "cpm",
    countries: ["NA"],
    feeReservedCents: 0,
    feeChargedCents: 0,
    feeRefundedCents: 0,
    unspentReturnedCents: 0,
    poolSettledAt: null,
    closedAt: null,
    maxPayoutPerSubmissionCents: 500_000,
    platforms: ["tiktok"],
    requirements: "Hook",
    rules: "",
    assets: [],
    startDate: null,
    endDate: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    ...partial,
  });
}

function submission(partial: Partial<Submission> & Pick<Submission, "id">): Submission {
  return hydrateSubmission({
    campaignId: campId,
    clipperId: clipper,
    postUrl: "https://www.tiktok.com/@kai/video/1",
    platform: "tiktok",
    status: "approved",
    reviewNote: null,
    views: 0,
    baselineViews: 0,
    payableViews: 0,
    reservedCents: 0,
    releasedCents: 0,
    earningsCents: 0,
    approvedAt: nowIso,
    earningUntil: new Date(now + 7 * 86400000).toISOString(),
    holdUntil: null,
    releasedAt: null,
    payoutState: "none",
    nextPollAt: null,
    lastPolledAt: null,
    postLive: true,
    likes: null,
    comments: null,
    fraudScore: 0,
    fraudState: "clear",
    fraudReasons: [],
    appealUsed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
    ...partial,
  });
}

function creatorReport(partial: Partial<ViewSnapshot> = {}): ViewSnapshot {
  return {
    id: snapId,
    submissionId: subId,
    views: 9_000,
    likes: null,
    comments: null,
    note: "creator count",
    screenshotPath: null,
    recordedAt: nowIso,
    checkedBy: null,
    source: "creator",
    status: "pending",
    ...partial,
  };
}

function balances(store: DatabaseStore) {
  const clipperWallet = store.wallets.find((row) => row.userId === clipper);
  const brandWallet = store.wallets.find((row) => row.userId === brand);
  return {
    clipperAvailable: clipperWallet?.availableCents ?? -1,
    clipperPending: clipperWallet?.pendingCents ?? -1,
    brandAvailable: brandWallet?.availableCents ?? -1,
    brandPending: brandWallet?.pendingCents ?? -1,
    ledger: store.ledgerEntries.length,
  };
}

async function resetStore() {
  globalThis.__fwetaStore = undefined;
  rmSync(earningsDataDir, { recursive: true, force: true });
}

async function seed(subs: Submission[], settled = false) {
  await resetStore();
  const camp = campaign();
  await updateStore((store) => {
    store.campaigns.push(camp);
    store.submissions.push(...subs);
    store.wallets.push(wallet(brand, 500_000), wallet(clipper, 0));
    const row = store.campaigns.find((item) => item.id === camp.id);
    if (!row) throw new Error("missing campaign");
    allocateCampaignFunds(store, row);
    if (settled) {
      row.settledAt = nowIso;
      row.closedAt = nowIso;
    }
  });
}

test.beforeEach(async () => {
  await resetStore();
});

test("the old earnings module is gone and jobs use the rewards engine", () => {
  assert.equal(existsSync(new URL("../../lib/campaigns/earnings.ts", import.meta.url)), false);
  const jobs = readFileSync(new URL("../../app/actions/jobs.ts", import.meta.url), "utf8");
  const submissions = readFileSync(new URL("../../app/actions/submissions.ts", import.meta.url), "utf8");
  const views = readFileSync(new URL("../../app/actions/views.ts", import.meta.url), "utf8");
  assert.match(jobs, /settleRewardsInStore/);
  assert.equal(jobs.includes("creditSubmissionEarnings"), false);
  assert.match(submissions, /recordCheckedViewsForActor/);
  assert.match(submissions, /reviewSubmissionForActor/);
  assert.equal(submissions.includes("creditSubmissionEarnings"), false);
  assert.match(views, /saveAdminViewForActor/);
  assert.match(views, /saveBulkViewsForActor/);
  assert.match(views, /confirmCreatorViewForActor/);
  assert.match(views, /recordSubmissionViewsForActor/);
  assert.match(views, /creditedCents: saved\.creditedCents/);
  assert.equal(views.includes("creditedCents: 0"), false);
  assert.equal(views.includes("commitConfirmed"), false);
});

test("claw back a clip, then settle-rewards does not credit it again", async () => {
  await seed([submission({ id: subId, views: 2_000 })]);
  await settleRewardsJob(nowIso);
  const reserved = await readStore();
  assert.ok(balances(reserved).clipperPending > 0);

  await updateStore((store) => {
    forfeitUpheldSubmission(store, subId, now);
  });
  const afterClaw = await readStore();
  const clawed = balances(afterClaw);
  const clip = afterClaw.submissions.find((item) => item.id === subId);
  assert.equal(clip?.status, "rejected");
  assert.equal(clip?.fraudState, "upheld");
  assert.equal(clip?.payoutState, "clawed_back");
  assert.equal(clawed.clipperPending, 0);
  assert.equal(clawed.clipperAvailable, 0);

  await settleRewardsJob(nowIso);
  const afterJob = await readStore();
  assert.deepEqual(balances(afterJob), clawed);
  assert.equal(
    afterJob.ledgerEntries.some((entry) => entry.referenceType === "campaign_earning"),
    false,
  );

  await updateStore((store) => {
    const row = store.submissions.find((item) => item.id === subId);
    if (!row) throw new Error("missing clip");
    row.status = "approved";
  });
  await settleRewardsJob(nowIso);
  const reopened = await readStore();
  assert.deepEqual(balances(reopened), clawed);
  assert.equal(reopened.ledgerEntries.length, clawed.ledger);
});

test("a brand cannot enter views; an admin can and the audit record is stored", async () => {
  await seed([submission({ id: subId, views: 0 })]);
  const before = balances(await readStore());

  const refused = await recordCheckedViewsForActor(brandActor, { submissionId: subId, views: 1_000 }, now);
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.error, "Admin only.");
  const untouched = await readStore();
  assert.deepEqual(balances(untouched), before);
  assert.equal(untouched.viewSnapshots.length, 0);
  assert.equal(untouched.submissions.find((item) => item.id === subId)?.views, 0);

  const saved = await recordCheckedViewsForActor(adminActor, { submissionId: subId, views: 1_000 }, now);
  assert.equal(saved.ok, true);
  const after = await readStore();
  const snap = after.viewSnapshots.find((item) => item.submissionId === subId && item.source === "admin");
  assert.ok(snap);
  assert.equal(snap?.checkedBy, admin);
  assert.equal(snap?.actorEmail, "admin@fweta.test");
  assert.equal(snap?.previousViews, 0);
  assert.equal(snap?.views, 1_000);
  assert.equal(snap?.recordedAt, nowIso);
  assert.equal(snap?.source, "admin");
  const audit = after.auditLog.find((item) => item.targetId === subId && item.actorId === admin);
  assert.ok(audit);
  assert.match(audit?.summary ?? "", /admin@fweta.test/);
  assert.match(audit?.summary ?? "", /from 0 to 1000/);
  assert.ok(balances(after).clipperPending > 0);
  assert.equal(balances(after).clipperAvailable, 0);
});

test("rejecting an approved clip claws back once and a second reject does nothing", async () => {
  await seed([
    submission({ id: subId, status: "pending", views: 0, payoutState: "none", approvedAt: null, earningUntil: null }),
    submission({ id: sub2Id, views: 0 }),
  ]);

  const approved = await reviewSubmissionForActor(
    brandActor,
    subId,
    { status: "approved", views: 9_000 },
    now,
  );
  assert.equal(approved.ok, true);
  const afterApprove = await readStore();
  const approvedClip = afterApprove.submissions.find((item) => item.id === subId);
  assert.equal(approvedClip?.status, "approved");
  assert.equal(approvedClip?.views, 0);
  assert.equal(
    afterApprove.ledgerEntries.some((entry) => entry.referenceType === "campaign_reserve"),
    false,
  );
  assert.equal(balances(afterApprove).clipperPending, 0);

  const counted = await saveAdminViewForActor(adminActor, { submissionId: subId, views: 1_000, note: "checked" }, now);
  assert.equal(counted.ok, true);
  const held = balances(await readStore());
  assert.ok(held.clipperPending > 0);

  const rejected = await reviewSubmissionForActor(brandActor, subId, { status: "rejected" }, now);
  assert.equal(rejected.ok, true);
  const once = await readStore();
  const onceBalances = balances(once);
  const onceClip = once.submissions.find((item) => item.id === subId);
  assert.equal(onceClip?.status, "rejected");
  assert.equal(onceClip?.payoutState, "clawed_back");
  assert.equal(onceBalances.clipperPending, 0);
  assert.ok(onceBalances.brandAvailable > held.brandAvailable);
  const clawbacks = once.ledgerEntries.filter(
    (entry) => entry.referenceId === subId && entry.referenceType === "campaign_clawback",
  );
  assert.equal(clawbacks.length, 1);

  const again = await reviewSubmissionForActor(brandActor, subId, { status: "rejected" }, now);
  assert.equal(again.ok, true);
  const twice = await readStore();
  assert.deepEqual(balances(twice), onceBalances);

  const funded = await saveAdminViewForActor(adminActor, { submissionId: sub2Id, views: 1_000 }, now);
  assert.equal(funded.ok, true);
  const [first, second] = await Promise.all([
    reviewSubmissionForActor(brandActor, sub2Id, { status: "rejected" }, now),
    reviewSubmissionForActor(brandActor, sub2Id, { status: "rejected" }, now),
  ]);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  const raced = await readStore();
  const racedClaws = raced.ledgerEntries.filter(
    (entry) => entry.referenceId === sub2Id && entry.referenceType === "campaign_clawback",
  );
  assert.equal(racedClaws.length, 1);
  assert.equal(raced.submissions.find((item) => item.id === sub2Id)?.payoutState, "clawed_back");
  assert.equal(raced.wallets.find((row) => row.userId === clipper)?.pendingCents, 0);
});

test("saveAdminViewAction on a settled campaign is refused", async () => {
  await seed([submission({ id: subId, views: 0 })], true);
  const before = balances(await readStore());
  const refused = await saveAdminViewForActor(
    adminActor,
    { submissionId: subId, views: 1_000, note: "late" },
    now,
  );
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.error, "This campaign is already settled. Further views are not paid.");
  const after = await readStore();
  assert.deepEqual(balances(after), before);
  assert.equal(after.submissions.find((item) => item.id === subId)?.views, 0);
  assert.equal(after.viewSnapshots.length, 0);
});

test("running settle twice credits once", async () => {
  await seed([submission({ id: subId, views: 2_000 })]);
  await settleRewardsJob(nowIso);
  const once = await readStore();
  const onceBalances = balances(once);
  const reserves = once.ledgerEntries.filter(
    (entry) => entry.referenceId === subId && entry.referenceType === "campaign_reserve",
  );
  assert.equal(reserves.length, 1);
  assert.equal(onceBalances.clipperAvailable, 0);
  assert.equal(onceBalances.clipperPending, reserves[0]?.amountCents);

  await settleRewardsJob(nowIso);
  const twice = await readStore();
  assert.deepEqual(balances(twice), onceBalances);
  assert.equal(
    twice.ledgerEntries.filter((entry) => entry.referenceId === subId && entry.referenceType === "campaign_reserve")
      .length,
    1,
  );

  await updateStore((store) => {
    store.submissions.push(submission({ id: sub2Id, views: 2_000, postUrl: "https://www.tiktok.com/@kai/video/2" }));
  });
  await Promise.all([settleRewardsJob(nowIso), settleRewardsJob(nowIso)]);
  const raced = await readStore();
  assert.equal(
    raced.ledgerEntries.filter((entry) => entry.referenceId === sub2Id && entry.referenceType === "campaign_reserve")
      .length,
    1,
  );
});

test("saveAdminViewAction refuses a lower view count and leaves balances unchanged", async () => {
  await seed([submission({ id: subId, views: 0 })]);
  const first = await saveAdminViewForActor(adminActor, { submissionId: subId, views: 6_000, note: "first count" }, now);
  assert.equal(first.ok, true);
  const held = await readStore();
  const heldBalances = balances(held);
  assert.ok(heldBalances.clipperPending > 0);
  assert.equal(held.submissions.find((item) => item.id === subId)?.views, 6_000);

  const lowered = await saveAdminViewForActor(adminActor, { submissionId: subId, views: 100, note: "lower" }, now);
  assert.equal(lowered.ok, false);
  if (!lowered.ok) assert.equal(lowered.error, "Views cannot go backwards.");
  const after = await readStore();
  assert.deepEqual(balances(after), heldBalances);
  assert.equal(after.submissions.find((item) => item.id === subId)?.views, 6_000);
  assert.equal(
    after.ledgerEntries.some((entry) => entry.reason.includes("View count corrected")),
    false,
  );
});

test("recordSubmissionViewsAction refuses a settled or closed campaign before any write", async () => {
  await seed([submission({ id: subId, views: 0 })], true);
  const before = balances(await readStore());
  const settled = await recordSubmissionViewsForActor(adminActor, { submissionId: subId, views: 5_000 }, now);
  assert.equal(settled.ok, false);
  if (!settled.ok) assert.equal(settled.error, "This campaign is already settled. Further views are not paid.");
  const afterSettled = await readStore();
  assert.equal(afterSettled.submissions.find((item) => item.id === subId)?.views, 0);
  assert.equal(balances(afterSettled).clipperPending, 0);
  assert.deepEqual(balances(afterSettled), before);
  assert.equal(afterSettled.viewSnapshots.length, 0);

  await seed([submission({ id: subId, views: 0 })]);
  await updateStore((store) => {
    const camp = store.campaigns.find((item) => item.id === campId);
    if (!camp) throw new Error("missing campaign");
    camp.closedAt = nowIso;
    camp.settledAt = null;
  });
  const closedBefore = balances(await readStore());
  const closed = await recordSubmissionViewsForActor(adminActor, { submissionId: subId, views: 5_000 }, now);
  assert.equal(closed.ok, false);
  if (!closed.ok) assert.equal(closed.error, "This campaign is already settled. Further views are not paid.");
  const afterClosed = await readStore();
  assert.equal(afterClosed.submissions.find((item) => item.id === subId)?.views, 0);
  assert.equal(balances(afterClosed).clipperPending, 0);
  assert.deepEqual(balances(afterClosed), closedBefore);
  assert.equal(afterClosed.viewSnapshots.length, 0);
});

test("recordSubmissionViewsAction reports the pending change and refuses a lower count", async () => {
  await seed([submission({ id: subId, views: 0 })]);
  const saved = await recordSubmissionViewsForActor(adminActor, { submissionId: subId, views: 5_000 }, now);
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  const after = await readStore();
  assert.equal(after.submissions.find((item) => item.id === subId)?.views, 5_000);
  assert.equal(balances(after).clipperPending, 25_000);
  assert.equal(saved.creditedCents, 25_000);
  assert.equal(balances(after).clipperAvailable, 0);

  const same = await recordSubmissionViewsForActor(adminActor, { submissionId: subId, views: 5_000 }, now);
  assert.equal(same.ok, true);
  if (!same.ok) return;
  assert.equal(same.creditedCents, 0);
  const held = await readStore();
  assert.equal(held.submissions.find((item) => item.id === subId)?.views, 5_000);
  assert.equal(balances(held).clipperPending, 25_000);

  const lowered = await recordSubmissionViewsForActor(adminActor, { submissionId: subId, views: 100 }, now);
  assert.equal(lowered.ok, false);
  if (!lowered.ok) assert.equal(lowered.error, "Views cannot go backwards.");
  const afterLower = await readStore();
  assert.equal(afterLower.submissions.find((item) => item.id === subId)?.views, 5_000);
  assert.equal(balances(afterLower).clipperPending, 25_000);

  const higher = await recordSubmissionViewsForActor(adminActor, { submissionId: subId, views: 6_000 }, now);
  assert.equal(higher.ok, true);
  if (!higher.ok) return;
  const raised = await readStore();
  assert.equal(raised.submissions.find((item) => item.id === subId)?.views, 6_000);
  assert.equal(balances(raised).clipperPending, 30_000);
  assert.equal(higher.creditedCents, 5_000);
  assert.equal(balances(raised).clipperAvailable, 0);
});

test("a completed campaign refuses view saves and does not close out", async () => {
  await seed([submission({ id: subId, views: 0 })]);
  const opened = await saveAdminViewForActor(adminActor, { submissionId: subId, views: 1_000 }, now);
  assert.equal(opened.ok, true);
  await updateStore((store) => {
    const camp = store.campaigns.find((item) => item.id === campId);
    if (!camp) throw new Error("missing campaign");
    camp.status = "completed";
    camp.closedAt = null;
    camp.settledAt = null;
    store.viewSnapshots.push(creatorReport());
  });
  const before = await readStore();
  const beforeBalances = balances(before);
  const beforeViews = before.submissions.find((item) => item.id === subId)?.views;
  const beforeLedger = before.ledgerEntries.length;
  assert.equal(before.campaigns.find((item) => item.id === campId)?.closedAt, null);
  assert.ok(beforeBalances.clipperPending > 0);

  const adminSave = await saveAdminViewForActor(adminActor, { submissionId: subId, views: 2_000 }, now);
  const manualSave = await setManualViewsForActor(adminActor, { submissionId: subId, views: 2_000 }, now);
  const recorded = await recordSubmissionViewsForActor(adminActor, { submissionId: subId, views: 5_000 }, now);
  const bulk = await saveBulkViewsForActor(adminActor, [{ submissionId: subId, views: 2_000 }], now);
  const confirmed = await confirmCreatorViewForActor(
    adminActor,
    { snapshotId: snapId, submissionId: subId, views: 2_000 },
    now,
  );
  for (const refused of [adminSave, manualSave, recorded, bulk, confirmed]) {
    assert.equal(refused.ok, false);
    if (!refused.ok) assert.equal(refused.error, "This campaign is already settled. Further views are not paid.");
  }

  const after = await readStore();
  const camp = after.campaigns.find((item) => item.id === campId);
  assert.equal(camp?.status, "completed");
  assert.equal(camp?.closedAt, null);
  assert.deepEqual(balances(after), beforeBalances);
  assert.equal(after.submissions.find((item) => item.id === subId)?.views, beforeViews);
  assert.equal(after.ledgerEntries.length, beforeLedger);
  assert.equal(after.viewSnapshots.find((item) => item.id === snapId)?.status, "pending");
});

test("an admin view save still closes a campaign when the budget is spent", async () => {
  await seed([submission({ id: subId, views: 0 })]);
  const saved = await saveAdminViewForActor(adminActor, { submissionId: subId, views: 40_000 }, now);
  assert.equal(saved.ok, true);
  const after = await readStore();
  const camp = after.campaigns.find((item) => item.id === campId);
  assert.equal(camp?.status, "completed");
  assert.ok(camp?.closedAt);
  assert.equal(balances(after).clipperPending, 200_000);
  assert.equal(balances(after).clipperAvailable, 0);
});

test("saveBulkViewsAction refuses a lower row and writes nothing", async () => {
  await seed([
    submission({ id: subId, views: 0 }),
    submission({ id: sub2Id, views: 8_000, postUrl: "https://www.tiktok.com/@kai/video/2" }),
  ]);
  const before = balances(await readStore());
  const refused = await saveBulkViewsForActor(
    adminActor,
    [
      { submissionId: subId, views: 5_000 },
      { submissionId: sub2Id, views: 100 },
    ],
    now,
  );
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.error, "Views cannot go backwards.");
  const after = await readStore();
  assert.equal(after.submissions.find((item) => item.id === subId)?.views, 0);
  assert.equal(after.submissions.find((item) => item.id === sub2Id)?.views, 8_000);
  assert.equal(after.viewSnapshots.length, 0);
  assert.deepEqual(balances(after), before);
  assert.equal(balances(after).clipperPending, 0);
});

test("saveBulkViewsAction accepts an equal count and a higher count", async () => {
  await seed([
    submission({ id: subId, views: 0 }),
    submission({ id: sub2Id, views: 0, postUrl: "https://www.tiktok.com/@kai/video/2" }),
  ]);
  const first = await saveAdminViewForActor(adminActor, { submissionId: subId, views: 1_000 }, now);
  assert.equal(first.ok, true);
  const held = balances(await readStore());

  const saved = await saveBulkViewsForActor(
    adminActor,
    [
      { submissionId: subId, views: 1_000 },
      { submissionId: sub2Id, views: 2_000 },
    ],
    now,
  );
  assert.equal(saved.ok, true);
  const after = await readStore();
  assert.equal(after.submissions.find((item) => item.id === subId)?.views, 1_000);
  assert.equal(after.submissions.find((item) => item.id === sub2Id)?.views, 2_000);
  assert.ok(balances(after).clipperPending > held.clipperPending);
  assert.equal(balances(after).clipperAvailable, 0);
});

test("saveBulkViewsAction refuses a settled campaign and writes nothing", async () => {
  await seed(
    [
      submission({ id: subId, views: 0 }),
      submission({ id: sub2Id, views: 0, postUrl: "https://www.tiktok.com/@kai/video/2" }),
    ],
    true,
  );
  const before = balances(await readStore());
  const refused = await saveBulkViewsForActor(
    adminActor,
    [
      { submissionId: subId, views: 1_000 },
      { submissionId: sub2Id, views: 2_000 },
    ],
    now,
  );
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.error, "This campaign is already settled. Further views are not paid.");
  const after = await readStore();
  assert.equal(after.submissions.find((item) => item.id === subId)?.views, 0);
  assert.equal(after.submissions.find((item) => item.id === sub2Id)?.views, 0);
  assert.equal(after.viewSnapshots.length, 0);
  assert.deepEqual(balances(after), before);
});

test("confirmCreatorViewAction refuses a lower count and accepts equal or higher", async () => {
  await seed([submission({ id: subId, views: 0 })]);
  const opened = await saveAdminViewForActor(adminActor, { submissionId: subId, views: 4_000 }, now);
  assert.equal(opened.ok, true);
  await updateStore((store) => {
    store.viewSnapshots.push(creatorReport());
  });
  const held = await readStore();
  const heldBalances = balances(held);

  const lowered = await confirmCreatorViewForActor(
    adminActor,
    { snapshotId: snapId, submissionId: subId, views: 100 },
    now,
  );
  assert.equal(lowered.ok, false);
  if (!lowered.ok) assert.equal(lowered.error, "Views cannot go backwards.");
  const afterLower = await readStore();
  assert.deepEqual(balances(afterLower), heldBalances);
  assert.equal(afterLower.submissions.find((item) => item.id === subId)?.views, 4_000);
  assert.equal(afterLower.viewSnapshots.find((item) => item.id === snapId)?.status, "pending");

  const same = await confirmCreatorViewForActor(
    adminActor,
    { snapshotId: snapId, submissionId: subId, views: 4_000 },
    now,
  );
  assert.equal(same.ok, true);
  const afterSame = await readStore();
  assert.equal(afterSame.submissions.find((item) => item.id === subId)?.views, 4_000);
  assert.deepEqual(balances(afterSame), heldBalances);
  assert.equal(afterSame.viewSnapshots.find((item) => item.id === snapId)?.status, "replaced");

  const nextSnap = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  await updateStore((store) => {
    store.viewSnapshots.push(creatorReport({ id: nextSnap, views: 8_000 }));
  });
  const higher = await confirmCreatorViewForActor(
    adminActor,
    { snapshotId: nextSnap, submissionId: subId, views: 8_000 },
    now,
  );
  assert.equal(higher.ok, true);
  const afterHigher = await readStore();
  assert.equal(afterHigher.submissions.find((item) => item.id === subId)?.views, 8_000);
  assert.ok(balances(afterHigher).clipperPending > heldBalances.clipperPending);
  assert.equal(balances(afterHigher).clipperAvailable, 0);
});

test("confirmCreatorViewAction refuses pending and flagged clips", async () => {
  await seed([
    submission({
      id: subId,
      status: "pending",
      views: 0,
      approvedAt: null,
      earningUntil: null,
      payoutState: "none",
    }),
  ]);
  await updateStore((store) => {
    store.viewSnapshots.push(creatorReport());
  });
  const pending = await confirmCreatorViewForActor(
    adminActor,
    { snapshotId: snapId, submissionId: subId, views: 1_000 },
    now,
  );
  assert.equal(pending.ok, false);
  if (!pending.ok) assert.equal(pending.error, "Approve the clip before counting views.");
  const afterPending = await readStore();
  assert.equal(afterPending.submissions.find((item) => item.id === subId)?.status, "pending");
  assert.equal(afterPending.submissions.find((item) => item.id === subId)?.views, 0);
  assert.equal(balances(afterPending).clipperPending, 0);
  assert.equal(afterPending.viewSnapshots.find((item) => item.id === snapId)?.status, "pending");

  await seed([submission({ id: subId, views: 0 })]);
  const counted = await saveAdminViewForActor(adminActor, { submissionId: subId, views: 1_000 }, now);
  assert.equal(counted.ok, true);
  await updateStore((store) => {
    const clip = store.submissions.find((item) => item.id === subId);
    if (!clip) throw new Error("missing clip");
    clip.status = "flagged";
    store.viewSnapshots.push(creatorReport());
  });
  const held = balances(await readStore());
  const flagged = await confirmCreatorViewForActor(
    adminActor,
    { snapshotId: snapId, submissionId: subId, views: 2_000 },
    now,
  );
  assert.equal(flagged.ok, false);
  if (!flagged.ok) assert.equal(flagged.error, "Approve the clip before counting views.");
  const afterFlagged = await readStore();
  assert.equal(afterFlagged.submissions.find((item) => item.id === subId)?.status, "flagged");
  assert.equal(afterFlagged.submissions.find((item) => item.id === subId)?.views, 1_000);
  assert.deepEqual(balances(afterFlagged), held);
  assert.equal(afterFlagged.viewSnapshots.find((item) => item.id === snapId)?.status, "pending");
});

test("approve then flag then reject claws the reserve back once", async () => {
  await seed([submission({ id: subId, views: 0 })]);
  const counted = await saveAdminViewForActor(adminActor, { submissionId: subId, views: 4_000 }, now);
  assert.equal(counted.ok, true);
  const held = balances(await readStore());
  assert.ok(held.clipperPending > 0);
  assert.equal(held.clipperAvailable, 0);

  const flagged = await reviewSubmissionForActor(brandActor, subId, { status: "flagged", reviewNote: "Check this" }, now);
  assert.equal(flagged.ok, true);
  const afterFlag = await readStore();
  assert.equal(afterFlag.submissions.find((item) => item.id === subId)?.status, "flagged");
  assert.deepEqual(balances(afterFlag), held);

  const rejected = await reviewSubmissionForActor(brandActor, subId, { status: "rejected" }, now);
  assert.equal(rejected.ok, true);
  const once = await readStore();
  const clip = once.submissions.find((item) => item.id === subId);
  assert.equal(clip?.status, "rejected");
  assert.equal(clip?.reservedCents, 0);
  assert.equal(balances(once).clipperPending, 0);
  assert.equal(balances(once).clipperAvailable, 0);
  assert.ok(balances(once).brandAvailable > held.brandAvailable);
  assert.equal(
    once.ledgerEntries.filter((entry) => entry.referenceId === subId && entry.referenceType === "campaign_clawback").length,
    1,
  );
});

test("a second reject after a flagged clip is rejected does nothing", async () => {
  await seed([submission({ id: subId, views: 0 })]);
  const counted = await saveAdminViewForActor(adminActor, { submissionId: subId, views: 4_000 }, now);
  assert.equal(counted.ok, true);
  const flagged = await reviewSubmissionForActor(brandActor, subId, { status: "flagged" }, now);
  assert.equal(flagged.ok, true);
  const first = await reviewSubmissionForActor(brandActor, subId, { status: "rejected" }, now);
  assert.equal(first.ok, true);
  const once = await readStore();
  const onceBalances = balances(once);
  const clawbacks = once.ledgerEntries.filter(
    (entry) => entry.referenceId === subId && entry.referenceType === "campaign_clawback",
  );
  assert.equal(clawbacks.length, 1);
  assert.equal(onceBalances.clipperPending, 0);
  assert.equal(onceBalances.clipperAvailable, 0);

  const second = await reviewSubmissionForActor(brandActor, subId, { status: "rejected" }, now);
  assert.equal(second.ok, true);
  const twice = await readStore();
  assert.deepEqual(balances(twice), onceBalances);
  assert.equal(
    twice.ledgerEntries.filter((entry) => entry.referenceId === subId && entry.referenceType === "campaign_clawback")
      .length,
    1,
  );
  assert.equal(twice.submissions.find((item) => item.id === subId)?.status, "rejected");
});
