import type {
  OnboardingDraft,
  OnboardingSocialCheck,
  OnboardingStepId,
  Profile,
  ProfileSocials,
} from "@/lib/db/types";
import type { CampaignStatus, CampaignType, SocialPlatform, UserRole } from "@/types/enums";

export const STEP_IDS: OnboardingStepId[] = [
  "name",
  "interests",
  "socials",
  "payout",
  "company",
  "promote",
  "campaign",
  "deposit",
  "tour",
  "discover",
];

export const CREATOR_INTERESTS = [
  "Lifestyle",
  "Comedy",
  "Football",
  "Beauty",
  "Music",
  "Food",
  "Fashion",
  "Tech",
  "Education",
  "News",
  "Gaming",
  "Faith",
] as const;

export const PLATFORMS: SocialPlatform[] = ["tiktok", "instagram", "facebook", "youtube", "x"];

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  x: "X",
};

export const STEP_SHORT: Record<OnboardingStepId, string> = {
  name: "Your name",
  interests: "Topics",
  socials: "Social accounts",
  payout: "Payout details",
  company: "Company profile",
  promote: "What to promote",
  campaign: "First campaign",
  deposit: "Funding",
  tour: "Product tour",
  discover: "Live campaigns",
};

export type StepCopy = {
  id: OnboardingStepId;
  title: string;
  subtitle: string;
  nextLabel: string;
};

export const STEP_COPY: Record<OnboardingStepId, StepCopy> = {
  name: {
    id: "name",
    title: "What should we call you?",
    subtitle: "This name shows on your fweta profile and on payout records.",
    nextLabel: "Continue",
  },
  interests: {
    id: "interests",
    title: "What do you make?",
    subtitle: "Pick the topics you want brands to find you for. Up to five.",
    nextLabel: "Continue",
  },
  socials: {
    id: "socials",
    title: "Connect the accounts you post on",
    subtitle: "Add a handle, put the code in that bio, then tap I've added it. An admin confirms the code before you can use the account.",
    nextLabel: "Continue",
  },
  payout: {
    id: "payout",
    title: "Where should we pay you?",
    subtitle: "Withdrawals are sent by an admin as a manual EFT. There is no card payout.",
    nextLabel: "Save payout details",
  },
  company: {
    id: "company",
    title: "Tell us about the business",
    subtitle: "Creators see this beside your campaigns. A logo and site help the brief feel real.",
    nextLabel: "Continue",
  },
  promote: {
    id: "promote",
    title: "What do you want to promote?",
    subtitle: "A product, a launch, a show. One or two sentences is enough.",
    nextLabel: "Continue",
  },
  campaign: {
    id: "campaign",
    title: "Set up your first campaign",
    subtitle: "Choose the rate per 1,000 views, the budget, and the rules. It stays a draft until you launch it.",
    nextLabel: "Save draft campaign",
  },
  deposit: {
    id: "deposit",
    title: "How funding works",
    subtitle: "You pay in by bank transfer. An admin confirms it before the budget can go live.",
    nextLabel: "I understand",
  },
  tour: {
    id: "tour",
    title: "A quick look around",
    subtitle: "Three things worth knowing before you open the workspace.",
    nextLabel: "Continue",
  },
  discover: {
    id: "discover",
    title: "Campaigns you can join",
    subtitle: "These are live right now. Open one, post the clip, and submit the link to earn.",
    nextLabel: "Go to my workspace",
  },
};

const CREATOR_CORE: OnboardingStepId[] = ["name", "interests", "socials", "payout"];
const BRAND_CORE: OnboardingStepId[] = ["name", "company", "promote", "campaign", "deposit"];

export function isCreatorRole(roles: readonly UserRole[]): boolean {
  return roles.includes("clipper") || roles.includes("influencer");
}

export function isBrandRole(roles: readonly UserRole[]): boolean {
  return roles.includes("brand");
}

