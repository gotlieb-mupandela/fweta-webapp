import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { Campaign, DatabaseStore, Submission } from "../../lib/db/types";
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
        assert.equal(wallet?.availableCents, alreadyPaid);
        assert.equal(wallet?.pendingCents, result.creditedCents);
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

function storeHash(store: DatabaseStore): string {
  return createHash("sha256").update(JSON.stringify(store)).digest("hex");
}

const pollEnv = {
  NODE_ENV: "test",
  VERCEL: undefined,
  VERCEL_ENV: undefined,
  NEXT_PHASE: undefined,
  FWETA_STORE: "file",
  APIFY_API_TOKEN: undefined,
  APIFY_VIEWS_ENABLED: undefined,
} as const;

async function seedAndPoll(
  dir: string,
  body: Record<string, unknown>,
  env: Record<string, string | undefined> = {},
) {
  globalThis.__fwetaStore = undefined;
  await writeFile(path.join(dir, "store.json"), JSON.stringify(body));
  let result: Awaited<ReturnType<typeof pollSubmissionViewsJob>> | undefined;
  await withEnv({ ...pollEnv, FWETA_DATA_DIR: dir, ...env }, async () => {
    result = await pollSubmissionViewsJob();
  });
  if (!result) throw new Error("poll did not run");
  return result;
}

test("poll job skips a forfeited clip and an unapproved clip through the shared guard", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "fweta-job-guard-"));
  const live = campaign({ id: "camp-live", status: "active" });
  const rows = [
    submission({ id: "sub-forfeited", campaignId: live.id, payoutState: "clawed_back", fraudState: "upheld" }),
    submission({ id: "sub-pending", campaignId: live.id, status: "pending", postUrl: "https://www.tiktok.com/@kai/video/pending" }),
  ];
  try {
    globalThis.__fwetaStore = undefined;
    await writeFile(
      path.join(dir, "store.json"),
      JSON.stringify({ campaigns: [live], submissions: rows, wallets: [], ledgerEntries: [], viewSnapshots: [] }),
    );
    let before = "";
    let result: Awaited<ReturnType<typeof pollSubmissionViewsJob>> | undefined;
    await withEnv({ ...pollEnv, FWETA_DATA_DIR: dir }, async () => {
      before = storeHash(await readStore());
      result = await pollSubmissionViewsJob();
      const after = await readStore();
      assert.equal(storeHash(after), before);
      assert.equal(result.updated, 0);
      assert.equal(result.failed, 0);
      assert.equal(after.viewSnapshots.length, 0);
      assert.equal(after.submissions.find((item) => item.id === "sub-forfeited")?.views, 1_000);
      assert.equal(after.submissions.find((item) => item.id === "sub-pending")?.views, 1_000);
    });
  } finally {
    globalThis.__fwetaStore = undefined;
    await rm(dir, { recursive: true, force: true });
  }
});

test("an approved live clip with a higher total is written and counted once", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "fweta-job-live-"));
  const live = campaign({ id: "camp-live", status: "active" });
  const row = submission({ id: "sub-live", campaignId: live.id, views: 100, payableViews: 100, earningsCents: 0, releasedCents: 0, releasedAt: null });
  try {
    const result = await seedAndPoll(dir, {
      campaigns: [live],
      submissions: [row],
      wallets: [{ userId: clipper, availableCents: 0, pendingCents: 0, updatedAt: at }],
      ledgerEntries: [],
      viewSnapshots: [],
    });
    const after = await readStore();
    const fresh = after.submissions.find((item) => item.id === row.id);
    assert.equal(result.updated, 1);
    assert.equal(result.mode, "simulated");
    assert.ok(fresh && fresh.views > row.views);
    assert.equal(after.viewSnapshots.filter((snap) => snap.source === "job").length, 1);
  } finally {
    globalThis.__fwetaStore = undefined;
    await rm(dir, { recursive: true, force: true });
  }
});

