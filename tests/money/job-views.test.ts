import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { Campaign, Submission } from "../../lib/db/types";
import { readStore } from "../../lib/db/store";
import { pollSubmissionViewsJob } from "../../lib/jobs/submission-jobs";
import { hydrateCampaign, hydrateSubmission } from "../../lib/rewards/content-rewards";

const brand = "11111111-1111-4111-8111-111111111111";
const clipper = "22222222-2222-4222-8222-222222222222";
const at = "2026-10-17T12:00:00.000Z";

async function withEnv(values: Record<string, string | undefined>, fn: () => Promise<void>) {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(values)) previous.set(key, process.env[key]);
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function campaign(partial: Partial<Campaign> & Pick<Campaign, "id" | "status">): Campaign {
  return hydrateCampaign({
    brandId: brand,
    title: partial.id,
    description: "Cut",
    type: "clipping",
    category: "podcast",
    budgetTotalCents: 1_000_000,
    budgetSpentCents: 1_000,
    cpmCents: 1_000,
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
    maxPayoutPerSubmissionCents: 1_000_000,
    platforms: ["tiktok"],
    requirements: "Hook",
    rules: "",
    assets: [],
    startDate: null,
    endDate: null,
    createdAt: at,
    updatedAt: at,
    ...partial,
  });
}

function submission(partial: Partial<Submission> & Pick<Submission, "id" | "campaignId">): Submission {
  return hydrateSubmission({
    clipperId: clipper,
    postUrl: `https://www.tiktok.com/@kai/video/${partial.id}`,
    platform: "tiktok",
    status: "approved",
    reviewNote: null,
    views: 1_000,
    baselineViews: 0,
    payableViews: 1_000,
    reservedCents: 0,
    releasedCents: 1_000,
    earningsCents: 1_000,
    approvedAt: at,
    earningUntil: null,
    holdUntil: null,
    releasedAt: at,
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
    createdAt: at,
    updatedAt: at,
    ...partial,
  });
}

test("a settled or closed campaign and a forfeited clip get no new views or money from the poll job", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "fweta-job-views-"));
  const paid = 1_000;
  const campaigns = [
    campaign({ id: "camp-closed", status: "active", closedAt: at }),
    campaign({ id: "camp-settled", status: "active", poolSettledAt: at }),
    campaign({ id: "camp-completed", status: "completed" }),
    campaign({ id: "camp-live", status: "active", budgetSpentCents: paid * 2 }),
  ];
  const blocked = [
    submission({ id: "sub-closed", campaignId: "camp-closed" }),
    submission({ id: "sub-settled", campaignId: "camp-settled" }),
    submission({ id: "sub-completed", campaignId: "camp-completed" }),
    submission({ id: "sub-upheld", campaignId: "camp-live", fraudState: "upheld" }),
    submission({ id: "sub-clawed", campaignId: "camp-live", payoutState: "clawed_back" }),
  ];
  const open = submission({
    id: "sub-open",
    campaignId: "camp-live",
    views: 0,
    payableViews: 0,
    releasedCents: 0,
    earningsCents: 0,
    releasedAt: null,
  });
  const alreadyPaid = blocked.length * paid;

  try {
    await withEnv(
      {
        NODE_ENV: "test",
        VERCEL: undefined,
        VERCEL_ENV: undefined,
        NEXT_PHASE: undefined,
        FWETA_STORE: "file",
        FWETA_DATA_DIR: dir,
        APIFY_API_TOKEN: undefined,
        APIFY_VIEWS_ENABLED: undefined,
      },
      async () => {
        globalThis.__fwetaStore = undefined;
        await writeFile(
          path.join(dir, "store.json"),
          JSON.stringify({
            campaigns,
            submissions: [...blocked, open],
            wallets: [{ userId: clipper, availableCents: alreadyPaid, pendingCents: 0, updatedAt: at }],
            ledgerEntries: [],
            viewSnapshots: [],
          }),
        );

        // Blocked clips are already paid for the views they have. The poll must
        // not add views, so the earnings pass has nothing new to credit.
        // recalculateEarningsJob does not add a skip of its own.
        const result = await pollSubmissionViewsJob();
        const after = await readStore();
        const freshOpen = after.submissions.find((item) => item.id === "sub-open");
        assert.ok(freshOpen);
        assert.ok(freshOpen.views > 0);
        assert.equal(result.updated, 1);
        assert.equal(result.failed, 0);
        assert.equal(result.mode, "simulated");
        assert.ok(result.creditedCents > 0);
        assert.equal(result.creditedCents, freshOpen.views);

        for (const before of blocked) {
          const fresh = after.submissions.find((item) => item.id === before.id);
          assert.ok(fresh, before.id);
          assert.equal(fresh.views, before.views, before.id);
          assert.equal(fresh.earningsCents, before.earningsCents, before.id);
          assert.equal(
            after.viewSnapshots.filter((snap) => snap.submissionId === before.id).length,
            0,
            before.id,
          );
          assert.equal(
            after.ledgerEntries.filter((entry) => entry.referenceId === before.id).length,
            0,
            before.id,
          );
        }

        assert.equal(after.ledgerEntries.length, 1);
        assert.equal(after.ledgerEntries[0]?.referenceId, "sub-open");
        assert.equal(after.ledgerEntries[0]?.amountCents, result.creditedCents);
        const wallet = after.wallets.find((item) => item.userId === clipper);
        assert.equal(wallet?.availableCents, alreadyPaid + result.creditedCents);
        assert.equal(
          after.campaigns.find((item) => item.id === "camp-live")?.budgetSpentCents,
          paid * 2 + result.creditedCents,
        );
        for (const id of ["camp-closed", "camp-settled", "camp-completed"]) {
          assert.equal(after.campaigns.find((item) => item.id === id)?.budgetSpentCents, paid, id);
        }
        const openSnaps = after.viewSnapshots.filter((snap) => snap.submissionId === "sub-open");
        assert.equal(openSnaps.length, 1);
        assert.equal(openSnaps[0]?.source, "job");
        assert.equal(openSnaps[0]?.status, "confirmed");
      },
    );
  } finally {
    globalThis.__fwetaStore = undefined;
    await rm(dir, { recursive: true, force: true });
  }
});
