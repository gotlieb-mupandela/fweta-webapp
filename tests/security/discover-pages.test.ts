import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { readStore } from "../../lib/db/store";
import {
  influencerProfileHidden,
  onboardingFinished,
  repairDiscoverableCreator,
} from "../../lib/influencer/discover";
import { runHousekeepingJob } from "../../lib/jobs/housekeeping";
import type { DatabaseStore, InfluencerProfile, Profile } from "../../lib/db/types";
import type { UserRole } from "../../types/enums";

function profile(partial: Partial<Profile> & { id: string; roles: UserRole[]; primaryRole: UserRole }): Profile {
  return {
    email: `${partial.id}@fweta.test`,
    passwordHash: "hash",
    displayName: partial.id,
    bio: "Clipping specialist across TikTok and Reels.",
    avatarUrl: null,
    notifyEmail: true,
    notifyWithdrawals: true,
    notifyBookings: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    suspended: false,
    onboardingCompletedAt: null,
    ...partial,
  };
}

function hiddenProfile(userId: string): InfluencerProfile {
  return {
    id: `ip-${userId}`,
    userId,
    slug: `hidden-${userId}`,
    displayName: "Hidden Creator",
    headline: "Kept off the directory",
    bio: "This creator turned the public profile off.",
    niche: "Clipper",
    location: "Windhoek",
    avatarUrl: null,
    socials: {},
    featuredWork: [],
    published: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
  };
}

function memoryStore(profiles: Profile[], influencerProfiles: InfluencerProfile[] = []): DatabaseStore {
  return { profiles, influencerProfiles } as DatabaseStore;
}

test("a discoverable profile is created only after onboarding and only when it is not hidden", () => {
  const now = "2026-03-01T00:00:00.000Z";
  const finished = profile({
    id: "clip-1",
    displayName: "Kai Clips",
    roles: ["clipper"],
    primaryRole: "clipper",
    onboardingCompletedAt: "2026-02-01T00:00:00.000Z",
  });
  const unfinished = profile({
    id: "clip-2",
    displayName: "Not Done",
    roles: ["clipper"],
    primaryRole: "clipper",
    onboardingCompletedAt: null,
  });
  const legacy = profile({
    id: "clip-3",
    displayName: "Legacy",
    roles: ["clipper"],
    primaryRole: "clipper",
    onboardingCompletedAt: undefined,
  });
  const hiddenAccount = profile({
    id: "clip-4",
    displayName: "Hidden Creator",
    roles: ["clipper"],
    primaryRole: "clipper",
    onboardingCompletedAt: "2026-02-01T00:00:00.000Z",
  });
  const hidden = hiddenProfile(hiddenAccount.id);
  const brand = profile({
    id: "brand-1",
    displayName: "Desert Brands",
    roles: ["brand"],
    primaryRole: "brand",
    onboardingCompletedAt: "2026-02-01T00:00:00.000Z",
  });
  const suspended = profile({
    id: "clip-5",
    displayName: "Suspended",
    roles: ["clipper"],
    primaryRole: "clipper",
    onboardingCompletedAt: "2026-02-01T00:00:00.000Z",
    suspended: true,
  });

  assert.equal(onboardingFinished(finished), true);
  assert.equal(onboardingFinished(unfinished), false);
  assert.equal(onboardingFinished(legacy), false);
  assert.equal(influencerProfileHidden(hidden), true);

  const store = memoryStore(
    [finished, unfinished, legacy, hiddenAccount, brand, suspended],
    [hidden],
  );
  assert.equal(repairDiscoverableCreator(store, finished.id, now), true);
  assert.equal(repairDiscoverableCreator(store, unfinished.id, now), false);
  assert.equal(repairDiscoverableCreator(store, legacy.id, now), false);
  assert.equal(repairDiscoverableCreator(store, hiddenAccount.id, now), false);
  assert.equal(repairDiscoverableCreator(store, brand.id, now), false);
  assert.equal(repairDiscoverableCreator(store, suspended.id, now), false);

  assert.equal(store.influencerProfiles.length, 2);
  const created = store.influencerProfiles.find((row) => row.userId === finished.id);
  assert.ok(created);
  assert.equal(created?.published, true);
  assert.equal(created?.slug, "kai-clips");
  const stillHidden = store.influencerProfiles.find((row) => row.userId === hiddenAccount.id);
  assert.equal(stillHidden?.published, false);
  assert.equal(store.influencerProfiles.some((row) => row.userId === unfinished.id), false);
  assert.equal(store.influencerProfiles.some((row) => row.userId === legacy.id), false);
});

function resetStoreCache() {
  (globalThis as { __fwetaStore?: unknown }).__fwetaStore = undefined;
}

test("signed-out influencer pages leave the store byte for byte unchanged", async () => {
  assert.notEqual(process.env.NODE_ENV, "production");
  const dir = mkdtempSync(path.join(tmpdir(), "fweta-discover-"));
  const file = path.join(dir, "store.json");
  const previousData = process.env.FWETA_DATA_DIR;
  const finishedA = profile({
    id: "clip-a",
    displayName: "Kai Clips",
    roles: ["clipper"],
    primaryRole: "clipper",
    onboardingCompletedAt: "2026-02-01T00:00:00.000Z",
  });
  const finishedB = profile({
    id: "clip-b",
    displayName: "Ama Clips",
    roles: ["clipper"],
    primaryRole: "clipper",
    onboardingCompletedAt: "2026-02-02T00:00:00.000Z",
  });
  const hiddenAccount = profile({
    id: "clip-hidden",
    displayName: "Hidden Creator",
    roles: ["clipper"],
    primaryRole: "clipper",
    onboardingCompletedAt: "2026-02-03T00:00:00.000Z",
  });
  const body = JSON.stringify(
    {
      profiles: [finishedA, finishedB, hiddenAccount],
      influencerProfiles: [hiddenProfile(hiddenAccount.id)],
    },
    null,
    2,
  );
  writeFileSync(file, body);

  process.env.FWETA_DATA_DIR = dir;
  resetStoreCache();

  try {
    const before = readFileSync(file);
    const rendered = spawnSync(
      "npx",
      ["tsx", "--require", "./tests/security/stub-server-only.cjs", "./tests/security/render-signed-out-pages.ts"],
      {
        cwd: path.resolve(new URL("../..", import.meta.url).pathname),
        env: { ...process.env, FWETA_DATA_DIR: dir, NODE_ENV: "test" },
        encoding: "utf8",
      },
    );
    if (rendered.status !== 0) {
      throw new Error(rendered.stderr || rendered.stdout || `page render exited ${rendered.status}`);
    }

    const after = readFileSync(file);
    assert.equal(after.equals(before), true);

    resetStoreCache();
    const result = await runHousekeepingJob(new Date("2026-04-01T00:00:00.000Z"));
    assert.equal(result.creatorsRepaired, 2);
    const repaired = await readStore();
    const ids = repaired.influencerProfiles.map((row) => row.userId).sort();
    assert.deepEqual(ids, ["clip-a", "clip-b", "clip-hidden"]);
    assert.equal(repaired.influencerProfiles.find((row) => row.userId === "clip-hidden")?.published, false);
    assert.equal(repaired.influencerProfiles.filter((row) => row.published).length, 2);
  } finally {
    resetStoreCache();
    if (previousData === undefined) delete process.env.FWETA_DATA_DIR;
    else process.env.FWETA_DATA_DIR = previousData;
    rmSync(dir, { recursive: true, force: true });
  }
});