export function stepIdsFor(roles: readonly UserRole[], primaryRole: UserRole): OnboardingStepId[] {
  const creator = isCreatorRole(roles);
  const brand = isBrandRole(roles);
  const ids: OnboardingStepId[] = [];
  const push = (id: OnboardingStepId) => {
    if (!ids.includes(id)) ids.push(id);
  };

  if (primaryRole === "brand" && brand) {
    BRAND_CORE.forEach(push);
    if (creator) CREATOR_CORE.forEach(push);
  } else if (creator) {
    CREATOR_CORE.forEach(push);
    if (brand) BRAND_CORE.forEach(push);
  } else if (brand) {
    BRAND_CORE.forEach(push);
  } else {
    CREATOR_CORE.forEach(push);
  }

  push("tour");
  if (creator) push("discover");
  return ids;
}

export function needsOnboarding(profile: {
  onboardingCompletedAt?: string | null;
  roles: readonly UserRole[];
}): boolean {
  if (profile.roles.includes("admin") && profile.roles.length === 1) return false;
  return profile.onboardingCompletedAt === null;
}

export function isLegacyAccount(profile: {
  onboardingCompletedAt?: string | null;
  onboarding?: OnboardingDraft;
}): boolean {
  if (profile.onboarding?.version === 1) return false;
  return profile.onboardingCompletedAt !== null;
}

export function createDraft(stepId: OnboardingStepId, now = ""): OnboardingDraft {
  return {
    version: 1,
    stepId,
    completed: [],
    skipped: [],
    firstName: "",
    lastName: "",
    phone: "",
    interests: [],
    location: "",
    companyName: "",
    website: "",
    promote: "",
    socials: {},
    brandSocials: {},
    checks: [],
    payoutSaved: false,
    campaignId: null,
    minViews: null,
    depositSeen: false,
    productTourSeen: false,
    checklistDismissed: false,
    updatedAt: now,
  };
}

export function cloneDraft(draft: OnboardingDraft): OnboardingDraft {
  return {
    ...draft,
    completed: [...draft.completed],
    skipped: [...draft.skipped],
    interests: [...draft.interests],
    socials: { ...draft.socials },
    brandSocials: { ...draft.brandSocials },
    checks: draft.checks.map((check) => ({ ...check })),
  };
}

export function bootstrapDraft(profile: {
  roles: readonly UserRole[];
  primaryRole: UserRole;
  onboarding?: OnboardingDraft;
}): OnboardingDraft {
  const ids = stepIdsFor(profile.roles, profile.primaryRole);
  if (profile.onboarding?.version === 1) return cloneDraft(profile.onboarding);
  return createDraft(ids[0] ?? "name");
}

export function allStepsAddressed(
  stepIds: readonly OnboardingStepId[],
  draft: OnboardingDraft,
): boolean {
  return stepIds.every((id) => draft.completed.includes(id) || draft.skipped.includes(id));
}

export function resumeStepId(stepIds: readonly OnboardingStepId[], draft: OnboardingDraft): OnboardingStepId {
  const open = stepIds.find((id) => !draft.completed.includes(id) && !draft.skipped.includes(id));
  if (open) return open;
  return stepIds[stepIds.length - 1] ?? "name";
}

export function isStepId(value: string | undefined | null): value is OnboardingStepId {
  return STEP_IDS.includes(value as OnboardingStepId);
}

function uniqueSteps(ids: readonly OnboardingStepId[]): OnboardingStepId[] {
  const out: OnboardingStepId[] = [];
  for (const id of ids) {
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

export type StepPatch = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  interests?: string[];
  location?: string;
  companyName?: string;
  website?: string;
  promote?: string;
  socials?: ProfileSocials;
  brandSocials?: ProfileSocials;
};

export function normalizeWebsite(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function sanitizeHandle(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const parts = url.pathname.split("/").filter(Boolean);
      value = (parts[0] ?? "").replace(/^@/, "");
    } catch {
      return null;
    }
  }
  value = value.replace(/^@/, "").trim();
  if (!/^[A-Za-z0-9._]{2,40}$/.test(value)) return null;
  return value;
}

export function publicProfileUrl(platform: SocialPlatform, handle: string): string | null {
  const cleaned = sanitizeHandle(handle);
  if (!cleaned) return null;
  switch (platform) {
    case "tiktok":
      return `https://www.tiktok.com/@${cleaned}`;
    case "instagram":
      return `https://www.instagram.com/${cleaned}/`;
    case "youtube":
      return `https://www.youtube.com/@${cleaned}`;
    case "facebook":
      return `https://www.facebook.com/${cleaned}`;
    case "x":
      return `https://x.com/${cleaned}`;
    default:
      return null;
  }
}

