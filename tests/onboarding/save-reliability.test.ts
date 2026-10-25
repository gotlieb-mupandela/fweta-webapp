import assert from "node:assert/strict";
import test from "node:test";

import { commitLoadedMutation, StoreConflictError, StoreDeadlineError } from "@/lib/db/store-commit";
import { StorePersistError } from "@/lib/db/supabase-store";
import type { DatabaseStore, Profile } from "@/lib/db/types";
import { BRANCH_CODE_PATTERN, branchCodeFieldError } from "@/lib/onboarding/branch-code";
import { clientErrorFromUnknown } from "@/lib/onboarding/errors";
import { createDraft } from "@/lib/onboarding/model";
import { getOnboardingSteps } from "@/lib/onboarding/steps";
import {
  applyOnboardingCampaign,
  applyOnboardingExit,
  applyOnboardingPayout,
  applyOnboardingStep,
  applySocialHandle,
  applySocialVerification,
} from "@/lib/onboarding/step-write";
import { ONBOARDING_SLOW_MESSAGE, OnboardingTimeoutError, withOnboardingTimeout } from "@/lib/onboarding/submit-timeout";
import { applyWizardCompletion } from "@/lib/onboarding/wizard-complete";
import { answersFromOnboarding, resumeWizardIndex } from "@/lib/onboarding/wizard-resume";
import {
  readOnboardingSession,
  writeOnboardingSession,
  type OnboardingSessionSnapshot,
} from "@/lib/onboarding/wizard-session";
function empty(): DatabaseStore {
  return {
    profiles: [],
    campaigns: [],
    submissions: [],
    viewSnapshots: [],
    wallets: [],
    ledgerEntries: [],
    payoutMethods: [],
    withdrawalRequests: [],
    influencerProfiles: [],
    rateCards: [],
    bookings: [],
    brandDeposits: [],
    fraudFlags: [],
    notifications: [],
    notificationDispatches: [],
    linkedAccounts: [],
    socialAccounts: [],
    workspaces: [],
    workspaceMembers: [],
    savedCampaigns: [],
    supportTickets: [],
    supportMessages: [],
    auditLog: [],
    prizeAwards: [],
    platformSettings: [],
    ugcBriefs: [],
    ugcApplications: [],
    ugcDeliveries: [],
    contentLicenses: [],
    licenseDisputes: [],
    creatorPortfolios: [],
    businessListings: [],
    creatorReviews: [],
  };
}

function creator(): Profile {
  return {
    id: "user-1",
    email: "amara@fweta.test",
    passwordHash: "hash",
    displayName: "amara",
    bio: "",
    avatarUrl: null,
    roles: ["influencer"],
    primaryRole: "influencer",
    notifyEmail: true,
    notifyWithdrawals: true,
    notifyBookings: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    suspended: false,
    onboardingCompletedAt: null,
  };
}

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

test("finishing onboarding twice does not duplicate the creator", () => {
  const store = empty();
  store.profiles.push(creator());
  const input = {
    firstName: "Amara",
    lastName: "Nangolo",
    phone: "+264 81 000 0000",
    socials: { tiktok: "https://www.tiktok.com/@amara" },
    niche: "Lifestyle",
    location: "Windhoek",
    primaryPlatform: "tiktok" as const,
  };
  applyWizardCompletion(store, "user-1", input, "2026-10-25T12:00:00.000Z");
  applyWizardCompletion(store, "user-1", input, "2026-10-25T12:00:05.000Z");

  assert.equal(store.profiles.length, 1);
  assert.equal(store.influencerProfiles.length, 1);
  assert.equal(store.influencerProfiles[0]?.slug, "amara-nangolo");
  assert.equal(store.influencerProfiles[0]?.userId, "user-1");
  assert.equal(store.profiles[0]?.onboardingCompletedAt, "2026-10-25T12:00:05.000Z");
  assert.equal(store.profiles[0]?.socials?.tiktok, "https://www.tiktok.com/@amara");
});

