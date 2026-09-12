import type { UserRole } from "@/types/enums";

export type OnboardingField =
  | "firstName"
  | "lastName"
  | "phone"
  | "social"
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

const CORE: OnboardingStep[] = [
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
    subtitle: "Almost there — this stays on your account.",
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
    id: "social",
    title: "Drop your main social",
    subtitle: "Pick a platform and add your handle or profile link.",
    xp: 20,
    placeholder: "@yourhandle",
  },
];

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
    subtitle: "Optional — skip if you don't have one yet.",
    xp: 10,
    optional: true,
    placeholder: "https://yourbrand.com",
    inputType: "url",
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
    subtitle: "City or country — helps brands book locally.",
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
  const steps = [...CORE];
  const isBrand = roles.includes("brand");
  const isInfluencer = roles.includes("influencer");
  const isClipper = roles.includes("clipper");

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
