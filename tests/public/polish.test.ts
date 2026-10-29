import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import type { InfluencerProfile, Profile } from "@/lib/db/types";
import { getOnboardingSteps } from "@/lib/onboarding/steps";
import {
  campaignCardExcerpt,
  campaignMatchesPlatform,
  cleanCampaignCardText,
  filterPublicCampaignList,
  toPublicCampaign,
} from "@/lib/public/campaigns";
import {
  dedupeCreators,
  findDealCreator,
  searchDealCreators,
  isTestOrDemoAccount,
  privateOfferChoices,
  publicCreatorChoices,
  publicCreatorName,
} from "@/lib/public/creators";
import { hydrateCampaign } from "@/lib/rewards/content-rewards";
import { onboardingCompleteSchema } from "@/lib/validations/onboarding";
import { MAX_RATE_CENTS, rateCardSchema } from "@/lib/validations/influencer";
import type { Campaign } from "@/lib/db/types";
import type { UserRole } from "@/types/enums";

function campaign(partial: Partial<Campaign> & Pick<Campaign, "id">): Campaign {
  return hydrateCampaign({
    brandId: "brand-1",
    title: "Launch",
    description: "A clean brief for creators.",
    type: "ugc",
    category: "Beauty",
    status: "active",
    budgetTotalCents: 100_000,
    budgetSpentCents: 0,
    cpmCents: 5_000,
    minPayoutCents: 0,
    minViews: 0,
    payModel: "cpm",
    countries: ["NA"],
    feeReservedCents: 12_500,
    feeChargedCents: 0,
    feeRefundedCents: 0,
    unspentReturnedCents: 0,
    poolSettledAt: null,
    closedAt: null,
    maxPayoutPerSubmissionCents: 20_000,
    platforms: ["tiktok"],
    requirements: "",
    rules: "",
    assets: [],
    startDate: null,
    endDate: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
    workspaceId: "workspace-secret",
    ...partial,
  });
}

function account(
  partial: Partial<Profile> & Pick<Profile, "id" | "email" | "displayName" | "roles" | "primaryRole">,
): Profile {
  return {
    passwordHash: "hash",
    bio: "",
    avatarUrl: null,
    notifyEmail: false,
    notifyWithdrawals: false,
    notifyBookings: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    suspended: false,
    ...partial,
  };
}

function creator(
  partial: Partial<InfluencerProfile> & Pick<InfluencerProfile, "id" | "userId" | "slug" | "displayName">,
): InfluencerProfile {
  return {
    headline: "Creator",
    bio: "Makes short videos for brands.",
    niche: "Lifestyle",
    location: "Windhoek",
    avatarUrl: null,
    socials: {},
    featuredWork: [],
    published: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...partial,
  };
}

test("campaign cards drop form-builder labels", () => {
  const raw = "Field Value:\nTypeSelection: UGC (original videos for the brand)\nPost the product in the first second.";
  const cleaned = cleanCampaignCardText(raw);
  assert.equal(cleaned.includes("Field Value"), false);
  assert.equal(cleaned.includes("TypeSelection"), false);
  assert.equal(cleaned.includes("Post the product in the first second."), true);
  assert.match(cleaned, /\bUGC\b/);
  const excerpt = campaignCardExcerpt({
    description: "Field Value: TypeSelection: UGC (original)",
    type: "ugc",
    category: "Beauty",
  });
  assert.equal(excerpt.includes("Field"), false);
  assert.equal(excerpt.includes("TypeSelection"), false);
});

test("platform filter keeps only the selected network", () => {
  const rows = [
    campaign({ id: "tt", platforms: ["tiktok"], title: "Tok" }),
    campaign({ id: "ig", platforms: ["instagram"], title: "Reel" }),
    campaign({ id: "both", platforms: ["TikTok" as never, "instagram"], title: "Both" }),
  ];
  const tiktok = filterPublicCampaignList(rows, { platform: "tiktok" }).map((row) => row.id);
  assert.deepEqual(tiktok.sort(), ["both", "tt"]);
  assert.equal(campaignMatchesPlatform(["instagram"], "tiktok"), false);
  assert.equal(campaignMatchesPlatform(undefined, "tiktok"), false);
  assert.equal(campaignMatchesPlatform(["youtube"], ""), true);
  const drafts = filterPublicCampaignList([campaign({ id: "draft", status: "draft" })], { platform: "tiktok" });
  assert.equal(drafts.length, 0);
});

test("public campaign view hides brand, fees, and drafts", () => {
  const hidden = toPublicCampaign(campaign({ id: "draft", status: "draft" }));
  assert.equal(hidden, null);
  const view = toPublicCampaign(campaign({ id: "live", status: "paused" }));
  assert.ok(view);
  assert.equal(view?.status, "paused");
  assert.equal("brandId" in view!, false);
  assert.equal("feeReservedCents" in view!, false);
  assert.equal("workspaceId" in view!, false);
  assert.equal(view?.title, "Launch");
});