test("store failures shown to the user do not name Supabase", () => {
  const original = console.error;
  const lines: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    lines.push(args);
  };
  try {
    const persist = clientErrorFromUnknown(
      new StorePersistError(
        "Supabase request failed. Check NEXT_PUBLIC_SUPABASE_URL and the service role key.",
      ),
    );
    const conflict = clientErrorFromUnknown(new StoreConflictError("fweta_store_conflict"));
    const migration = clientErrorFromUnknown(
      new Error(
        "Refusing to save the store without fweta_cas_save_store. Apply the store revision migration before writing.",
      ),
    );
    const safe = clientErrorFromUnknown(new Error("Profile not found."));

    for (const message of [persist, conflict, migration]) {
      assert.equal(/supabase/i.test(message), false);
      assert.equal(/database/i.test(message), false);
      assert.equal(/migration/i.test(message), false);
      assert.match(message, /Reference [a-f0-9]{8}/);
    }
    assert.equal(safe, "Profile not found.");
    assert.equal(lines.length, 4);
    assert.match(String(lines[0]?.[0]), /\[fweta\] onboarding [a-f0-9]{8}/);
  } finally {
    console.error = original;
  }
});

test("a saved server draft resumes past mission 1", () => {
  const steps = getOnboardingSteps(["clipper"]);
  assert.equal(steps.length, 10);
  assert.equal(resumeWizardIndex(steps, null), 0);

  const draft = createDraft("socials", "2026-10-25T12:00:00.000Z");
  draft.firstName = "Amara";
  draft.lastName = "Nangolo";
  draft.phone = "+264 81 000 0000";
  draft.completed = ["name", "interests"];
  const index = resumeWizardIndex(steps, draft);
  assert.equal(steps[index]?.id, "socialTiktok");
  assert.ok(index > 0);

  const answers = answersFromOnboarding({ onboarding: draft });
  assert.equal(answers.firstName, "Amara");
  assert.equal(answers.lastName, "Nangolo");

  const finished = createDraft("discover", "2026-10-25T12:00:00.000Z");
  assert.equal(resumeWizardIndex(steps, finished), steps.length - 1);
});