export function profileUrlForStored(platform: SocialPlatform, stored: string): string {
  if (/^https?:\/\//i.test(stored)) return stored;
  return publicProfileUrl(platform, stored) ?? stored;
}

const BIO_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Stable per user and platform so a refresh does not rotate the bio code. */
export function bioCodeFor(userId: string, platform: SocialPlatform): string {
  let hash = 2166136261;
  const raw = `${userId}:${platform}:fweta-bio-v1`;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let n = hash >>> 0;
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += BIO_ALPHABET[n % BIO_ALPHABET.length];
    n = Math.floor(n / BIO_ALPHABET.length) + (i + 3) * 97;
  }
  return `FWETA-${out}`;
}

export function bioContainsCode(body: string, code: string): boolean {
  const needle = code.trim().toLowerCase();
  if (needle.length < 6) return false;
  return body.toLowerCase().includes(needle);
}

export function verdictFromProfileBody(
  body: string | null,
  code: string,
): "verified" | "missing" | "unread" {
  if (body == null) return "unread";
  return bioContainsCode(body, code) ? "verified" : "missing";
}

export function upsertSocialCheck(
  checks: readonly OnboardingSocialCheck[],
  userId: string,
  platform: SocialPlatform,
  handle: string,
): OnboardingSocialCheck[] {
  const cleaned = sanitizeHandle(handle);
  const next = checks.filter((check) => check.platform !== platform);
  if (!cleaned) return next;
  const previous = checks.find((check) => check.platform === platform);
  const same = previous?.handle.toLowerCase() === cleaned.toLowerCase();
  next.push({
    platform,
    handle: cleaned,
    code: bioCodeFor(userId, platform),
    status: same && previous?.status === "verified" ? "verified" : "pending",
    verifiedAt: same && previous?.status === "verified" ? previous.verifiedAt ?? null : null,
  });
  return PLATFORMS.flatMap((item) => {
    const found = next.find((check) => check.platform === item);
    return found ? [found] : [];
  });
}

export function socialsFromChecks(checks: readonly OnboardingSocialCheck[]): ProfileSocials {
  const socials: ProfileSocials = {};
  for (const check of checks) {
    const url = publicProfileUrl(check.platform, check.handle);
    if (url) socials[check.platform] = url;
  }
  return socials;
}

export function validateStepComplete(
  stepId: OnboardingStepId,
  draft: OnboardingDraft,
  ctx: { hasPayout: boolean },
): string | null {
  switch (stepId) {
    case "name": {
      if (draft.firstName.trim().length < 1) return "Enter your first name.";
      if (draft.lastName.trim().length < 1) return "Enter your surname.";
      if (draft.phone.trim() && !/^[+]?[\d\s()-]{8,24}$/.test(draft.phone.trim())) {
        return "Enter a valid phone number, or leave it blank.";
      }
      return null;
    }
    case "interests":
      if (draft.interests.length < 1) return "Pick at least one topic.";
      if (draft.interests.length > 5) return "Pick up to five topics.";
      return null;
    case "socials":
      if (!draft.checks.some((check) => check.status === "verified")) {
        return "Wait for an admin to confirm one account, or skip this step and come back.";
      }
      return null;
    case "payout":
      return ctx.hasPayout || draft.payoutSaved ? null : "Save your bank details to continue.";
    case "company":
      if (draft.companyName.trim().length < 2) return "Enter the business name.";
      return null;
    case "promote":
      if (draft.promote.trim().length < 10) return "Tell us a little more about what you want to promote.";
      return null;
    case "campaign":
      if (!draft.campaignId) return "Save the draft campaign to continue.";
      return null;
    case "deposit":
      return draft.depositSeen ? null : "Read the transfer steps, then confirm.";
    case "tour":
    case "discover":
      return null;
    default:
      return "Unknown step.";
  }
}

