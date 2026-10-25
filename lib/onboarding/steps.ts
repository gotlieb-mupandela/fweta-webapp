import type { UserRole } from "@/types/enums";

export type OnboardingField =
  | "firstName"
  | "lastName"
  | "phone"
  | "socialTiktok"
  | "socialInstagram"
  | "socialFacebook"
  | "socialYoutube"
  | "socialX"
  | "companyName"
  | "website"
  | "niche"
  | "location"
  | "primaryPlatform";

export type OnboardingStep = {
  id: OnboardingField;
  title: string;
  subtitle: string;
  xp: number;
  optional?: boolean;
  placeholder?: string;
  inputType?: "text" | "tel" | "url";
};

function socialSubtitle(platform: string, requireSocial: boolean): string {
  if (requireSocial) {
    return `Handle or profile link. Skip this one if you do not use ${platform}. At least one social profile is required to finish.`;
  }
  return `Handle or profile link. Skip if you don't use ${platform}.`;
}

function coreSteps(requireSocial: boolean): OnboardingStep[] {
  return [
    {
      id: "firstName",
      title: "What's your first name?",
      subtitle: "We'll use this across your fweta profile.",
      xp: 10,
      placeholder: "Amara",
    },
    {
      id: "lastName",
      title: "And your surname?",
      subtitle: "Almost there. This stays on your account.",
      xp: 10,
      placeholder: "Nangolo",
    },
    {
      id: "phone",
      title: "What's your phone number?",
      subtitle: "For payouts and account recovery. Namibia +264 works great.",
      xp: 15,
      placeholder: "+264 81 000 0000",
      inputType: "tel",
    },
    {
      id: "socialTiktok",
      title: "What's your TikTok?",
      subtitle: socialSubtitle("TikTok", requireSocial),
      xp: 10,
      optional: true,
      placeholder: "@yourhandle",
    },
    {
      id: "socialInstagram",
      title: "What's your Instagram?",
      subtitle: socialSubtitle("Instagram", requireSocial),
      xp: 10,
      optional: true,
      placeholder: "@yourhandle",
    },
    {
      id: "socialFacebook",
      title: "What's your Facebook?",
      subtitle: socialSubtitle("Facebook", requireSocial),
      xp: 10,
      optional: true,
      placeholder: "your.page",
    },
    {
      id: "socialYoutube",
      title: "What's your YouTube?",
      subtitle: socialSubtitle("YouTube", requireSocial),
      xp: 10,
      optional: true,
      placeholder: "@yourchannel",
    },
    {
      id: "socialX",
      title: "What's your X?",
      subtitle: socialSubtitle("X", requireSocial),
      xp: 10,
      optional: true,
      placeholder: "@yourhandle",
    },
  ];
}

const BRAND: OnboardingStep[] = [
  {
    id: "companyName",
    title: "What's your business called?",
    subtitle: "This shows on campaigns and bookings.",
    xp: 20,
    placeholder: "Desert Brands",
  },
  {
    id: "website",
    title: "Got a website?",
    subtitle: "Optional. Skip if you don't have one yet.",
    xp: 10,
    optional: true,
    placeholder: "https://yourbrand.com",
  },
];

const CREATOR: OnboardingStep[] = [
  {
    id: "niche",
    title: "What's your niche?",
    subtitle: "Lifestyle, comedy, football, beauty… help brands find you.",
    xp: 20,
    placeholder: "Lifestyle & short-form",
  },
];

const INFLUENCER: OnboardingStep[] = [
  {
    id: "location",
    title: "Where are you based?",
    subtitle: "City or country. Helps brands book locally.",
    xp: 15,
    placeholder: "Windhoek, Namibia",
  },
];

const CLIPPER: OnboardingStep[] = [
  {
    id: "primaryPlatform",
    title: "Where do you post clips most?",
    subtitle: "We'll tailor campaign tips to this platform.",
    xp: 15,
  },
];

export function getOnboardingSteps(roles: UserRole[]): OnboardingStep[] {
  const isBrand = roles.includes("brand");
  const isInfluencer = roles.includes("influencer");
  const isClipper = roles.includes("clipper");
  const requireSocial = (isInfluencer || isClipper) && !isBrand;
  const steps = [...coreSteps(requireSocial)];

  if (isBrand) steps.push(...BRAND);
  if (isInfluencer || isClipper) steps.push(...CREATOR);
  if (isInfluencer) steps.push(...INFLUENCER);
  if (isClipper && !isInfluencer) steps.push(...CLIPPER);

  return steps;
}

export function totalOnboardingXp(roles: UserRole[]): number {
  return getOnboardingSteps(roles).reduce((sum, s) => sum + s.xp, 0);
}

export function needsOnboarding(profile: {
  onboardingCompletedAt?: string | null;
  roles: UserRole[];
}): boolean {
  if (profile.roles.includes("admin") && profile.roles.length === 1) return false;
  // Explicit null = new signup. Missing field = legacy account.
  return profile.onboardingCompletedAt === null;
}