test("creator social steps say one profile is required, and brands can still skip all", () => {
  const creator = getOnboardingSteps(["clipper"]);
  const tiktok = creator.find((step) => step.id === "socialTiktok");
  assert.match(tiktok?.subtitle ?? "", /At least one social profile is required to finish/);
  assert.equal(tiktok?.optional, true);

  const brand = getOnboardingSteps(["brand"]);
  const brandTiktok = brand.find((step) => step.id === "socialTiktok");
  assert.equal(/at least one social profile/i.test(brandTiktok?.subtitle ?? ""), false);
  assert.match(brandTiktok?.subtitle ?? "", /Skip if you don't use TikTok/);
});

test("answers stay in session storage for this user", () => {
  const storage = memoryStorage();
  const snapshot: OnboardingSessionSnapshot<{ firstName: string }> = {
    v: 1,
    userId: "user-1",
    index: 9,
    xp: 40,
    answers: { firstName: "Amara" },
  };
  writeOnboardingSession(storage, snapshot);
  assert.deepEqual(readOnboardingSession(storage, "user-1"), snapshot);
  assert.equal(readOnboardingSession(storage, "someone-else"), null);
});

test("a branch code accepts six digits and rejects the letter d", () => {
  assert.equal(BRANCH_CODE_PATTERN, "[0-9]{6}");
  assert.equal(new RegExp(`^${BRANCH_CODE_PATTERN}$`).test("461266"), true);
  assert.equal(new RegExp(`^${BRANCH_CODE_PATTERN}$`).test("dddddd"), false);
  assert.equal(branchCodeFieldError(""), "Branch code must be 6 digits.");
  assert.equal(branchCodeFieldError("46126"), "Branch code must be 6 digits.");
  assert.equal(branchCodeFieldError("461266"), null);
});

test("a timed out onboarding write that lands late is safe to retry", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.after(() => {
    t.mock.timers.reset();
  });
  const now = "2026-10-25T12:00:00.000Z";

  const finished = await lateThenRetry(t, withProfile(creator()), (store) => {
    applyWizardCompletion(
      store,
      "user-1",
      {
        firstName: "Amara",
        lastName: "Nangolo",
        phone: "+264 81 000 0000",
        socials: { tiktok: "https://www.tiktok.com/@amara" },
        niche: "Lifestyle",
        location: "Windhoek",
        primaryPlatform: "tiktok",
      },
      now,
    );
  });
  assert.equal(finished.landed.influencerProfiles.length, 1);
  assert.equal(finished.retried.influencerProfiles.length, 1);
  assert.equal(finished.landed.influencerProfiles[0]?.id, finished.retried.influencerProfiles[0]?.id);
  assert.equal(finished.retried.profiles[0]?.onboardingCompletedAt, now);
  assert.equal(finished.retried.profiles[0]?.socials?.tiktok, "https://www.tiktok.com/@amara");

  const named = await lateThenRetry(t, withProfile(creator()), (store) => {
    applyOnboardingStep(
      store,
      "user-1",
      {
        stepId: "name",
        mode: "complete",
        firstName: "Amara",
        lastName: "Nangolo",
        phone: "+264 81 000 0000",
      },
      now,
    );
  });
  assert.equal(named.retried.profiles.length, 1);
  assert.equal(named.retried.influencerProfiles.length, 0);
  assert.equal(named.retried.profiles[0]?.displayName, "Amara Nangolo");
  assert.equal(named.landed.profiles[0]?.updatedAt, named.retried.profiles[0]?.updatedAt);

  const paid = await lateThenRetry(t, withProfile(creator()), (store) => {
    applyOnboardingPayout(
      store,
      "user-1",
      {
        bankName: "Bank Windhoek",
        branchCode: "461266",
        accountNumber: "12345678",
        accountHolderName: "Amara Nangolo",
        accountType: "cheque",
      },
      now,
      (plain) => `enc:${plain}`,
    );
  });
  assert.equal(paid.landed.payoutMethods.length, 1);
  assert.equal(paid.retried.payoutMethods.length, 1);
  assert.equal(paid.landed.payoutMethods[0]?.id, paid.retried.payoutMethods[0]?.id);
  assert.equal(paid.retried.payoutMethods[0]?.accountNumberEnc, "enc:12345678");
  assert.equal(paid.retried.payoutMethods[0]?.branchCode, "461266");

  const campaign = await lateThenRetry(t, withProfile(brand()), (store) => {
    applyOnboardingCampaign(
      store,
      "brand-1",
      {
        title: "Desert clips",
        brief: "Cut the podcast into short clips.",
        rules: "Mention the brand.",
        type: "clipping",
        category: "Podcast",
        budgetNad: 1000,
        cpmNad: 10,
        maxPayoutNad: 100,
        minViews: 100,
        platforms: ["tiktok"],
      },
      { budget: 100_000, cpm: 1_000, cap: 10_000 },
      now,
    );
  });
  assert.equal(campaign.landed.campaigns.length, 1);
  assert.equal(campaign.retried.campaigns.length, 1);
  assert.equal(campaign.landed.campaigns[0]?.id, campaign.retried.campaigns[0]?.id);
  assert.equal(campaign.landed.workspaces.length, 1);
  assert.equal(campaign.retried.workspaces.length, 1);
  assert.equal(campaign.landed.workspaces[0]?.id, campaign.retried.workspaces[0]?.id);
  assert.equal(campaign.retried.workspaceMembers.length, 1);
  assert.equal(campaign.retried.profiles[0]?.onboarding?.campaignId, campaign.retried.campaigns[0]?.id);

  const exited = await lateThenRetry(t, withProfile(creator()), (store) => {
    applyOnboardingExit(store, "user-1", now);
  });
  assert.equal(exited.landed.influencerProfiles.length, 1);
  assert.equal(exited.retried.influencerProfiles.length, 1);
  assert.equal(exited.landed.influencerProfiles[0]?.id, exited.retried.influencerProfiles[0]?.id);
  assert.equal(exited.retried.profiles[0]?.onboardingCompletedAt, now);

  const handled = await lateThenRetry(t, withProfile(creator()), (store) => {
    applySocialHandle(store, "user-1", "tiktok", "amara", now);
  });
  assert.equal(handled.retried.profiles[0]?.onboarding?.checks.length, 1);
  assert.equal(handled.landed.profiles[0]?.onboarding?.checks.length, 1);
  assert.equal(handled.retried.profiles[0]?.onboarding?.checks[0]?.handle, "amara");

  const ready = withProfile(creator());
  applySocialHandle(ready, "user-1", "tiktok", "amara", now);
  const verified = await lateThenRetry(t, ready, (store) => {
    applySocialVerification(store, "user-1", "tiktok", "amara", now);
  });
  assert.equal(verified.retried.profiles[0]?.onboarding?.checks.length, 1);
  assert.equal(verified.retried.profiles[0]?.onboarding?.checks[0]?.status, "verified");
  assert.equal(verified.landed.profiles[0]?.onboarding?.checks[0]?.verifiedAt, now);
  assert.equal(verified.retried.profiles[0]?.onboarding?.checks[0]?.verifiedAt, now);
});