test("public creator list hides test accounts, dedupes, and drops legal surnames", () => {
  const joel = account({
    id: "joel",
    email: "joel@example.na",
    displayName: "Joel Tiago",
    firstName: "Joel",
    lastName: "Tiago",
    roles: ["influencer"],
    primaryRole: "influencer",
  });
  const joelAgain = account({
    id: "joel-2",
    email: "joel2@example.na",
    displayName: "Joel Tiago",
    firstName: "Joel",
    lastName: "Tiago",
    roles: ["influencer"],
    primaryRole: "influencer",
  });
  const stage = account({
    id: "stage",
    email: "stage@example.na",
    displayName: "Desert Frames",
    firstName: "Amina",
    lastName: "Shilongo",
    roles: ["influencer"],
    primaryRole: "influencer",
  });
  const qa = account({
    id: "qa",
    email: "rappiqa+fwetalive1@mail.grokbot.com",
    displayName: "QA Test Creator Account",
    roles: ["influencer"],
    primaryRole: "influencer",
  });
  const demo = account({
    id: "demo",
    email: "clipper@fweta.test",
    displayName: "Kai Clips",
    roles: ["clipper"],
    primaryRole: "clipper",
  });
  const admin = account({
    id: "admin",
    email: "ops@example.na",
    displayName: "Fweta Admin",
    roles: ["admin"],
    primaryRole: "admin",
  });
  const profiles = [
    creator({
      id: "p-joel",
      userId: "joel",
      slug: "joel-tiago",
      displayName: "Joel Tiago",
      socials: { tiktok: "https://www.tiktok.com/@joelframes" },
      updatedAt: "2026-02-01T00:00:00.000Z",
    }),
    creator({
      id: "p-joel-dup",
      userId: "joel-2",
      slug: "joel-tiago-2",
      displayName: "Joel Tiago",
      bio: "Short",
      updatedAt: "2026-03-01T00:00:00.000Z",
    }),
    creator({
      id: "p-stage",
      userId: "stage",
      slug: "desert-frames",
      displayName: "Desert Frames",
    }),
    creator({ id: "p-qa", userId: "qa", slug: "qa-test", displayName: "QA Test Creator Account" }),
    creator({ id: "p-demo", userId: "demo", slug: "kai", displayName: "Kai Clips" }),
    creator({ id: "p-admin", userId: "admin", slug: "admin", displayName: "Fweta Admin" }),
  ];
  const listed = publicCreatorChoices(profiles, [joel, joelAgain, stage, qa, demo, admin]);
  assert.deepEqual(
    listed.map((row) => row.slug).sort(),
    ["desert-frames", "joel-tiago"],
  );
  const shownJoel = listed.find((row) => row.slug === "joel-tiago");
  assert.equal(shownJoel?.displayName, "@joelframes");
  assert.equal(listed.find((row) => row.slug === "desert-frames")?.displayName, "Desert Frames");
  assert.equal(isTestOrDemoAccount({ email: "brand@fweta.test", displayName: "Desert Brands" }), true);
  assert.equal(publicCreatorName({ displayName: "Joel Tiago" }, joel), "Joel");
});

test("private offers skip clippers, admins, and demo accounts", () => {
  const influencer = account({
    id: "inf",
    email: "amina@example.na",
    displayName: "Amina",
    roles: ["influencer", "clipper"],
    primaryRole: "influencer",
  });
  const clipper = account({
    id: "clip",
    email: "kai@example.na",
    displayName: "Kai",
    roles: ["clipper"],
    primaryRole: "clipper",
  });
  const admin = account({
    id: "admin",
    email: "ops@example.na",
    displayName: "Ops",
    roles: ["admin", "influencer"],
    primaryRole: "admin",
  });
  const demo = account({
    id: "demo",
    email: "test.creator@fweta.test",
    displayName: "TEST Creator",
    roles: ["influencer"],
    primaryRole: "influencer",
  });
  const choices = privateOfferChoices(
    [
      creator({ id: "1", userId: "inf", slug: "amina", displayName: "Amina" }),
      creator({ id: "2", userId: "clip", slug: "kai", displayName: "Kai" }),
      creator({ id: "3", userId: "admin", slug: "ops", displayName: "Ops" }),
      creator({ id: "4", userId: "demo", slug: "test", displayName: "TEST Creator" }),
    ],
    [influencer, clipper, admin, demo],
  );
  assert.deepEqual(choices.map((row) => row.slug), ["amina"]);
});

