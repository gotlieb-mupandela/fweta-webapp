import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { decryptSecret, readStore } from "@/lib/db/store";
import type {
  Booking,
  BrandDeposit,
  Campaign,
  FraudFlag,
  InfluencerProfile,
  LedgerEntry,
  Profile,
  ProfileSocials,
  RateCardItem,
  Submission,
  ViewSnapshot,
  Wallet,
  WithdrawalRequest,
} from "@/lib/db/types";
import { maskAccountNumber } from "@/lib/utils";
import { isSocialPlatform, PLATFORM_LABEL, SOCIAL_PLATFORMS } from "@/lib/social/platforms";
import type { AccountType, SocialPlatform } from "@/types/enums";

export type AdminProfile = Omit<Profile, "passwordHash">;

export type SocialLink = {
  platform: SocialPlatform;
  value: string;
  source: "account" | "public" | "linked";
  status?: string;
};

export type VerificationRow = {
  label: string;
  status: string;
  detail: string;
};

export type MediaItem = {
  url: string;
  label: string;
  image: boolean;
};

export type MaskedPayout = {
  id: string;
  bankName: string;
  branchCode: string;
  accountHolderName: string;
  accountType: AccountType;
  accountNumberMasked: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminSubmissionRow = Submission & {
  campaignTitle: string | null;
  snapshots: ViewSnapshot[];
};

export type AdminBookingRow = Booking & {
  side: "brand" | "influencer" | "both";
  counterpartyName: string | null;
  rateTitle: string | null;
};

export type AdminFraudRow = FraudFlag & {
  postUrl: string | null;
  campaignTitle: string | null;
  relation: "Posted clip" | "Brand campaign";
};

export type AdminUserDossier = {
  profile: AdminProfile;
  influencer: InfluencerProfile | null;
  rateCards: RateCardItem[];
  socials: SocialLink[];
  verification: VerificationRow[];
  totalViews: number;
  totalEarningsCents: number;
  media: MediaItem[];
  wallet: Wallet | null;
  ledger: LedgerEntry[];
  payout: MaskedPayout | null;
  withdrawals: WithdrawalRequest[];
  campaigns: Campaign[];
  submissions: AdminSubmissionRow[];
  bookings: AdminBookingRow[];
  deposits: BrandDeposit[];
  fraudFlags: AdminFraudRow[];
};

const PLATFORMS: readonly SocialPlatform[] = SOCIAL_PLATFORMS;

function withoutPassword(profile: Profile): AdminProfile {
  const { passwordHash, ...safe } = profile;
  void passwordHash;
  return safe;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asPlatform(value: unknown): SocialPlatform | null {
  return isSocialPlatform(value) ? value : null;
}

function cents(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Linked accounts may live on the JSON document from a newer store shape. */
function collectLinkedAccounts(store: unknown, userId: string): SocialLink[] {
  const root = asRecord(store);
  if (!root) return [];
  const rows = [...asArray(root.socialAccounts), ...asArray(root.linkedAccounts)];
  const links: SocialLink[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    if (!record || record.userId !== userId) continue;
    const platform = asPlatform(record.platform);
    if (!platform) continue;
    const handle = typeof record.handle === "string" ? record.handle.trim() : "";
    const url = typeof record.url === "string" ? record.url.trim() : "";
    const value = url || handle;
    if (!value) continue;
    const status =
      typeof record.status === "string"
        ? record.status
        : record.verifiedAt
          ? "verified"
          : "pending";
    links.push({ platform, value, source: "linked", status });
  }
  return links;
}

function collectVerification(profile: Profile, socials: SocialLink[]): VerificationRow[] {
  const rows: VerificationRow[] = [];
  const loose = profile as Profile & {
    kyc?: { status?: string; country?: string; submittedAt?: string } | null;
    onboarding?: { checks?: unknown };
  };

  rows.push({
    label: "Account",
    status: profile.suspended ? "Suspended" : "Active",
    detail: profile.email,
  });

  if (profile.onboardingCompletedAt === undefined) {
    rows.push({
      label: "Onboarding",
      status: "Legacy",
      detail: "Onboarding was not required for this account.",
    });
  } else if (profile.onboardingCompletedAt === null) {
    rows.push({
      label: "Onboarding",
      status: "Not completed",
      detail: "This account has not finished setup.",
    });
  } else {
    rows.push({
      label: "Onboarding",
      status: "Completed",
      detail: profile.onboardingCompletedAt === "seeded" ? "Completed at seed" : profile.onboardingCompletedAt,
    });
  }

  const checks = asArray(loose.onboarding?.checks);
  for (const check of checks) {
    const record = asRecord(check);
    if (!record) continue;
    const platform = asPlatform(record.platform);
    const handle = typeof record.handle === "string" ? record.handle : "";
    const status = typeof record.status === "string" ? record.status : "pending";
    rows.push({
      label: platform ? `${platform} check` : "Social check",
      status,
      detail: handle || "No handle stored",
    });
  }

  for (const link of socials.filter((item) => item.source === "linked")) {
    rows.push({
      label: link.platform,
      status: link.status ?? "pending",
      detail: link.value,
    });
  }

  for (const link of socials.filter((item) => item.source === "account" || item.source === "public")) {
    rows.push({
      label: `${PLATFORM_LABEL[link.platform]} ${link.source === "public" ? "public profile" : "profile"}`,
      status: link.status ?? "Listed",
      detail: link.value,
    });
  }

  if (loose.kyc) {
    rows.push({
      label: "Payout identity",
      status: loose.kyc.status ?? "submitted",
      detail: loose.kyc.country ? `Country ${loose.kyc.country}` : "Identity record is stored. The ID number stays hidden.",
    });
  } else {
    rows.push({
      label: "Payout identity",
      status: "Not submitted",
      detail: "No identity record is stored yet. Payouts stay manual EFT.",
    });
  }

  if (profile.verification) {
    rows.push({
      label: "Bio code",
      status: profile.verification.status,
      detail: profile.verification.code,
    });
  } else if (profile.roles.includes("clipper") || profile.roles.includes("influencer")) {
    rows.push({
      label: "Bio code",
      status: "Not requested",
      detail: "No verification code has been issued.",
    });
  }

  if (profile.website) {
    rows.push({
      label: "Website",
      status: "Listed",
      detail: profile.website,
    });
  }

  return rows;
}

function collectSocials(
  socials: ProfileSocials | undefined,
  source: SocialLink["source"],
): SocialLink[] {
  if (!socials) return [];
  const links: SocialLink[] = [];
  for (const platform of PLATFORMS) {
    const value = socials[platform];
    if (typeof value === "string" && value.trim()) {
      links.push({ platform, value: value.trim(), source });
    }
  }
  return links;
}

function looksLikeImage(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(url);
}

function pushMedia(items: MediaItem[], url: string | null | undefined, label: string, image: boolean) {
  const trimmed = url?.trim();
  if (!trimmed) return;
  if (items.some((item) => item.url === trimmed)) return;
  items.push({ url: trimmed, label, image });
}

/**
 * Full stored record for one user. Admin session required.
 * Returns null when the id is not in the store. Never includes the password hash.
 */
export async function loadAdminUserDossier(userId: string): Promise<AdminUserDossier | null> {
  const session = await getSession();
  if (!session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const store = await readStore();
  const profile = store.profiles.find((p) => p.id === userId);
  if (!profile) return null;
  if (!Array.isArray(profile.roles)) profile.roles = [];

  const influencer =
    store.influencerProfiles.find((p) => p.userId === profile.id) ?? null;
  const rateCards = influencer
    ? store.rateCards
        .filter((r) => r.influencerProfileId === influencer.id)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    : [];

  const socials = [
    ...collectSocials(profile.socials, "account"),
    ...collectSocials(influencer?.socials, "public"),
    ...collectLinkedAccounts(store, profile.id),
  ];
  const verification = collectVerification(profile, socials);

  const media: MediaItem[] = [];
  pushMedia(media, profile.avatarUrl, "Account avatar", true);
  pushMedia(media, influencer?.avatarUrl, "Public profile photo", true);
  for (const [index, work] of (influencer?.featuredWork ?? []).entries()) {
    pushMedia(media, work, `Featured work ${index + 1}`, looksLikeImage(work));
  }

  const wallet = store.wallets.find((w) => w.userId === profile.id) ?? null;
  const ledger = store.ledgerEntries
    .filter((e) => e.userId === profile.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const method = store.payoutMethods.find((p) => p.userId === profile.id) ?? null;
  let payout: MaskedPayout | null = null;
  if (method) {
    let accountNumberMasked = "••••";
    try {
      accountNumberMasked = maskAccountNumber(decryptSecret(method.accountNumberEnc));
    } catch {
      accountNumberMasked = "••••";
    }
    payout = {
      id: method.id,
      bankName: method.bankName,
      branchCode: method.branchCode,
      accountHolderName: method.accountHolderName,
      accountType: method.accountType,
      accountNumberMasked,
      createdAt: method.createdAt,
      updatedAt: method.updatedAt,
    };
  }

  const withdrawals = store.withdrawalRequests
    .filter((w) => w.userId === profile.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const campaigns = store.campaigns
    .filter((c) => c.brandId === profile.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const campaignTitle = new Map(store.campaigns.map((c) => [c.id, c.title]));
  const submissions: AdminSubmissionRow[] = store.submissions
    .filter((s) => s.clipperId === profile.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((s) => ({
      ...s,
      views: cents(s.views),
      earningsCents: cents(s.earningsCents),
      campaignTitle: campaignTitle.get(s.campaignId) ?? null,
      snapshots: store.viewSnapshots
        .filter((v) => v.submissionId === s.id)
        .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
    }));

  const nameById = new Map(store.profiles.map((p) => [p.id, p.displayName]));
  const rateTitle = new Map(store.rateCards.map((r) => [r.id, r.title]));
  const bookings: AdminBookingRow[] = store.bookings
    .filter((b) => b.brandId === profile.id || b.influencerId === profile.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((b) => {
      const asBrand = b.brandId === profile.id;
      const asInfluencer = b.influencerId === profile.id;
      const counterpartyId = asBrand && !asInfluencer ? b.influencerId : b.brandId;
      return {
        ...b,
        side: asBrand && asInfluencer ? "both" : asBrand ? "brand" : "influencer",
        counterpartyName: nameById.get(counterpartyId) ?? null,
        rateTitle: rateTitle.get(b.rateCardItemId) ?? null,
      };
    });

  const deposits = store.brandDeposits
    .filter((d) => d.brandId === profile.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const ownSubmissionIds = new Set(submissions.map((s) => s.id));
  const ownCampaignIds = new Set(campaigns.map((c) => c.id));
  const submissionById = new Map(store.submissions.map((s) => [s.id, s]));

  const fraudFlags: AdminFraudRow[] = store.fraudFlags
    .filter((flag) => {
      if (ownSubmissionIds.has(flag.submissionId)) return true;
      const submission = submissionById.get(flag.submissionId);
      return Boolean(submission && ownCampaignIds.has(submission.campaignId));
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((flag) => {
      const submission = submissionById.get(flag.submissionId);
      return {
        ...flag,
        postUrl: submission?.postUrl ?? null,
        campaignTitle: submission ? (campaignTitle.get(submission.campaignId) ?? null) : null,
        relation: ownSubmissionIds.has(flag.submissionId) ? "Posted clip" : "Brand campaign",
      };
    });

  const totalViews = submissions.reduce((sum, row) => sum + cents(row.views), 0);
  const totalEarningsCents = submissions.reduce((sum, row) => sum + cents(row.earningsCents), 0);

  return {
    profile: withoutPassword(profile),
    influencer,
    rateCards,
    socials,
    verification,
    totalViews,
    totalEarningsCents,
    media,
    wallet,
    ledger,
    payout,
    withdrawals,
    campaigns,
    submissions,
    bookings,
    deposits,
    fraudFlags,
  };
}
