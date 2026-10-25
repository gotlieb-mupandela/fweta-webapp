import { randomUUID } from "crypto";

import type {
  Campaign,
  DatabaseStore,
  OnboardingDraft,
  PayoutMethod,
  Profile,
  ProfileSocials,
} from "@/lib/db/types";
import {
  allStepsAddressed,
  allocateSlug,
  applyProfileFields,
  cloneDraft,
  createDraft,
  CREATOR_INTERESTS,
  isCreatorRole,
  markStep,
  publicProfileUrl,
  sanitizeHandle,
  socialsFromChecks,
  stepIdsFor,
  upsertSocialCheck,
  validateStepComplete,
  buildCampaignRequirements,
  type StepPatch,
} from "@/lib/onboarding/model";
import { ensureOwnedWorkspace } from "@/lib/onboarding/workspaces";
import type { OnboardingCampaignPayload, OnboardingPayoutPayload, OnboardingStepPayload } from "@/lib/validations/onboarding";
import type { SocialPlatform } from "@/types/enums";

/**
 * Re-applying one onboarding step with the same answers updates the rows that
 * step already owns. A timed-out save can still commit, so a retry must not
 * insert a second profile, payout method, campaign, workspace, or creator.
 */
export type StepWriteResult = {
  failed: string | null;
  draft: OnboardingDraft | null;
  done: boolean;
};

const INTEREST_SET = new Set<string>(CREATOR_INTERESTS);

function freshId(): string {
  return randomUUID();
}

function ensureDraft(profile: Profile, now: string): OnboardingDraft {
  if (profile.onboarding?.version === 1) return profile.onboarding;
  const ids = stepIdsFor(profile.roles, profile.primaryRole);
  const draft = createDraft(ids[0] ?? "name", now);
  profile.onboarding = draft;
  return draft;
}

function cleanSocialInput(input: {
  tiktok?: string;
  instagram?: string;
  facebook?: string;
  youtube?: string;
  x?: string;
} | undefined): ProfileSocials {
  const next: ProfileSocials = {};
  if (!input) return next;
  (["tiktok", "instagram", "facebook", "youtube", "x"] as const).forEach((platform) => {
    const handle = sanitizeHandle(input[platform] ?? "");
    const url = handle ? publicProfileUrl(platform, handle) : null;
    if (url) next[platform] = url;
  });
  return next;
}

function applyPatch(draft: OnboardingDraft, userId: string, patch: StepPatch & { stepId: OnboardingDraft["stepId"] }) {
  if (patch.stepId === "name") {
    if (patch.firstName !== undefined) draft.firstName = patch.firstName.trim();
    if (patch.lastName !== undefined) draft.lastName = patch.lastName.trim();
    if (patch.phone !== undefined) draft.phone = patch.phone.trim();
  }
  if (patch.stepId === "interests") {
    if (patch.interests) {
      const picked: string[] = [];
      for (const interest of patch.interests) {
        const label = interest.trim();
        if (INTEREST_SET.has(label) && !picked.includes(label)) picked.push(label);
      }
      draft.interests = picked.slice(0, 5);
    }
    if (patch.location !== undefined) draft.location = patch.location.trim();
  }
  if (patch.stepId === "socials" && patch.socials) {
    (["tiktok", "instagram", "facebook", "youtube", "x"] as const).forEach((platform) => {
      const raw = patch.socials?.[platform] ?? "";
      draft.checks = upsertSocialCheck(draft.checks, userId, platform, raw);
    });
    draft.socials = socialsFromChecks(draft.checks);
  }
  if (patch.stepId === "company") {
    if (patch.companyName !== undefined) draft.companyName = patch.companyName.trim();
    if (patch.website !== undefined) draft.website = patch.website.trim();
    if (patch.brandSocials) draft.brandSocials = cleanSocialInput(patch.brandSocials);
  }
  if (patch.stepId === "promote" && patch.promote !== undefined) {
    draft.promote = patch.promote.trim();
  }
}

function upsertInfluencer(store: DatabaseStore, profile: Profile, draft: OnboardingDraft, now: string, id: () => string) {
  if (!profile.roles.includes("influencer")) return;
  const personal = `${draft.firstName} ${draft.lastName}`.trim() || profile.displayName;
  const niche = draft.interests[0] || profile.niche || "Creator";
  const location = draft.location.trim() || profile.location || "Namibia";
  const socials = socialsFromChecks(draft.checks);
  const existing = store.influencerProfiles.find((item) => item.userId === profile.id);
  if (!existing) {
    store.influencerProfiles.push({
      id: id(),
      userId: profile.id,
      slug: allocateSlug(
        store.influencerProfiles.map((item) => item.slug),
        personal,
        profile.id,
      ),
      displayName: personal,
      headline: niche.length >= 5 ? niche : `${niche} creator`,
      bio: `${personal} is building on fweta.`,
      niche,
      location,
      avatarUrl: profile.avatarUrl,
      socials,
      featuredWork: [],
      published: false,
      createdAt: now,
      updatedAt: now,
    });
    return;
  }
  existing.displayName = personal;
  existing.niche = niche;
  existing.location = location;
  existing.socials = { ...existing.socials, ...socials };
  existing.headline = niche.length >= 5 ? niche : `${niche} creator`;
  if (profile.avatarUrl) existing.avatarUrl = profile.avatarUrl;
  existing.updatedAt = now;
}