export function markStep(
  stepIds: readonly OnboardingStepId[],
  draft: OnboardingDraft,
  stepId: OnboardingStepId,
  mode: "complete" | "skip",
  now: string,
): OnboardingDraft {
  const completed =
    mode === "complete"
      ? uniqueSteps([...draft.completed.filter((id) => id !== stepId), stepId])
      : draft.completed.filter((id) => id !== stepId);
  const skipped =
    mode === "skip"
      ? uniqueSteps([...draft.skipped.filter((id) => id !== stepId), stepId])
      : draft.skipped.filter((id) => id !== stepId);
  const next: OnboardingDraft = {
    ...draft,
    completed,
    skipped,
    updatedAt: now,
    stepId,
  };
  if (stepId === "deposit" && mode === "complete") next.depositSeen = true;
  next.stepId = resumeStepId(stepIds, next);
  return next;
}

export function applyProfileFields(profile: Profile, draft: OnboardingDraft): void {
  const first = draft.firstName.trim();
  const last = draft.lastName.trim();
  if (first) profile.firstName = first;
  if (last) profile.lastName = last;
  if (draft.phone.trim()) profile.phone = draft.phone.replace(/\s+/g, " ").trim();
  if (first || last) {
    const name = `${first} ${last}`.trim();
    if (name) profile.displayName = name;
  }

  const creator = isCreatorRole(profile.roles);
  const brand = isBrandRole(profile.roles);

  if (draft.interests.length) {
    profile.niche = draft.interests[0];
  }
  if (draft.location.trim()) profile.location = draft.location.trim();

  if (brand && draft.companyName.trim()) {
    profile.companyName = draft.companyName.trim();
    if (profile.primaryRole === "brand") profile.displayName = profile.companyName;
  }
  if (draft.website.trim()) profile.website = normalizeWebsite(draft.website);

  const creatorSocials = Object.keys(draft.socials).length ? draft.socials : socialsFromChecks(draft.checks);
  const merged: ProfileSocials = {
    ...(profile.socials ?? {}),
    ...(brand ? draft.brandSocials : {}),
    ...(creator ? creatorSocials : {}),
  };
  if (Object.keys(merged).length) profile.socials = merged;

  const primary = PLATFORMS.find((platform) => Boolean(merged[platform]));
  if (primary) profile.primaryPlatform = primary;
  profile.onboarding = draft;
}

export function allocateSlug(existing: readonly string[], displayName: string, userId: string): string {
  const base = displayName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  let slug = base || `creator-${userId.replace(/-/g, "").slice(0, 6)}`;
  let i = 1;
  while (existing.includes(slug)) {
    slug = `${base || "creator"}-${i}`;
    i += 1;
  }
  return slug;
}

export function nadToCents(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const cents = Math.round(value * 100);
  if (cents <= 0) return null;
  return cents;
}

export type CampaignDraftInput = {
  title: string;
  brief: string;
  rules: string;
  type: CampaignType;
  category: string;
  budgetNad: number;
  cpmNad: number;
  maxPayoutNad: number;
  minViews: number;
  platforms: SocialPlatform[];
};

export function buildCampaignRequirements(input: Pick<CampaignDraftInput, "rules" | "minViews">): string {
  const rules = input.rules.trim();
  const floor = `Minimum views before a clip qualifies: ${input.minViews}.`;
  const capLine = "Each clip stops earning at the per-clip cap so the budget can reach more creators.";
  return [rules, floor, capLine].filter(Boolean).join("\n\n");
}

export type ChecklistStatus = "done" | "skipped" | "open";

export type ChecklistItem = {
  id: OnboardingStepId;
  title: string;
  subtitle: string;
  status: ChecklistStatus;
  href: string;
};

export function checklistItems(
  profile: {
    roles: readonly UserRole[];
    primaryRole: UserRole;
    onboarding?: OnboardingDraft;
  },
  ctx: { hasPayout: boolean },
): ChecklistItem[] {
  const ids = stepIdsFor(profile.roles, profile.primaryRole);
  const draft = profile.onboarding?.version === 1 ? profile.onboarding : createDraft(ids[0] ?? "name");
  return ids.map((id) => {
    const payoutDone = id === "payout" && (ctx.hasPayout || draft.payoutSaved);
    const done = draft.completed.includes(id) || payoutDone;
    const skipped = !done && draft.skipped.includes(id);
    const status: ChecklistStatus = done ? "done" : skipped ? "skipped" : "open";
    return {
      id,
    title: STEP_SHORT[id],
    subtitle: STEP_COPY[id].subtitle,
      status,
      href: `/onboarding?step=${id}`,
    };
  });
}