test("a submit stops waiting after the client timeout", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = withOnboardingTimeout(new Promise(() => undefined), 25_000);
  const settled = pending.then(
    () => null,
    (error: unknown) => error,
  );
  t.mock.timers.tick(24_999);
  let early = false;
  settled.then(() => {
    early = true;
  }, () => {
    early = true;
  });
  await flush();
  assert.equal(early, false);
  t.mock.timers.tick(1);
  const error = await settled;
  assert.ok(error instanceof OnboardingTimeoutError);
  assert.equal(error.message, ONBOARDING_SLOW_MESSAGE);
  assert.equal(/supabase/i.test(error.message), false);
  t.mock.timers.reset();
});

function withProfile(profile: Profile): DatabaseStore {
  const store = empty();
  store.profiles.push(profile);
  return store;
}

function brand(): Profile {
  return {
    ...creator(),
    id: "brand-1",
    email: "brand@fweta.test",
    displayName: "Desert Brands",
    roles: ["brand"],
    primaryRole: "brand",
    companyName: "Desert Brands",
  };
}

async function lateThenRetry(
  t: { mock: { timers: { tick: (ms: number) => void } } },
  initial: DatabaseStore,
  mutate: (store: DatabaseStore) => void,
): Promise<{ landed: DatabaseStore; retried: DatabaseStore }> {
  let current = structuredClone(initial);
  let revision = 1;
  let releaseLateWrite: () => void = () => undefined;
  const lateWrite = new Promise<void>((resolve) => {
    releaseLateWrite = resolve;
  });
  let saves = 0;

  const pending = commitLoadedMutation({
    deadlineMs: 1_000,
    load: async () => ({ store: structuredClone(current), revision }),
    save: async (store, expected) => {
      saves += 1;
      if (saves === 1) await lateWrite;
      if (expected !== revision) return { ok: false as const, conflict: true as const };
      current = structuredClone(store);
      revision += 1;
      return { ok: true as const, revision };
    },
    clone: (store) => structuredClone(store),
    mutate,
  });
  const settled = pending.then(
    () => null,
    (error: unknown) => error,
  );
  for (let i = 0; i < 20 && saves < 1; i += 1) await flush();
  assert.equal(saves, 1);
  t.mock.timers.tick(1_000);
  const error = await settled;
  assert.ok(error instanceof StoreDeadlineError);
  releaseLateWrite();
  for (let i = 0; i < 5; i += 1) await flush();
  assert.equal(revision, 2);
  const landed = structuredClone(current);

  await commitLoadedMutation({
    deadlineMs: 60_000,
    sleep: async () => undefined,
    load: async () => ({ store: structuredClone(current), revision }),
    save: async (store, expected) => {
      if (expected !== revision) return { ok: false as const, conflict: true as const };
      current = structuredClone(store);
      revision += 1;
      return { ok: true as const, revision };
    },
    clone: (store) => structuredClone(store),
    mutate,
  });

  return { landed, retried: current };
}

async function flush() {
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
}
