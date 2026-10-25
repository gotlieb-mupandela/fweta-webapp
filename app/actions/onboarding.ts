"use server";

import { revalidatePath } from "next/cache";

import {
  getProfileById,
  refreshSessionFromProfile,
  requireSession,
} from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/onboarding/steps";
import { encryptSecret, nowIso, readStore, updateStore } from "@/lib/db/store";
import type { ProfileSocials } from "@/lib/db/types";
import { clientErrorFromUnknown } from "@/lib/onboarding/errors";
import {
  applyDismissChecklist,
  applyOnboardingCampaign,
  applyOnboardingExit,
  applyOnboardingPayout,
  applyOnboardingStep,
  applyProductTourSeen,
  applySocialHandle,
  applySocialVerification,
} from "@/lib/onboarding/step-write";
import { applyWizardCompletion } from "@/lib/onboarding/wizard-complete";
import { onboardingCompleteSchema } from "@/lib/validations/onboarding";
import { profileUrl } from "@/lib/social/platforms";
import type { SocialPlatform } from "@/types/enums";

import type { OnboardingDraft } from "@/lib/db/types";
import {
  bioCodeFor,
  bootstrapDraft,
  nadToCents,
  publicProfileUrl,
  sanitizeHandle,
  verdictFromProfileBody,
} from "@/lib/onboarding/model";
import { readPublicProfileHtml } from "@/lib/onboarding/profile-html";
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
  const socials = socialsFromAnswers(data.socials);
  const now = nowIso();

  try {
    await updateStore((store) => {
      applyWizardCompletion(
        store,
        session.id,
        {
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          socials,
          companyName: data.companyName,
          website: data.website,
          niche: data.niche,
          location: data.location,
          primaryPlatform: data.primaryPlatform,
        },
        now,
      );
    });
  } catch (err) {
    return { ok: false as const, error: clientErrorFromUnknown(err) };
  }

  await settleOnboardingWrite(session.id);
  return { ok: true as const };
}

type Saved = {
  ok: true;
  draft: OnboardingDraft;
  done: boolean;
  nextStepId: OnboardingDraft["stepId"];
};

type Failed = { ok: false; error: string; draft?: OnboardingDraft };

/** Closure writes are invisible to narrowing, so read the draft back through a return type. */
function asSavedDraft(draft: OnboardingDraft | null): OnboardingDraft | null {
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

/** Session refresh and cache bumps must not turn a saved write into a thrown error. */
async function settleOnboardingWrite(userId: string, extra?: () => void) {
  try {
    await syncSession(userId);
  } catch (err) {
    console.error("[fweta] onboarding session sync failed", err);
  }
  try {
    revalidateOnboarding();
    extra?.();
  } catch (err) {
    console.error("[fweta] onboarding revalidate failed", err);
  }
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
      const result = applyOnboardingStep(store, session.id, data, nowIso());
      failed = result.failed;
      savedDraft = result.draft;
      done = result.done;
    });
  } catch (err) {
    return { ok: false, error: clientErrorFromUnknown(err) };
  }

  await settleOnboardingWrite(session.id);
  const draft = asSavedDraft(savedDraft);
  if (!draft) return { ok: false, error: "Could not save this step." };
  if (failed) return { ok: false, error: failed, draft };
  return { ok: true, draft, done, nextStepId: draft.stepId };
}

export async function exitOnboardingAction(): Promise<{ ok: true } | Failed> {
  const session = await requireSession();
  try {
    await updateStore((store) => {
      applyOnboardingExit(store, session.id, nowIso());
    });
  } catch (err) {
    return { ok: false, error: clientErrorFromUnknown(err) };
  }
  await settleOnboardingWrite(session.id);
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
      savedDraft = applySocialHandle(store, session.id, parsed.data.platform, handle, nowIso());
    });
  } catch (err) {
    return { ok: false, error: clientErrorFromUnknown(err) };
  }

  await settleOnboardingWrite(session.id);
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
  try {
    await updateStore((next) => {
      savedDraft = applySocialVerification(next, session.id, platform, check.handle, verifiedAt);
    });
  } catch (err) {
    return { ok: false, error: clientErrorFromUnknown(err) };
  }

  await settleOnboardingWrite(session.id);
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
      const result = applyOnboardingPayout(store, session.id, parsed.data, now, encryptSecret);
      failed = result.failed;
      savedDraft = result.draft;
      done = result.done;
    });
  } catch (err) {
    return { ok: false, error: clientErrorFromUnknown(err) };
  }

  await settleOnboardingWrite(session.id, () => {
    revalidatePath("/dashboard/settings/payout");
  });
  if (failed) return { ok: false, error: failed };
  const draft = asSavedDraft(savedDraft);
  if (!draft) return { ok: false, error: "Could not save payout details." };
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

  try {
    await updateStore((store) => {
      const result = applyOnboardingCampaign(
        store,
        session.id,
        parsed.data,
        { budget, cpm, cap },
        now,
      );
      failed = result.failed;
      savedDraft = result.draft;
      done = result.done;
    });
  } catch (err) {
    return { ok: false, error: clientErrorFromUnknown(err) };
  }

  await settleOnboardingWrite(session.id, () => {
    revalidatePath("/dashboard/brand/campaigns");
  });
  if (failed) return { ok: false, error: failed };
  const draft = asSavedDraft(savedDraft);
  if (!draft) return { ok: false, error: "Could not save the campaign." };
  return { ok: true, draft, done, nextStepId: draft.stepId };
}

export async function markProductTourSeenAction(): Promise<{ ok: true } | Failed> {
  const session = await requireSession();
  try {
    await updateStore((store) => {
      applyProductTourSeen(store, session.id, nowIso());
    });
  } catch (err) {
    return { ok: false, error: clientErrorFromUnknown(err) };
  }
  try {
    revalidatePath("/dashboard");
  } catch (err) {
    console.error("[fweta] onboarding revalidate failed", err);
  }
  return { ok: true };
}

export async function dismissChecklistAction(): Promise<{ ok: true } | Failed> {
  const session = await requireSession();
  try {
    await updateStore((store) => {
      applyDismissChecklist(store, session.id, nowIso());
    });
  } catch (err) {
    return { ok: false, error: clientErrorFromUnknown(err) };
  }
  try {
    revalidatePath("/dashboard");
  } catch (err) {
    console.error("[fweta] onboarding revalidate failed", err);
  }
  return { ok: true };
}

export async function getOnboardingDraftForSession() {
  const session = await requireSession();
  const store = await readStore();
  const profile = store.profiles.find((item) => item.id === session.id);
  if (!profile) return null;
  return bootstrapDraft(profile);
}