export function completionPercent(items: readonly ChecklistItem[]): number {
  if (!items.length) return 0;
  const done = items.filter((item) => item.status === "done").length;
  return Math.round((done / items.length) * 100);
}

export function isChecklistComplete(items: readonly ChecklistItem[]): boolean {
  return items.length > 0 && items.every((item) => item.status === "done");
}

export function shouldShowChecklist(profile: {
  roles: readonly UserRole[];
  primaryRole: UserRole;
  onboardingCompletedAt?: string | null;
  onboarding?: OnboardingDraft;
}, ctx: { hasPayout: boolean }): boolean {
  if (isLegacyAccount(profile)) return false;
  if (needsOnboarding(profile)) return false;
  if (profile.onboarding?.checklistDismissed) return false;
  const items = checklistItems(profile, ctx);
  return !isChecklistComplete(items);
}

export function shouldOfferProductTour(profile: {
  onboardingCompletedAt?: string | null;
  onboarding?: OnboardingDraft;
  roles: readonly UserRole[];
}): boolean {
  if (isLegacyAccount(profile)) return false;
  if (needsOnboarding(profile)) return false;
  return profile.onboarding?.productTourSeen !== true;
}

export type OnboardingGate = "legacy" | "not_started" | "in_progress" | "exited" | "complete";

export type OnboardingSummary = {
  userId: string;
  email: string;
  displayName: string;
  roles: UserRole[];
  primaryRole: UserRole;
  gate: OnboardingGate;
  label: string;
  percent: number;
  completedCount: number;
  totalCount: number;
  currentStep: string | null;
  skipped: string[];
  verifiedPlatforms: SocialPlatform[];
  completedAt: string | null;
};

export function summarizeOnboarding(
  profile: Pick<
    Profile,
    | "id"
    | "email"
    | "displayName"
    | "roles"
    | "primaryRole"
    | "onboardingCompletedAt"
    | "onboarding"
  >,
  ctx: { hasPayout: boolean },
): OnboardingSummary {
  const items = checklistItems(profile, ctx);
  const percent = completionPercent(items);
  const skipped = items.filter((item) => item.status === "skipped").map((item) => item.title);
  const open = items.find((item) => item.status === "open");
  const verifiedPlatforms = (profile.onboarding?.checks ?? [])
    .filter((check) => check.status === "verified")
    .map((check) => check.platform);

  let gate: OnboardingGate = "not_started";
  if (isLegacyAccount(profile)) gate = "legacy";
  else if (isChecklistComplete(items) && profile.onboardingCompletedAt) gate = "complete";
  else if (profile.onboardingCompletedAt) gate = "exited";
  else if (items.some((item) => item.status !== "open")) gate = "in_progress";

  const label =
    gate === "legacy"
      ? "Not required"
      : gate === "not_started"
        ? "Not started"
        : gate === "in_progress"
          ? "In progress"
          : gate === "exited"
            ? "Left early"
            : "Complete";

  return {
    userId: profile.id,
    email: profile.email,
    displayName: profile.displayName,
    roles: profile.roles,
    primaryRole: profile.primaryRole,
    gate,
    label,
    percent,
    completedCount: items.filter((item) => item.status === "done").length,
    totalCount: items.length,
    currentStep: open?.title ?? null,
    skipped,
    verifiedPlatforms,
    completedAt: profile.onboardingCompletedAt ?? null,
  };
}

export type RecommendableCampaign = {
  id: string;
  title: string;
  category: string;
  type: CampaignType;
  status: CampaignStatus;
  cpmCents: number;
  budgetRemainingCents: number;
  platforms: SocialPlatform[];
};

export function recommendCampaigns<T extends RecommendableCampaign>(
  campaigns: readonly T[],
  interests: readonly string[],
  limit = 4,
): T[] {
  const needles = interests.map((item) => item.toLowerCase()).filter(Boolean);
  return campaigns
    .filter((campaign) => campaign.status === "active" && campaign.budgetRemainingCents > 0)
    .map((campaign) => {
      const haystack = `${campaign.title} ${campaign.category}`.toLowerCase();
      const match = needles.reduce((score, needle) => score + (haystack.includes(needle) ? 5 : 0), 0);
      const budgetBoost = Math.min(campaign.budgetRemainingCents / 1_000_000, 2);
      return { campaign, score: match + budgetBoost };
    })
    .sort((a, b) => b.score - a.score || b.campaign.budgetRemainingCents - a.campaign.budgetRemainingCents)
    .slice(0, limit)
    .map((row) => row.campaign);
}

