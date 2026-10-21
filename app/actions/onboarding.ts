"use server";

import { revalidatePath } from "next/cache";

import {
  getProfileById,
  refreshSessionFromProfile,
  requireSession,
} from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/onboarding/steps";
import { encryptSecret, newId, nowIso, readStore, updateStore } from "@/lib/db/store";
import type { InfluencerProfile, ProfileSocials } from "@/lib/db/types";
import { onboardingCompleteSchema } from "@/lib/validations/onboarding";
import { profileUrl } from "@/lib/social/platforms";
import { slugify } from "@/lib/utils";
import type { SocialPlatform } from "@/types/enums";

import type { Campaign, DatabaseStore, OnboardingDraft, PayoutMethod, Profile } from "@/lib/db/types";
import {
  allStepsAddressed,
  allocateSlug,
  applyProfileFields,
  bioCodeFor,
  bootstrapDraft,
  buildCampaignRequirements,
  cloneDraft,
  createDraft,
  isCreatorRole,
  markStep,
  nadToCents,
  publicProfileUrl,
  sanitizeHandle,
  socialsFromChecks,
  stepIdsFor,
  upsertSocialCheck,
  validateStepComplete,
  verdictFromProfileBody,
  CREATOR_INTERESTS,
  type StepPatch,
} from "@/lib/onboarding/model";
import { readPublicProfileHtml } from "@/lib/onboarding/profile-html";
import { ensureOwnedWorkspace } from "@/lib/onboarding/workspaces";
import {
  onboardingCampaignSchema,
  onboardingHandleSchema,
  onboardingPayoutSchema,
  onboardingStepSchema,
} from "@/lib/validations/onboarding";

const PLATFORM_ORDER: SocialPlatform[] = ["tiktok", "instagram", "facebook", "youtube", "x"];

function normalizeHandle(platform: SocialPlatform, raw: string): string {
  return profileUrl(platform, raw);
}

function socialsFromAnswers(socials: {
  tiktok?: string;
  instagram?: string;
  facebook?: string;
  youtube?: string;
  x?: string;
}): ProfileSocials {
  const out: ProfileSocials = {};
  for (const platform of PLATFORM_ORDER) {
    const raw = socials[platform]?.trim() ?? "";
    if (raw.length >= 2) {
      out[platform] = normalizeHandle(platform, raw);
    }
  }
  return out;
}

function firstFilledPlatform(socials: ProfileSocials): SocialPlatform | undefined {
  return PLATFORM_ORDER.find((p) => Boolean(socials[p]));
}

export async function getOnboardingState() {
  const session = await requireSession();
  const profile = await getProfileById(session.id);
  if (!profile) return { ok: false as const, error: "Profile not found." };
  return {
    ok: true as const,
    needsOnboarding: needsOnboarding(profile),
    roles: profile.roles,
    email: profile.email,
    firstName: profile.firstName ?? "",
    lastName: profile.lastName ?? "",
  };
}