function finalize(store: DatabaseStore, profile: Profile, now: string, id: () => string) {
  const draft = ensureDraft(profile, now);
  applyProfileFields(profile, draft);
  if (isCreatorRole(profile.roles)) upsertInfluencer(store, profile, draft, now, id);
  if (!profile.onboardingCompletedAt) profile.onboardingCompletedAt = now;
  profile.updatedAt = now;
}

export function applyOnboardingStep(
  store: DatabaseStore,
  userId: string,
  data: OnboardingStepPayload,
  now: string,
  id: () => string = freshId,
): StepWriteResult {
  const profile = store.profiles.find((item) => item.id === userId);
  if (!profile) throw new Error("Profile not found.");
  const stepIds = stepIdsFor(profile.roles, profile.primaryRole);
  const draft = ensureDraft(profile, now);
  if (!stepIds.includes(data.stepId)) {
    return { failed: "That step is not part of your setup.", draft: cloneDraft(draft), done: false };
  }

  applyPatch(draft, profile.id, data);
  if (data.mode === "complete" && data.stepId === "deposit") draft.depositSeen = true;
  const hasPayout = store.payoutMethods.some((method) => method.userId === profile.id);
  if (data.mode === "complete") {
    const error = validateStepComplete(data.stepId, draft, { hasPayout });
    if (error) {
      draft.updatedAt = now;
      profile.onboarding = draft;
      profile.updatedAt = now;
      return { failed: error, draft: cloneDraft(draft), done: false };
    }
  }

  const marked = markStep(stepIds, draft, data.stepId, data.mode, now);
  profile.onboarding = marked;
  applyProfileFields(profile, marked);
  const done = allStepsAddressed(stepIds, marked);
  if (done) finalize(store, profile, now, id);
  else profile.updatedAt = now;
  return { failed: null, draft: cloneDraft(profile.onboarding ?? marked), done };
}

export function applyProductTourSeen(store: DatabaseStore, userId: string, now: string): void {
  const profile = store.profiles.find((item) => item.id === userId);
  if (!profile) return;
  const draft = ensureDraft(profile, now);
  draft.productTourSeen = true;
  draft.updatedAt = now;
  profile.onboarding = draft;
  profile.updatedAt = now;
}

export function applyDismissChecklist(store: DatabaseStore, userId: string, now: string): void {
  const profile = store.profiles.find((item) => item.id === userId);
  if (!profile?.onboarding) return;
  profile.onboarding.checklistDismissed = true;
  profile.onboarding.updatedAt = now;
  profile.updatedAt = now;
}

export function applyOnboardingExit(
  store: DatabaseStore,
  userId: string,
  now: string,
  id: () => string = freshId,
): void {
  const profile = store.profiles.find((item) => item.id === userId);
  if (!profile) throw new Error("Profile not found.");
  finalize(store, profile, now, id);
}

export function applySocialHandle(
  store: DatabaseStore,
  userId: string,
  platform: SocialPlatform,
  handle: string,
  now: string,
): OnboardingDraft | null {
  const profile = store.profiles.find((item) => item.id === userId);
  if (!profile) throw new Error("Profile not found.");
  const draft = ensureDraft(profile, now);
  draft.checks = upsertSocialCheck(draft.checks, profile.id, platform, handle);
  draft.socials = socialsFromChecks(draft.checks);
  draft.updatedAt = now;
  profile.onboarding = draft;
  profile.socials = { ...(profile.socials ?? {}), ...draft.socials };
  profile.updatedAt = now;
  return cloneDraft(draft);
}

export function applySocialVerification(
  store: DatabaseStore,
  userId: string,
  platform: SocialPlatform,
  handle: string,
  verifiedAt: string,
): OnboardingDraft | null {
  const current = store.profiles.find((item) => item.id === userId);
  if (!current?.onboarding) return null;
  const row = current.onboarding.checks.find((item) => item.platform === platform);
  if (!row || row.handle !== handle) return null;
  row.status = "verified";
  row.verifiedAt = verifiedAt;
  current.onboarding.socials = socialsFromChecks(current.onboarding.checks);
  current.onboarding.updatedAt = verifiedAt;
  current.socials = { ...(current.socials ?? {}), ...current.onboarding.socials };
  current.updatedAt = verifiedAt;
  return cloneDraft(current.onboarding);
}