export type DepositInstructions = {
  configured: boolean;
  bankName: string;
  accountName: string;
  accountNumber: string;
  branchCode: string;
  reference: string;
  steps: string[];
};

export function paymentReference(userId: string): string {
  const compact = userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase();
  return `FWETA${compact || "ACCOUNT"}`;
}

export function depositInstructions(
  userId: string,
  env: {
    bankName?: string;
    accountName?: string;
    accountNumber?: string;
    branchCode?: string;
  } = {},
): DepositInstructions {
  const bankName = env.bankName?.trim() ?? "";
  const accountName = env.accountName?.trim() ?? "";
  const accountNumber = env.accountNumber?.trim() ?? "";
  const branchCode = env.branchCode?.trim() ?? "";
  const configured = Boolean(bankName && accountName && accountNumber && branchCode);
  const reference = paymentReference(userId);
  return {
    configured,
    bankName,
    accountName,
    accountNumber,
    branchCode,
    reference,
    steps: [
      "Copy your payment reference and put it in the EFT reference field.",
      configured
        ? "Transfer the campaign budget from your business account to the account below."
        : "Ask the Fweta team for the current EFT account and include your reference.",
      "An admin confirms the transfer and credits your wallet. Nothing is charged by card.",
      "Open the draft campaign and launch it once the wallet shows the funds.",
    ],
  };
}

export type EmptyGuideKind = "brand-campaigns" | "brand-bookings" | "clipper-submissions" | "influencer-bookings";

export type EmptyGuide = {
  title: string;
  description: string;
  href: string;
  cta: string;
};

const EMPTY_FOR_STEP: Partial<Record<OnboardingStepId, Partial<Record<EmptyGuideKind, EmptyGuide>>>> = {
  campaign: {
    "brand-campaigns": {
      title: "Your first campaign is the next move",
      description: "Set a rate per 1,000 views, a budget, and the rules. It stays a draft until you fund it.",
      href: "/onboarding?step=campaign",
      cta: "Build the campaign",
    },
  },
  deposit: {
    "brand-campaigns": {
      title: "Fund the draft before it can go live",
      description: "Pay in by bank transfer. An admin confirms the credit, then you can launch.",
      href: "/onboarding?step=deposit",
      cta: "View transfer steps",
    },
  },
  company: {
    "brand-campaigns": {
      title: "Add the business profile first",
      description: "Creators decide faster when they can see who the campaign is for.",
      href: "/onboarding?step=company",
      cta: "Finish company profile",
    },
    "brand-bookings": {
      title: "Finish the business profile",
      description: "Influencers see your company name, site, and logo when you send a booking.",
      href: "/onboarding?step=company",
      cta: "Add company details",
    },
  },
  socials: {
    "clipper-submissions": {
      title: "Connect a social account before you submit",
      description: "Add your handle and the bio code. The account stays pending until an admin confirms it.",
      href: "/onboarding?step=socials",
      cta: "Connect an account",
    },
  },
  payout: {
    "clipper-submissions": {
      title: "Add payout details so earnings can leave the wallet",
      description: "An admin pays withdrawals by EFT once your bank details are on file.",
      href: "/onboarding?step=payout",
      cta: "Add bank details",
    },
    "influencer-bookings": {
      title: "Add payout details",
      description: "Booking earnings land in your wallet. Withdrawals are paid manually by EFT.",
      href: "/onboarding?step=payout",
      cta: "Add bank details",
    },
  },
  discover: {
    "clipper-submissions": {
      title: "Start with a live campaign",
      description: "Pick a campaign, post the clip, and submit the link. Views turn into earnings after review.",
      href: "/onboarding?step=discover",
      cta: "See recommended campaigns",
    },
  },
  interests: {
    "clipper-submissions": {
      title: "Tell us what you make",
      description: "Your topics help us put the right live campaigns first.",
      href: "/onboarding?step=interests",
      cta: "Pick topics",
    },
    "influencer-bookings": {
      title: "Add your topics",
      description: "Brands look for a niche before they send a booking.",
      href: "/onboarding?step=interests",
      cta: "Pick topics",
    },
  },
};