export async function completeOnboardingAction(raw: unknown) {
  const session = await requireSession();
  const parsed = onboardingCompleteSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid onboarding details.";
    return { ok: false as const, error: msg };
  }

  const data = parsed.data;
  const displayName = `${data.firstName} ${data.lastName}`.trim();
  const socials = socialsFromAnswers(data.socials);
  const now = nowIso();

  let updatedId = session.id;

  await updateStore((s) => {
    const profile = s.profiles.find((p) => p.id === session.id);
    if (!profile) throw new Error("Profile not found.");

    profile.firstName = data.firstName;
    profile.lastName = data.lastName;
    profile.phone = data.phone.replace(/\s+/g, " ").trim();
    profile.displayName = displayName;
    profile.socials = { ...(profile.socials ?? {}), ...socials };
    const pickedPlatform = data.primaryPlatform ?? firstFilledPlatform(socials);
    if (pickedPlatform) profile.primaryPlatform = pickedPlatform;
    profile.updatedAt = now;
    profile.onboardingCompletedAt = now;

    if (profile.roles.includes("brand")) {
      const company = data.companyName?.trim();
      if (company) profile.companyName = company;
      const site = data.website?.trim();
      if (site) {
        profile.website = /^https?:\/\//i.test(site) ? site : `https://${site}`;
      }
      if (company && profile.primaryRole === "brand") {
        profile.displayName = company;
      }
    }

    if (profile.roles.includes("influencer") || profile.roles.includes("clipper")) {
      const niche = data.niche?.trim();
      if (niche) profile.niche = niche;
    }

    if (profile.roles.includes("influencer")) {
      const location = data.location?.trim() || "Namibia";
      profile.location = location;
      const niche = data.niche?.trim() || "Creator";
      profile.niche = niche;

      const existing = s.influencerProfiles.find((p) => p.userId === session.id);
      if (!existing) {
        const baseSlug = slugify(displayName);
        let slug = baseSlug || `creator-${session.id.slice(0, 6)}`;
        let i = 1;
        while (s.influencerProfiles.some((p) => p.slug === slug)) {
          slug = `${baseSlug}-${i++}`;
        }
        const influencer: InfluencerProfile = {
          id: newId(),
          userId: session.id,
          slug,
          displayName,
          headline: niche.length >= 5 ? niche : `${niche} creator`,
          bio: `${displayName} is building on fweta.`,
          niche,
          location,
          avatarUrl: null,
          socials,
          featuredWork: [],
          published: true,
          createdAt: now,
          updatedAt: now,
        };
        s.influencerProfiles.push(influencer);
      } else {
        Object.assign(existing, {
          displayName,
          niche,
          location,
          socials: { ...existing.socials, ...socials },
          updatedAt: now,
        });
      }
    }

    updatedId = profile.id;
  });

  const updatedProfile = await getProfileById(updatedId);
  if (!updatedProfile) {
    return { ok: false as const, error: "Could not save onboarding." };
  }

  await refreshSessionFromProfile(updatedProfile);
  revalidatePath("/dashboard");
  revalidatePath("/onboarding");
  revalidatePath("/influencers");
  return { ok: true as const };
}

const INTEREST_SET = new Set<string>(CREATOR_INTERESTS);

type Saved = {
  ok: true;
  draft: OnboardingDraft;
  done: boolean;
  nextStepId: OnboardingDraft["stepId"];
};

type Failed = { ok: false; error: string; draft?: OnboardingDraft };

function requireDraft(draft: OnboardingDraft | null, error: string): OnboardingDraft {
  if (!draft) throw new Error(error);
  return draft;
}

async function syncSession(userId: string) {
  const profile = await getProfileById(userId);
  if (profile) await refreshSessionFromProfile(profile);
}