test("a mix of clips returns exactly the number of view rows written", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "fweta-job-mix-"));
  const live = campaign({ id: "camp-live", status: "active" });
  const closed = campaign({ id: "camp-closed", status: "active", closedAt: at });
  const rows = [
    submission({ id: "sub-a", campaignId: live.id, views: 10, payableViews: 10, earningsCents: 0, releasedCents: 0, releasedAt: null }),
    submission({
      id: "sub-b",
      campaignId: live.id,
      views: 20,
      payableViews: 20,
      earningsCents: 0,
      releasedCents: 0,
      releasedAt: null,
      postUrl: "https://www.tiktok.com/@kai/video/sub-b",
    }),
    submission({ id: "sub-forfeited", campaignId: live.id, payoutState: "clawed_back", postUrl: "https://www.tiktok.com/@kai/video/forfeited" }),
    submission({ id: "sub-pending", campaignId: live.id, status: "pending", postUrl: "https://www.tiktok.com/@kai/video/pending" }),
    submission({ id: "sub-closed", campaignId: closed.id, postUrl: "https://www.tiktok.com/@kai/video/closed" }),
  ];
  try {
    const result = await seedAndPoll(dir, {
      campaigns: [live, closed],
      submissions: rows,
      wallets: [],
      ledgerEntries: [],
      viewSnapshots: [],
    });
    const after = await readStore();
    const written = after.viewSnapshots.filter((snap) => snap.source === "job");
    assert.equal(result.updated, written.length);
    assert.equal(result.updated, 2);
    assert.deepEqual(
      written.map((snap) => snap.submissionId).sort(),
      ["sub-a", "sub-b"],
    );
    for (const id of ["sub-forfeited", "sub-pending", "sub-closed"]) {
      const before = rows.find((item) => item.id === id);
      const fresh = after.submissions.find((item) => item.id === id);
      assert.equal(fresh?.views, before?.views, id);
    }
  } finally {
    globalThis.__fwetaStore = undefined;
    await rm(dir, { recursive: true, force: true });
  }
});

test("a clip or campaign that changes between the read and the write gets no view write", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "fweta-job-race-"));
  const campClip = campaign({ id: "camp-clip", status: "active" });
  const campPause = campaign({ id: "camp-pause", status: "active" });
  const loseApproval = submission({
    id: "sub-lose-approval",
    campaignId: campClip.id,
    views: 100,
    payableViews: 100,
    earningsCents: 0,
    releasedCents: 0,
    releasedAt: null,
    postUrl: "https://www.tiktok.com/@kai/video/lose-approval",
  });
  const loseActive = submission({
    id: "sub-lose-active",
    campaignId: campPause.id,
    views: 100,
    payableViews: 100,
    earningsCents: 0,
    releasedCents: 0,
    releasedAt: null,
    payoutState: "released",
    postUrl: "https://www.tiktok.com/@kai/video/lose-active",
  });
  const originalFetch = globalThis.fetch;
  try {
    globalThis.__fwetaStore = undefined;
    await writeFile(
      path.join(dir, "store.json"),
      JSON.stringify({
        campaigns: [campClip, campPause],
        submissions: [loseApproval, loseActive],
        wallets: [],
        ledgerEntries: [],
        viewSnapshots: [],
      }),
    );
    let changedHash = "";
    let fetches = 0;
    globalThis.fetch = async () => {
      fetches += 1;
      const live = globalThis.__fwetaStore;
      if (!live) throw new Error("store missing");
      if (fetches === 1) {
        const row = live.submissions.find((item) => item.id === loseApproval.id);
        if (!row) throw new Error("clip missing");
        row.status = "pending";
      } else {
        const row = live.campaigns.find((item) => item.id === campPause.id);
        if (!row) throw new Error("campaign missing");
        row.status = "paused";
      }
      changedHash = storeHash(await readStore());
      return new Response(JSON.stringify([{ view_count: 9_000, available: true }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    let result: Awaited<ReturnType<typeof pollSubmissionViewsJob>> | undefined;
    await withEnv(
      {
        ...pollEnv,
        FWETA_DATA_DIR: dir,
        APIFY_API_TOKEN: "test-token",
        APIFY_VIEWS_ENABLED: "true",
      },
      async () => {
        result = await pollSubmissionViewsJob();
        const after = await readStore();
        assert.equal(fetches, 2);
        assert.equal(result.updated, 0);
        assert.equal(result.failed, 0);
        assert.equal(storeHash(after), changedHash);
        assert.equal(after.viewSnapshots.length, 0);
        assert.equal(after.submissions.find((item) => item.id === loseApproval.id)?.views, 100);
        assert.equal(after.submissions.find((item) => item.id === loseActive.id)?.views, 100);
        assert.equal(after.submissions.find((item) => item.id === loseApproval.id)?.status, "pending");
        assert.equal(after.campaigns.find((item) => item.id === campPause.id)?.status, "paused");
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.__fwetaStore = undefined;
    await rm(dir, { recursive: true, force: true });
  }
});