test("duplicate display names collapse to the fuller profile", () => {
  const rows = dedupeCreators([
    creator({ id: "a", userId: "1", slug: "one", displayName: "Same Name", bio: "Short" }),
    creator({
      id: "b",
      userId: "1",
      slug: "one-b",
      displayName: "Same Name",
      bio: "A longer bio with more detail for brands.",
      socials: { instagram: "@same" },
      updatedAt: "2026-04-01T00:00:00.000Z",
    }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.id, "b");
});

test("rate prices cap at N$1,000,000", () => {
  const base = {
    title: "Reel bundle",
    description: "One reel",
    type: "per_reel" as const,
    platform: "instagram" as const,
    priceCents: MAX_RATE_CENTS,
  };
  assert.equal(rateCardSchema.safeParse(base).success, true);
  const huge = rateCardSchema.safeParse({ ...base, priceCents: MAX_RATE_CENTS + 1 });
  assert.equal(huge.success, false);
  if (!huge.success) assert.match(huge.error.issues[0]?.message ?? "", /1,000,000/);
});

test("onboarding phone and socials can be skipped", () => {
  for (const role of ["clipper", "influencer", "brand"] as UserRole[]) {
    const phone = getOnboardingSteps([role]).find((step) => step.id === "phone");
    assert.equal(phone?.optional, true);
    const socials = getOnboardingSteps([role]).filter((step) => step.id.startsWith("social"));
    assert.ok(socials.length > 0);
    assert.equal(socials.every((step) => step.optional), true);
  }
  const parsed = onboardingCompleteSchema.safeParse({
    firstName: "Amina",
    lastName: "Shilongo",
    phone: "",
    socials: { tiktok: "", instagram: "", facebook: "", youtube: "", x: "" },
  });
  assert.equal(parsed.success, true);
  const badPhone = onboardingCompleteSchema.safeParse({
    firstName: "Amina",
    lastName: "Shilongo",
    phone: "12",
    socials: {},
  });
  assert.equal(badPhone.success, false);
});

test("private offer actions filter creators and never return user ids", () => {
  const accounts = [
    account({ id: "inf", email: "amina@example.na", displayName: "Amina", roles: ["influencer"], primaryRole: "influencer" }),
    account({ id: "clip", email: "kai@example.na", displayName: "Kai", roles: ["clipper"], primaryRole: "clipper" }),
    account({ id: "admin", email: "ops@example.na", displayName: "Ops", roles: ["admin", "influencer"], primaryRole: "admin" }),
    account({ id: "demo", email: "qa@example.com", displayName: "Demo", roles: ["influencer"], primaryRole: "influencer" }),
    account({ id: "brand", email: "b@example.na", displayName: "Brand", roles: ["brand", "influencer"], primaryRole: "brand" }),
  ];
  const profiles = [
    creator({ id: "1", userId: "inf", slug: "amina", displayName: "Amina" }),
    creator({ id: "2", userId: "clip", slug: "kai", displayName: "Kai" }),
    creator({ id: "3", userId: "admin", slug: "ops", displayName: "Ops" }),
    creator({ id: "4", userId: "demo", slug: "demo", displayName: "Demo" }),
    creator({ id: "5", userId: "brand", slug: "brand", displayName: "Brand" }),
  ];
  const found = searchDealCreators(profiles, accounts, "brand");
  assert.deepEqual(found.map((row) => row.id), ["1"]);
  assert.equal(found.some((row) => "userId" in row), false);
  assert.deepEqual(searchDealCreators(profiles, accounts, "brand", "nobody"), []);
  assert.equal(findDealCreator(profiles, accounts, "brand", "1")?.id, "1");
  assert.equal(findDealCreator(profiles, accounts, "brand", "2"), null);
  assert.equal(findDealCreator(profiles, accounts, "brand", "3"), null);
  assert.equal(findDealCreator(profiles, accounts, "brand", "5"), null);
  assert.equal(findDealCreator(profiles, accounts, "brand", ""), null);
  assert.equal("userId" in (findDealCreator(profiles, accounts, "brand", "1") ?? {}), false);
});

test("private offer actions require a brand or admin session and use the filter", () => {
  const src = readFileSync(new URL("../../app/actions/bookings.ts", import.meta.url), "utf8");
  for (const name of ["searchInfluencersForDeal", "getInfluencerForDeal"]) {
    const start = src.indexOf(`export async function ${name}`);
    const body = src.slice(start, src.indexOf("\n}\n", start));
    assert.match(body, /requireSession\(\)/);
    assert.match(body, /roles\.includes\("brand"\)/);
    assert.match(body, /(searchDealCreators|findDealCreator)\(/);
    assert.equal(body.includes("store.influencerProfiles.find"), false);
  }
});
