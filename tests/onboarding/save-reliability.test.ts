import assert from "node:assert/strict";
import test from "node:test";

import { StorePersistError } from "@/lib/db/supabase-store";
import type { DatabaseStore, Profile } from "@/lib/db/types";
import { BRANCH_CODE_PATTERN, branchCodeFieldError } from "@/lib/onboarding/branch-code";
import { clientErrorFromUnknown } from "@/lib/onboarding/errors";
import { createDraft } from "@/lib/onboarding/model";
import { getOnboardingSteps } from "@/lib/onboarding/steps";
import { ONBOARDING_SLOW_MESSAGE, OnboardingTimeoutError, withOnboardingTimeout } from "@/lib/onboarding/submit-timeout";
import { applyWizardCompletion } from "@/lib/onboarding/wizard-complete";
import { answersFromOnboarding, resumeWizardIndex } from "@/lib/onboarding/wizard-resume";
import {
  readOnboardingSession,
  writeOnboardingSession,
  type OnboardingSessionSnapshot,
} from "@/lib/onboarding/wizard-session";
import { StoreConflictError } from "@/lib/db/store-commit";

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

async function flush() {
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
}
