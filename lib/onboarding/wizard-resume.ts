import type { OnboardingDraft, Profile, ProfileSocials } from "@/lib/db/types";
import type { OnboardingField } from "@/lib/onboarding/steps";
import type { SocialPlatform } from "@/types/enums";

type WizardAnswers = {
  firstName: string;
  lastName: string;
  phone: string;
  socialTiktok: string;
  socialInstagram: string;
  socialFacebook: string;
  socialYoutube: string;
  socialX: string;
  companyName: string;
  website: string;
  niche: string;
  location: string;
  primaryPlatform: SocialPlatform;
};

/**
 * Map a saved server draft step onto the mission list the wizard shows.
 * `last` means the draft is past the questions this wizard asks.
 */
function wizardFieldForDraftStep(stepId: string): OnboardingField | "last" {
  switch (stepId) {
    case "name":
      return "firstName";
    case "interests":
      return "niche";
    case "socials":
      return "socialTiktok";
    case "company":
      return "companyName";
    case "promote":
    case "campaign":
    case "deposit":
      return "website";
    case "payout":
    case "tour":
    case "discover":
      return "last";
    default:
      return "last";
  }
}

export function resumeWizardIndex(
  steps: readonly { id: string }[],
  draft: Pick<OnboardingDraft, "version" | "stepId"> | null | undefined,
): number {
  if (!steps.length) return 0;
  if (!draft || draft.version !== 1 || !draft.stepId) return 0;
  const target = wizardFieldForDraftStep(draft.stepId);
  if (target === "last") return steps.length - 1;
  const index = steps.findIndex((step) => step.id === target);
  if (index >= 0) return index;
  return steps.length - 1;
}

function socialValue(
  platform: SocialPlatform,
  draft: OnboardingDraft | undefined,
  profileSocials: ProfileSocials | undefined,
): string {
  const check = draft?.checks.find((item) => item.platform === platform);
  if (check?.handle) return check.handle;
  return draft?.socials[platform] || profileSocials?.[platform] || "";
}

export function answersFromOnboarding(
  profile: Pick<
    Profile,
    | "firstName"
    | "lastName"
    | "phone"
    | "companyName"
    | "website"
    | "niche"
    | "location"
    | "primaryPlatform"
    | "socials"
    | "onboarding"
  >,
): WizardAnswers {
  const draft = profile.onboarding?.version === 1 ? profile.onboarding : undefined;
  const primary = profile.primaryPlatform ?? "tiktok";
  return {
    firstName: draft?.firstName || profile.firstName || "",
    lastName: draft?.lastName || profile.lastName || "",
    phone: draft?.phone || profile.phone || "",
    socialTiktok: socialValue("tiktok", draft, profile.socials),
    socialInstagram: socialValue("instagram", draft, profile.socials),
    socialFacebook: socialValue("facebook", draft, profile.socials),
    socialYoutube: socialValue("youtube", draft, profile.socials),
    socialX: socialValue("x", draft, profile.socials),
    companyName: draft?.companyName || profile.companyName || "",
    website: draft?.website || profile.website || "",
    niche: draft?.interests[0] || profile.niche || "",
    location: draft?.location || profile.location || "",
    primaryPlatform: primary,
  };
}

export type { WizardAnswers };