export function emptyGuide(
  kind: EmptyGuideKind,
  profile: {
    roles: readonly UserRole[];
    primaryRole: UserRole;
    onboardingCompletedAt?: string | null;
    onboarding?: OnboardingDraft;
  },
  ctx: { hasPayout: boolean },
): EmptyGuide | null {
  if (isLegacyAccount(profile) || needsOnboarding(profile)) return null;
  const items = checklistItems(profile, ctx);
  if (isChecklistComplete(items)) return null;
  const next = items.find((item) => item.status === "open") ?? items.find((item) => item.status === "skipped");
  if (!next) return null;
  return EMPTY_FOR_STEP[next.id]?.[kind] ?? null;
}

export type TourBeat = { id: string; title: string; body: string };

export function tourBeats(role: UserRole, creator: boolean, brand: boolean): TourBeat[] {
  if (role === "brand" || (brand && !creator)) {
    return [
      {
        id: "home",
        title: "This is your workspace",
        body: "Overview keeps spend, reviews, and the next useful action in one place.",
      },
      {
        id: "campaigns",
        title: "Campaigns hold the brief",
        body: "Rates, budget, rules, and submissions live under Campaigns. Drafts stay private until you launch.",
      },
      {
        id: "funding",
        title: "Money moves by transfer",
        body: "You fund a campaign with a bank transfer. An admin confirms it. The same wallet reserves a UGC brief. Creator withdrawals are manual EFT too.",
      },
      {
        id: "checklist",
        title: "Skipped steps stay listed",
        body: "The setup checklist at the top of the workspace lets you finish anything you left for later.",
      },
    ];
  }
  return [
    {
      id: "home",
      title: "This is your workspace",
        body: "Overview tracks submissions, views, and what you can withdraw. UGC work is a fixed fee, separate from pay per 1,000 views.",
    },
    {
      id: "campaigns",
      title: "Join a live campaign",
      body: "Open a campaign, post on your connected account, and submit the link. Qualified views earn the listed rate.",
    },
    {
      id: "payout",
      title: "Payouts are manual",
      body: "Earnings sit in your wallet. When you withdraw, an admin sends the EFT to the bank details you saved.",
    },
    {
      id: "checklist",
      title: "You can finish setup later",
      body: "Anything you skipped stays on the checklist until you complete it or dismiss the list.",
    },
  ];
}

export const FIELD_HINTS = {
  cpm: "What you pay for every 1,000 qualified views. Creators see this rate before they join.",
  budget: "The most this campaign will pay out. It stops when the budget is used.",
  minViews: "Views under this number do not earn. Use it to ignore clips that never really landed.",
  cap: "The most one clip can earn, so the budget spreads across more creators.",
  bio: "Copy this code into the public bio, then tap I've added it. An admin confirms the code. The account stays pending until then.",
  payout: "Fweta does not store a card. An admin pays approved withdrawals by EFT.",
  deposit: "There is no checkout on this step. The transfer is confirmed by an admin before the wallet is credited.",
} as const;

export function splitCampaignRules(requirements: string): string {
  const marker = "\n\nMinimum views before a clip qualifies:";
  const index = requirements.indexOf(marker);
  return (index >= 0 ? requirements.slice(0, index) : requirements).trim();
}

export function collectUserFacingCopy(): string[] {
  const lines: string[] = [...Object.values(STEP_SHORT)];
  for (const step of Object.values(STEP_COPY)) {
    lines.push(step.title, step.subtitle, step.nextLabel);
  }
  lines.push(...Object.values(FIELD_HINTS));
  for (const beats of [tourBeats("brand", false, true), tourBeats("clipper", true, false)]) {
    for (const beat of beats) lines.push(beat.title, beat.body);
  }
  for (const byKind of Object.values(EMPTY_FOR_STEP)) {
    if (!byKind) continue;
    for (const guide of Object.values(byKind)) {
      if (!guide) continue;
      lines.push(guide.title, guide.description, guide.cta);
    }
  }
  const sample = depositInstructions("user-1");
  lines.push(...sample.steps);
  return lines;
}
