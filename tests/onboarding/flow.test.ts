import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import type { Profile } from "@/lib/db/types";
import {
  allocateSlug,
  allStepsAddressed,
  applyProfileFields,
  bioCodeFor,
  bioContainsCode,
  buildCampaignRequirements,
  checklistItems,
  collectUserFacingCopy,
  completionPercent,
  createDraft,
  depositInstructions,
  emptyGuide,
  isChecklistComplete,
  markStep,
  nadToCents,
  publicProfileUrl,
  recommendCampaigns,
  resumeStepId,
  sanitizeHandle,
  stepIdsFor,
  summarizeOnboarding,
  upsertSocialCheck,
  validateStepComplete,
  verdictFromProfileBody,
} from "@/lib/onboarding/model";
import { onboardingCampaignSchema } from "@/lib/validations/onboarding";
import { clearWelcomeEmail, registerWelcomeEmail, triggerWelcomeEmail } from "@/lib/onboarding/welcome";
import type { UserRole } from "@/types/enums";

function profile(partial: Partial<Profile> & { roles: UserRole[]; primaryRole: UserRole }): Profile {
  return {
    id: "user-1",
    email: "a@fweta.test",
    passwordHash: "hash",
    displayName: "a",
    bio: "",
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

test("creator and brand setups follow different paths", () => {
  assert.deepEqual(stepIdsFor(["clipper"], "clipper"), [
    "name",
    "interests",
    "socials",
    "payout",
    "tour",
    "discover",
  ]);
  assert.deepEqual(stepIdsFor(["brand"], "brand"), [
    "name",
    "company",
    "promote",
    "campaign",
    "deposit",
    "tour",
  ]);
  assert.deepEqual(stepIdsFor(["brand", "influencer"], "brand"), [
    "name",
    "company",
    "promote",
    "campaign",
    "deposit",
    "interests",
    "socials",
    "payout",
    "tour",
    "discover",
  ]);
});

test("skipping a step resumes there until it is finished", () => {
  const steps = stepIdsFor(["clipper"], "clipper");
  let draft = createDraft("name", "t0");
  draft.firstName = "Amara";
  draft.lastName = "Nangolo";
  assert.equal(validateStepComplete("name", draft, { hasPayout: false }), null);
  draft = markStep(steps, draft, "name", "complete", "t1");
  assert.equal(draft.stepId, "interests");

  draft = markStep(steps, draft, "interests", "skip", "t2");
  assert.equal(draft.skipped.includes("interests"), true);
  assert.equal(resumeStepId(steps, draft), "socials");

  draft = markStep(steps, draft, "socials", "skip", "t3");
  draft = markStep(steps, draft, "payout", "skip", "t4");
  draft = markStep(steps, draft, "tour", "skip", "t5");
  draft = markStep(steps, draft, "discover", "skip", "t6");
  assert.equal(allStepsAddressed(steps, draft), true);
  assert.equal(resumeStepId(steps, draft), "discover");

  const items = checklistItems(
    profile({ roles: ["clipper"], primaryRole: "clipper", onboarding: draft }),
    { hasPayout: false },
  );
  assert.equal(items.find((item) => item.id === "name")?.status, "done");
  assert.equal(items.find((item) => item.id === "interests")?.status, "skipped");
  assert.equal(isChecklistComplete(items), false);
  assert.equal(completionPercent(items), 17);
});

test("social verification is required to finish that step", () => {
  const draft = createDraft("socials");
  assert.match(
    validateStepComplete("socials", draft, { hasPayout: false }) ?? "",
    /admin to confirm one account/,
  );
  draft.checks = upsertSocialCheck([], "user-1", "tiktok", "https://www.tiktok.com/@amara");
  assert.equal(draft.checks[0]?.handle, "amara");
  assert.equal(draft.checks[0]?.status, "pending");
  draft.checks[0]!.status = "verified";
  assert.equal(validateStepComplete("socials", draft, { hasPayout: false }), null);
});

test("bio codes are stable and only match the public profile text", () => {
  const code = bioCodeFor("user-1", "instagram");
  assert.equal(code, bioCodeFor("user-1", "instagram"));
  assert.notEqual(code, bioCodeFor("user-1", "tiktok"));
  assert.match(code, /^FWETA-[A-Z2-9]{6}$/);
  assert.equal(publicProfileUrl("x", "@WindhoekClips"), "https://x.com/WindhoekClips");
  assert.equal(sanitizeHandle("bad handle"), null);
  assert.equal(bioContainsCode(`<meta name="description" content="bio ${code}">`, code), true);
  assert.equal(verdictFromProfileBody(null, code), "unread");
  assert.equal(verdictFromProfileBody("no code here", code), "missing");
  assert.equal(verdictFromProfileBody(`about ${code.toLowerCase()}`, code), "verified");
});

test("changing a handle clears a previous verification", () => {
  const first = upsertSocialCheck([], "user-1", "youtube", "channel");
  first[0]!.status = "verified";
  const same = upsertSocialCheck(first, "user-1", "youtube", "@channel");
  assert.equal(same[0]?.status, "verified");
  const changed = upsertSocialCheck(same, "user-1", "youtube", "other");
  assert.equal(changed[0]?.status, "pending");
  assert.notEqual(changed[0]?.code, "");
});

test("campaign draft captures rate, budget, cap, and minimum views", () => {
  const parsed = onboardingCampaignSchema.safeParse({
    title: "Spring clips",
    brief: "Cut the launch film into 20 second clips.",
    rules: "Keep the logo on screen.",
    type: "clipping",
    category: "Food",
    budgetNad: 5000,
    cpmNad: 40,
    maxPayoutNad: 250,
    minViews: 1000,
    platforms: ["tiktok", "instagram"],
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(nadToCents(parsed.data.cpmNad), 4000);
  assert.equal(nadToCents(parsed.data.budgetNad), 500_000);
  const requirements = buildCampaignRequirements(parsed.data);
  assert.match(requirements, /Minimum views before a clip qualifies: 1000/);
  assert.match(requirements, /per-clip cap/);
  assert.equal(requirements.includes("\u2014"), false);

  const tooHigh = onboardingCampaignSchema.safeParse({
    ...parsed.data,
    maxPayoutNad: 6000,
  });
  assert.equal(tooHigh.success, false);
});

test("recommendations prefer a matching live campaign", () => {
  const ranked = recommendCampaigns(
    [
      {
        id: "a",
        title: "Office tour",
        category: "Tech",
        type: "ugc",
        status: "active",
        cpmCents: 1000,
        budgetRemainingCents: 1000,
        platforms: ["tiktok"],
      },
      {
        id: "b",
        title: "Match day",
        category: "Football",
        type: "clipping",
        status: "active",
        cpmCents: 2000,
        budgetRemainingCents: 500,
        platforms: ["tiktok"],
      },
      {
        id: "c",
        title: "Paused",
        category: "Football",
        type: "clipping",
        status: "paused",
        cpmCents: 9000,
        budgetRemainingCents: 9000,
        platforms: ["x"],
      },
    ],
    ["Football"],
  );
  assert.deepEqual(ranked.map((item) => item.id), ["b", "a"]);
});

test("deposit instructions stay a manual transfer", () => {
  const missing = depositInstructions("abc-123");
  assert.equal(missing.configured, false);
  assert.equal(missing.reference, "FWETAABC123");
  const text = missing.steps.join(" ");
  assert.match(text, /admin confirms/i);
  assert.equal(/payfast|stripe|checkout|card payment/i.test(text), false);

  const ready = depositInstructions("abc", {
    bankName: "Bank Windhoek",
    accountName: "Fweta",
    accountNumber: "123456789",
    branchCode: "461266",
  });
  assert.equal(ready.configured, true);
  assert.equal(ready.accountNumber, "123456789");
});

test("empty states point at the next open step", () => {
  const steps = stepIdsFor(["clipper"], "clipper");
  let draft = createDraft("name");
  draft = markStep(steps, draft, "name", "complete", "t");
  draft.firstName = "Kai";
  draft.lastName = "Clips";
  const account = profile({
    roles: ["clipper"],
    primaryRole: "clipper",
    onboardingCompletedAt: "2026-02-01T00:00:00.000Z",
    onboarding: draft,
  });
  const guide = emptyGuide("clipper-submissions", account, { hasPayout: false });
  assert.equal(guide?.href, "/onboarding?step=interests");
});

test("admin summary distinguishes legacy, active, and finished setup", () => {
  const legacy = summarizeOnboarding(
    profile({ roles: ["clipper"], primaryRole: "clipper", onboardingCompletedAt: "seeded" }),
    { hasPayout: false },
  );
  assert.equal(legacy.gate, "legacy");
  assert.equal(legacy.label, "Not required");

  const fresh = summarizeOnboarding(
    profile({ roles: ["brand"], primaryRole: "brand", onboardingCompletedAt: null }),
    { hasPayout: false },
  );
  assert.equal(fresh.gate, "not_started");
  assert.equal(fresh.percent, 0);

  const steps = stepIdsFor(["brand"], "brand");
  let draft = createDraft(steps[0] ?? "name");
  for (const id of steps) {
    if (id === "name") {
      draft.firstName = "A";
      draft.lastName = "B";
    }
    if (id === "company") draft.companyName = "Desert Brands";
    if (id === "promote") draft.promote = "A new cold brew for summer.";
    if (id === "campaign") draft.campaignId = "camp-1";
    if (id === "deposit") draft.depositSeen = true;
    draft = markStep(steps, draft, id, "complete", "t");
  }
  const done = summarizeOnboarding(
    profile({
      roles: ["brand"],
      primaryRole: "brand",
      onboardingCompletedAt: "2026-03-01T00:00:00.000Z",
      onboarding: draft,
      displayName: "Desert Brands",
    }),
    { hasPayout: false },
  );
  assert.equal(done.gate, "complete");
  assert.equal(done.percent, 100);
});

test("brand setup projects the company name onto the profile", () => {
  const account = profile({ roles: ["brand"], primaryRole: "brand" });
  const draft = createDraft("company");
  draft.firstName = "Lena";
  draft.lastName = "Shipanga";
  draft.companyName = "Desert Brands";
  draft.website = "desertbrands.com";
  draft.brandSocials = { instagram: "https://www.instagram.com/desert/" };
  applyProfileFields(account, draft);
  assert.equal(account.displayName, "Desert Brands");
  assert.equal(account.website, "https://desertbrands.com");
  assert.equal(account.socials?.instagram, "https://www.instagram.com/desert/");
  assert.equal(allocateSlug(["desert-brands"], "Desert Brands", account.id), "desert-brands-1");
});

test("welcome email hook is optional until a sender is registered", async () => {
  clearWelcomeEmail();
  await triggerWelcomeEmail({
    userId: "u",
    email: "a@fweta.test",
    displayName: "A",
    roles: ["clipper"],
  });
  const seen: string[] = [];
  registerWelcomeEmail(async (input) => {
    seen.push(input.email);
  });
  await triggerWelcomeEmail({
    userId: "u",
    email: "a@fweta.test",
    displayName: "A",
    roles: ["clipper"],
  });
  assert.deepEqual(seen, ["a@fweta.test"]);
  clearWelcomeEmail();
});

test("onboarding copy has no em dashes", () => {
  for (const line of collectUserFacingCopy()) {
    assert.equal(line.includes("\u2014"), false, line);
    assert.equal(line.includes("\u2013"), false, line);
  }

  const roots = [
    "components/onboarding",
    "app/onboarding",
    "app/help",
    "app/dashboard/admin/onboarding",
    "app/dashboard/admin/payins",
    "app/dashboard/admin/views",
    "app/dashboard/admin/accounts",
    "app/dashboard/admin/workspaces",
    "app/dashboard/brand/team",
    "app/dashboard/settings/accounts",
    "lib/onboarding",
  ];
  const files: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
    }
  }
  for (const root of roots) walk(path.join(process.cwd(), root));
  assert.ok(files.length > 5);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.equal(text.includes("\u2014"), false, file);
  }
});