function revalidateOnboarding() {
  revalidatePath("/onboarding");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/brand");
  revalidatePath("/dashboard/clipper");
  revalidatePath("/dashboard/influencer");
  revalidatePath("/dashboard/admin/onboarding");
  revalidatePath("/influencers");
  revalidatePath("/campaigns");
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

function upsertInfluencer(store: DatabaseStore, profile: Profile, draft: OnboardingDraft, now: string) {
  if (!profile.roles.includes("influencer")) return;
  const personal = `${draft.firstName} ${draft.lastName}`.trim() || profile.displayName;
  const niche = draft.interests[0] || profile.niche || "Creator";
  const location = draft.location.trim() || profile.location || "Namibia";
  const socials = socialsFromChecks(draft.checks);
  const existing = store.influencerProfiles.find((item) => item.userId === profile.id);
  if (!existing) {
    const influencer: InfluencerProfile = {
      id: newId(),
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
    };
    store.influencerProfiles.push(influencer);
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

function finalize(store: DatabaseStore, profile: Profile, now: string) {
  const draft = ensureDraft(profile, now);
  applyProfileFields(profile, draft);
  if (isCreatorRole(profile.roles)) upsertInfluencer(store, profile, draft, now);
  if (!profile.onboardingCompletedAt) profile.onboardingCompletedAt = now;
  profile.updatedAt = now;
}

async function readPublicHtml(url: string): Promise<string | null> {
  return readPublicProfileHtml(url);
}

export async function saveOnboardingStepAction(raw: unknown): Promise<Saved | Failed> {
  const session = await requireSession();
  const parsed = onboardingStepSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check this step and try again." };
  }

  const data = parsed.data;
  let failed: string | null = null;
  let savedDraft: OnboardingDraft | null = null;
  let done = false;

  try {
    await updateStore((store) => {
      const profile = store.profiles.find((item) => item.id === session.id);
      if (!profile) throw new Error("Profile not found.");
      const now = nowIso();
      const stepIds = stepIdsFor(profile.roles, profile.primaryRole);
      const draft = ensureDraft(profile, now);
      if (!stepIds.includes(data.stepId)) {
        failed = "That step is not part of your setup.";
        savedDraft = cloneDraft(draft);
        return;
      }

      applyPatch(draft, profile.id, data);
      if (data.mode === "complete" && data.stepId === "deposit") draft.depositSeen = true;
      const hasPayout = store.payoutMethods.some((method) => method.userId === profile.id);
      if (data.mode === "complete") {
        const error = validateStepComplete(data.stepId, draft, { hasPayout });
        if (error) {
          failed = error;
          draft.updatedAt = now;
          profile.onboarding = draft;
          profile.updatedAt = now;
          savedDraft = cloneDraft(draft);
          return;
        }
      }

      const marked = markStep(stepIds, draft, data.stepId, data.mode, now);
      profile.onboarding = marked;
      applyProfileFields(profile, marked);
      done = allStepsAddressed(stepIds, marked);
      if (done) finalize(store, profile, now);
      else profile.updatedAt = now;
      savedDraft = cloneDraft(profile.onboarding ?? marked);
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save this step." };
  }

  await syncSession(session.id);
  revalidateOnboarding();
  const draft = requireDraft(savedDraft, "Could not save this step.");
  if (failed) return { ok: false, error: failed, draft };
  return { ok: true, draft, done, nextStepId: draft.stepId };
}

export async function exitOnboardingAction(): Promise<{ ok: true } | Failed> {
  const session = await requireSession();
  try {
    await updateStore((store) => {
      const profile = store.profiles.find((item) => item.id === session.id);
      if (!profile) throw new Error("Profile not found.");
      finalize(store, profile, nowIso());
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not leave setup." };
  }
  await syncSession(session.id);
  revalidateOnboarding();
  return { ok: true };
}

export async function setSocialHandleAction(raw: unknown): Promise<
  | { ok: true; draft: OnboardingDraft; code: string; profileUrl: string }
  | Failed
> {
  const session = await requireSession();
  const parsed = onboardingHandleSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Enter a handle or profile link." };
  }
  const handle = sanitizeHandle(parsed.data.handle);
  const profileUrl = handle ? publicProfileUrl(parsed.data.platform, handle) : null;
  if (!handle || !profileUrl) {
    return { ok: false, error: "Use a public handle with letters, numbers, dots, or underscores." };
  }

  let savedDraft: OnboardingDraft | null = null;
  try {
    await updateStore((store) => {
      const profile = store.profiles.find((item) => item.id === session.id);
      if (!profile) throw new Error("Profile not found.");
      const now = nowIso();
      const draft = ensureDraft(profile, now);
      draft.checks = upsertSocialCheck(draft.checks, profile.id, parsed.data.platform, handle);
      draft.socials = socialsFromChecks(draft.checks);
      draft.updatedAt = now;
      profile.onboarding = draft;
      profile.socials = { ...(profile.socials ?? {}), ...draft.socials };
      profile.updatedAt = now;
      savedDraft = cloneDraft(draft);
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save that handle." };
  }

  await syncSession(session.id);
  revalidateOnboarding();
  if (!savedDraft) return { ok: false, error: "Could not save that handle." };
  return {
    ok: true,
    draft: savedDraft,
    code: bioCodeFor(session.id, parsed.data.platform),
    profileUrl,
  };
}

export async function verifySocialAction(
  platform: SocialPlatform,
): Promise<{ ok: true; draft: OnboardingDraft } | Failed> {
  const session = await requireSession();
  const store = await readStore();
  const profile = store.profiles.find((item) => item.id === session.id);
  const check = profile?.onboarding?.checks.find((item) => item.platform === platform);
  if (!profile || !check) {
    return { ok: false, error: "Save the handle first so we can issue a code." };
  }
  const url = publicProfileUrl(platform, check.handle);
  if (!url) return { ok: false, error: "That handle does not look right." };

  const html = await readPublicHtml(url);
  const verdict = verdictFromProfileBody(html, check.code);
  if (verdict === "unread") {
    return { ok: false, error: "We could not open that profile just now. Try again in a moment." };
  }
  if (verdict === "missing") {
    return {
      ok: false,
      error: "The code is not in the public bio yet. Add it, wait a few seconds, and check again.",
    };
  }

  let savedDraft: OnboardingDraft | null = null;
  const verifiedAt = nowIso();
  await updateStore((next) => {
    const current = next.profiles.find((item) => item.id === session.id);
    if (!current?.onboarding) return;
    const row = current.onboarding.checks.find((item) => item.platform === platform);
    if (!row || row.handle !== check.handle) return;
    row.status = "verified";
    row.verifiedAt = verifiedAt;
    current.onboarding.socials = socialsFromChecks(current.onboarding.checks);
    current.onboarding.updatedAt = verifiedAt;
    current.socials = { ...(current.socials ?? {}), ...current.onboarding.socials };
    current.updatedAt = verifiedAt;
    savedDraft = cloneDraft(current.onboarding);
  });

  await syncSession(session.id);
  revalidateOnboarding();
  if (!savedDraft) return { ok: false, error: "Could not save verification." };
  return { ok: true, draft: savedDraft };
}

export async function saveOnboardingPayoutAction(raw: unknown): Promise<Saved | Failed> {
  const session = await requireSession();
  const parsed = onboardingPayoutSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the bank details." };
  }

  let failed: string | null = null;
  let savedDraft: OnboardingDraft | null = null;
  let done = false;
  const now = nowIso();

  try {
    await updateStore((store) => {
      const profile = store.profiles.find((item) => item.id === session.id);
      if (!profile) throw new Error("Profile not found.");
      if (!isCreatorRole(profile.roles) && !profile.roles.includes("admin")) {
        failed = "Payout details are for creator accounts.";
        return;
      }

      const enc = encryptSecret(parsed.data.accountNumber);
      const existing = store.payoutMethods.find((method) => method.userId === profile.id);
      if (existing) {
        existing.bankName = parsed.data.bankName;
        existing.branchCode = parsed.data.branchCode;
        existing.accountNumberEnc = enc;
        existing.accountHolderName = parsed.data.accountHolderName;
        existing.accountType = parsed.data.accountType;
        existing.updatedAt = now;
      } else {
        const method: PayoutMethod = {
          id: newId(),
          userId: profile.id,
          bankName: parsed.data.bankName,
          branchCode: parsed.data.branchCode,
          accountNumberEnc: enc,
          accountHolderName: parsed.data.accountHolderName,
          accountType: parsed.data.accountType,
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
      done = allStepsAddressed(stepIds, marked);
      if (done) finalize(store, profile, now);
      savedDraft = cloneDraft(profile.onboarding ?? marked);
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save payout details." };
  }

  await syncSession(session.id);
  revalidateOnboarding();
  revalidatePath("/dashboard/settings/payout");
  if (failed) return { ok: false, error: failed };
  const draft = requireDraft(savedDraft, "Could not save payout details.");
  return { ok: true, draft, done, nextStepId: draft.stepId };
}

export async function saveOnboardingCampaignAction(raw: unknown): Promise<Saved | Failed> {
  const session = await requireSession();
  const parsed = onboardingCampaignSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the campaign details." };
  }

  const budget = nadToCents(parsed.data.budgetNad);
  const cpm = nadToCents(parsed.data.cpmNad);
  const cap = nadToCents(parsed.data.maxPayoutNad);
  if (!budget || !cpm || !cap) return { ok: false, error: "Enter amounts greater than zero." };
  if (cap > budget) return { ok: false, error: "Per-clip cap cannot exceed the campaign budget." };

  let failed: string | null = null;
  let savedDraft: OnboardingDraft | null = null;
  let done = false;
  const now = nowIso();
  const requirements = buildCampaignRequirements({
    rules: parsed.data.rules,
    minViews: parsed.data.minViews,
  });

  try {
    await updateStore((store) => {
      const profile = store.profiles.find((item) => item.id === session.id);
      if (!profile) throw new Error("Profile not found.");
      if (!profile.roles.includes("brand") && !profile.roles.includes("admin")) {
        failed = "A business account is required to create a campaign.";
        return;
      }

      const draft = ensureDraft(profile, now);
      const existing = draft.campaignId
        ? store.campaigns.find((campaign) => campaign.id === draft.campaignId && campaign.brandId === profile.id)
        : undefined;

      if (existing && existing.status !== "draft") {
        draft.campaignId = existing.id;
        draft.minViews = parsed.data.minViews;
      } else {
        const nextCampaign: Campaign = {
          id: existing?.id ?? newId(),
          brandId: profile.id,
          title: parsed.data.title.trim(),
          description: parsed.data.brief.trim(),
          type: parsed.data.type,
          category: parsed.data.category.trim(),
          status: "draft",
          budgetTotalCents: budget,
          budgetSpentCents: existing?.budgetSpentCents ?? 0,
          cpmCents: cpm,
          minPayoutCents: existing?.minPayoutCents ?? 0,
          minViews: parsed.data.minViews,
          payModel: existing?.payModel ?? "cpm",
          countries: existing?.countries?.length ? existing.countries : ["NA"],
          feeReservedCents: existing?.feeReservedCents ?? 0,
          feeChargedCents: existing?.feeChargedCents ?? 0,
          feeRefundedCents: existing?.feeRefundedCents ?? 0,
          unspentReturnedCents: existing?.unspentReturnedCents ?? 0,
          poolSettledAt: existing?.poolSettledAt ?? null,
          closedAt: existing?.closedAt ?? null,
          maxPayoutPerSubmissionCents: cap,
          platforms: parsed.data.platforms,
          requirements,
          rules: existing?.rules ?? "",
          assets: existing?.assets ?? [],
          startDate: existing?.startDate ?? null,
          endDate: existing?.endDate ?? null,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        const workspaceId = ensureOwnedWorkspace(store, profile, now, newId);
        if (workspaceId) nextCampaign.workspaceId = existing?.workspaceId ?? workspaceId;
        if (existing) Object.assign(existing, nextCampaign);
        else store.campaigns.push(nextCampaign);
        draft.campaignId = nextCampaign.id;
        draft.minViews = parsed.data.minViews;
      }

      const stepIds = stepIdsFor(profile.roles, profile.primaryRole);
      const marked = markStep(stepIds, draft, "campaign", "complete", now);
      profile.onboarding = marked;
      applyProfileFields(profile, marked);
      done = allStepsAddressed(stepIds, marked);
      if (done) finalize(store, profile, now);
      savedDraft = cloneDraft(profile.onboarding ?? marked);
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the campaign." };
  }

  await syncSession(session.id);
  revalidateOnboarding();
  revalidatePath("/dashboard/brand/campaigns");
  if (failed) return { ok: false, error: failed };
  const draft = requireDraft(savedDraft, "Could not save the campaign.");
  return { ok: true, draft, done, nextStepId: draft.stepId };
}

export async function markProductTourSeenAction(): Promise<{ ok: true } | Failed> {
  const session = await requireSession();
  try {
    await updateStore((store) => {
      const profile = store.profiles.find((item) => item.id === session.id);
      if (!profile) return;
      const now = nowIso();
      const draft = ensureDraft(profile, now);
      draft.productTourSeen = true;
      draft.updatedAt = now;
      profile.onboarding = draft;
      profile.updatedAt = now;
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the tour." };
  }
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function dismissChecklistAction(): Promise<{ ok: true } | Failed> {
  const session = await requireSession();
  try {
    await updateStore((store) => {
      const profile = store.profiles.find((item) => item.id === session.id);
      if (!profile?.onboarding) return;
      profile.onboarding.checklistDismissed = true;
      profile.onboarding.updatedAt = nowIso();
      profile.updatedAt = profile.onboarding.updatedAt;
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not hide the checklist." };
  }
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function getOnboardingDraftForSession() {
  const session = await requireSession();
  const store = await readStore();
  const profile = store.profiles.find((item) => item.id === session.id);
  if (!profile) return null;
  return bootstrapDraft(profile);
}