export function applyOnboardingPayout(
  store: DatabaseStore,
  userId: string,
  data: OnboardingPayoutPayload,
  now: string,
  encrypt: (plain: string) => string,
  id: () => string = freshId,
): StepWriteResult {
  const profile = store.profiles.find((item) => item.id === userId);
  if (!profile) throw new Error("Profile not found.");
  if (!isCreatorRole(profile.roles) && !profile.roles.includes("admin")) {
    return { failed: "Payout details are for creator accounts.", draft: null, done: false };
  }

  const enc = encrypt(data.accountNumber);
  const existing = store.payoutMethods.find((method) => method.userId === profile.id);
  if (existing) {
    existing.bankName = data.bankName;
    existing.branchCode = data.branchCode;
    existing.accountNumberEnc = enc;
    existing.accountHolderName = data.accountHolderName;
    existing.accountType = data.accountType;
    existing.updatedAt = now;
  } else {
    const method: PayoutMethod = {
      id: id(),
      userId: profile.id,
      bankName: data.bankName,
      branchCode: data.branchCode,
      accountNumberEnc: enc,
      accountHolderName: data.accountHolderName,
      accountType: data.accountType,
      createdAt: now,
      updatedAt: now,
    };
    store.payoutMethods.push(method);
  }

  const stepIds = stepIdsFor(profile.roles, profile.primaryRole);
  const draft = ensureDraft(profile, now);
  draft.payoutSaved = true;
  const marked = markStep(stepIds, draft, "payout", "complete", now);
  profile.onboarding = marked;
  applyProfileFields(profile, marked);
  const done = allStepsAddressed(stepIds, marked);
  if (done) finalize(store, profile, now, id);
  return { failed: null, draft: cloneDraft(profile.onboarding ?? marked), done };
}

export function applyOnboardingCampaign(
  store: DatabaseStore,
  userId: string,
  data: OnboardingCampaignPayload,
  amounts: { budget: number; cpm: number; cap: number },
  now: string,
  id: () => string = freshId,
): StepWriteResult {
  const profile = store.profiles.find((item) => item.id === userId);
  if (!profile) throw new Error("Profile not found.");
  if (!profile.roles.includes("brand") && !profile.roles.includes("admin")) {
    return { failed: "A business account is required to create a campaign.", draft: null, done: false };
  }

  const requirements = buildCampaignRequirements({
    rules: data.rules,
    minViews: data.minViews,
  });
  const draft = ensureDraft(profile, now);
  const existing = draft.campaignId
    ? store.campaigns.find((campaign) => campaign.id === draft.campaignId && campaign.brandId === profile.id)
    : undefined;

  if (existing && existing.status !== "draft") {
    draft.campaignId = existing.id;
    draft.minViews = data.minViews;
  } else {
    const nextCampaign: Campaign = {
      id: existing?.id ?? id(),
      brandId: profile.id,
      title: data.title.trim(),
      description: data.brief.trim(),
      type: data.type,
      category: data.category.trim(),
      status: "draft",
      budgetTotalCents: amounts.budget,
      budgetSpentCents: existing?.budgetSpentCents ?? 0,
      cpmCents: amounts.cpm,
      minPayoutCents: existing?.minPayoutCents ?? 0,
      minViews: data.minViews,
      payModel: existing?.payModel ?? "cpm",
      countries: existing?.countries?.length ? existing.countries : ["NA"],
      feeReservedCents: existing?.feeReservedCents ?? 0,
      feeChargedCents: existing?.feeChargedCents ?? 0,
      feeRefundedCents: existing?.feeRefundedCents ?? 0,
      unspentReturnedCents: existing?.unspentReturnedCents ?? 0,
      poolSettledAt: existing?.poolSettledAt ?? null,
      closedAt: existing?.closedAt ?? null,
      maxPayoutPerSubmissionCents: amounts.cap,
      platforms: data.platforms,
      requirements,
      rules: existing?.rules ?? "",
      assets: existing?.assets ?? [],
      startDate: existing?.startDate ?? null,
      endDate: existing?.endDate ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const workspaceId = ensureOwnedWorkspace(store, profile, now, id);
    if (workspaceId) nextCampaign.workspaceId = existing?.workspaceId ?? workspaceId;
    if (existing) Object.assign(existing, nextCampaign);
    else store.campaigns.push(nextCampaign);
    draft.campaignId = nextCampaign.id;
    draft.minViews = data.minViews;
  }

  const stepIds = stepIdsFor(profile.roles, profile.primaryRole);
  const marked = markStep(stepIds, draft, "campaign", "complete", now);
  profile.onboarding = marked;
  applyProfileFields(profile, marked);
  const done = allStepsAddressed(stepIds, marked);
  if (done) finalize(store, profile, now, id);
  return { failed: null, draft: cloneDraft(profile.onboarding ?? marked), done };
}
