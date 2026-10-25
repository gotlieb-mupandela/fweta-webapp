import assert from "node:assert/strict";
import test from "node:test";

import type { UgcApplication, UgcBrief } from "../../lib/db/types";
import { visibleUgcBrief, type UgcBriefViewer } from "../../lib/ugc/brief-access";

const brandId = "brand-1";
const creatorId = "creator-1";
const otherId = "creator-2";
const adminId = "admin-1";

function brief(status: UgcBrief["status"], id = "brief-1"): UgcBrief {
  return {
    id,
    brandId,
    workspaceId: null,
    title: "Spring launch",
    summary: "A short video for the spring launch.",
    format: "vertical",
    lengthSeconds: 30,
    videoCount: 1,
    rawFiles: false,
    usage: "organic",
    termMonths: 3,
    platforms: ["tiktok"],
    territory: "Namibia",
    feePerAssetCents: 50_000,
    budgetCents: 50_000,
    budgetReservedCents: 0,
    revisionLimit: 1,
    status,
    createdAt: "2026-10-18T12:00:00.000Z",
    updatedAt: "2026-10-18T12:00:00.000Z",
  };
}

function application(creator: string, briefId = "brief-1"): UgcApplication {
  return {
    id: `app-${creator}`,
    briefId,
    creatorId: creator,
    status: "applied",
    note: "",
    createdAt: "2026-10-18T12:00:00.000Z",
    updatedAt: "2026-10-18T12:00:00.000Z",
  };
}

function viewer(id: string, roles: string[]): UgcBriefViewer {
  return { id, roles };
}

test("draft brief is visible to the owning brand", () => {
  const found = visibleUgcBrief([brief("draft")], [], "brief-1", viewer(brandId, ["brand"]));
  assert.equal(found?.id, "brief-1");
});

test("draft brief is hidden from another creator", () => {
  const found = visibleUgcBrief(
    [brief("draft")],
    [application(creatorId)],
    "brief-1",
    viewer(creatorId, ["clipper"]),
  );
  assert.equal(found, null);
});

test("draft brief is visible to an admin", () => {
  const found = visibleUgcBrief([brief("draft")], [], "brief-1", viewer(adminId, ["admin"]));
  assert.equal(found?.id, "brief-1");
});

test("paused brief is hidden without an application", () => {
  const found = visibleUgcBrief(
    [brief("paused")],
    [application(otherId)],
    "brief-1",
    viewer(creatorId, ["clipper"]),
  );
  assert.equal(found, null);
});

test("paused brief is visible to the owner and to an admin without an application", () => {
  assert.equal(visibleUgcBrief([brief("paused")], [], "brief-1", viewer(brandId, ["brand"]))?.id, "brief-1");
  assert.equal(visibleUgcBrief([brief("paused")], [], "brief-1", viewer(adminId, ["admin"]))?.id, "brief-1");
});

test("paused brief is visible when the creator has an application", () => {
  const found = visibleUgcBrief(
    [brief("paused")],
    [application(creatorId)],
    "brief-1",
    viewer(creatorId, ["influencer"]),
  );
  assert.equal(found?.id, "brief-1");
});

test("closed brief is hidden without an application", () => {
  const found = visibleUgcBrief([brief("closed")], [], "brief-1", viewer(creatorId, ["clipper", "influencer"]));
  assert.equal(found, null);
});

test("closed brief is visible when the creator has an application", () => {
  const found = visibleUgcBrief(
    [brief("closed")],
    [application(creatorId)],
    "brief-1",
    viewer(creatorId, ["clipper"]),
  );
  assert.equal(found?.id, "brief-1");
});

test("open brief is visible to any creator", () => {
  const found = visibleUgcBrief([brief("open")], [], "brief-1", viewer(otherId, ["clipper"]));
  assert.equal(found?.id, "brief-1");
});

test("unknown brief id is hidden", () => {
  const found = visibleUgcBrief([brief("open")], [application(creatorId)], "missing", viewer(creatorId, ["clipper"]));
  assert.equal(found, null);
});

test("a non-open status other than draft stays hidden without an application", () => {
  const completed = brief("closed");
  (completed as { status: string }).status = "completed";
  const found = visibleUgcBrief([completed], [], "brief-1", viewer(creatorId, ["clipper"]));
  assert.equal(found, null);
});
