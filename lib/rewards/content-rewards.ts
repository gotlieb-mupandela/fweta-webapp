import type {
  Campaign,
  DatabaseStore,
  FraudFlag,
  Profile,
  Submission,
  ViewSnapshot,
} from "@/lib/db/types";
import type { SocialPlatform } from "@/types/enums";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const EARNING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const FRAUD_HOLD_MS = 3 * 24 * 60 * 60 * 1000;
export const FAST_POLL_MS = 45 * 60 * 1000;
export const SLOW_POLL_MS = 6 * 60 * 60 * 1000;
export const FAST_POLL_FOR_MS = 48 * 60 * 60 * 1000;
export const FRAUD_REVIEW_SCORE = 60;
/** 10% of delivered creator spend. Taken from the brand, never from the clipper rate. */
export const PLATFORM_FEE_BPS = 1000;
/** Brand-set view floor starts here. A brand can set 0. */
export const DEFAULT_MIN_VIEWS = 100;
export const DAILY_SUBMIT_CAP = 5;

export const SADC_COUNTRIES: { code: string; name: string }[] = [
  { code: "AO", name: "Angola" },
  { code: "BW", name: "Botswana" },
  { code: "KM", name: "Comoros" },
  { code: "CD", name: "DR Congo" },
  { code: "SZ", name: "Eswatini" },
  { code: "LS", name: "Lesotho" },
  { code: "MG", name: "Madagascar" },
  { code: "MW", name: "Malawi" },
  { code: "MU", name: "Mauritius" },
  { code: "MZ", name: "Mozambique" },
  { code: "NA", name: "Namibia" },
  { code: "SC", name: "Seychelles" },
  { code: "ZA", name: "South Africa" },
  { code: "TZ", name: "Tanzania" },
  { code: "ZM", name: "Zambia" },
  { code: "ZW", name: "Zimbabwe" },
];

export const DEFAULT_COUNTRY_CODES = SADC_COUNTRIES.map((c) => c.code);

export const ABUSE_RULES = [
  "No bought views, bots, view trades, or paid boosts.",
  "No duplicate posts, and no second account posting the same clip.",
  "The post stays public until the wallet release.",
  "Disclose that the post is sponsored.",
  "At most 5 posts per linked account on one campaign in 24 hours.",
] as const;

export function countryName(code: string): string {
  return SADC_COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

export function feeBpsFromStore(store: { platformSettings?: { platformFeeBps: number }[] }): number {
  const raw = store.platformSettings?.[0]?.platformFeeBps;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw > 2500) return PLATFORM_FEE_BPS;
  return raw;
}

export function feeReserveForBudget(budgetCents: number, bps = PLATFORM_FEE_BPS): number {
  if (!Number.isInteger(budgetCents) || budgetCents <= 0) return 0;
  const rate = Number.isInteger(bps) && bps >= 0 && bps <= 2500 ? bps : PLATFORM_FEE_BPS;
  return Math.floor((budgetCents * rate) / 10000);
}

export function feeOnDelivered(deliveredCents: number, bps = PLATFORM_FEE_BPS): number {
  if (!Number.isInteger(deliveredCents) || deliveredCents <= 0) return 0;
  const rate = Number.isInteger(bps) && bps >= 0 && bps <= 2500 ? bps : PLATFORM_FEE_BPS;
  return Math.floor((deliveredCents * rate) / 10000);
}

export function launchCostCents(budgetCents: number, bps = PLATFORM_FEE_BPS): number {
  return budgetCents + feeReserveForBudget(budgetCents, bps);
}

export function hydrateCampaign(raw: Campaign): Campaign {
  const countries = Array.isArray(raw.countries)
    ? raw.countries.filter((code) => typeof code === "string" && code.length === 2)
    : [];
  return {
    ...raw,
    requirements: raw.requirements ?? "",
    rules: raw.rules ?? "",
    assets: Array.isArray(raw.assets) ? raw.assets.filter((a) => a && a.url) : [],
    captionGuide: raw.captionGuide ?? "",
    hashtags: Array.isArray(raw.hashtags)
      ? raw.hashtags.filter((tag) => typeof tag === "string" && tag.trim()).map((tag) => tag.trim().replace(/^#/, ""))
      : [],
    requiredChecks: Array.isArray(raw.requiredChecks)
      ? raw.requiredChecks.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
      : [],
    feeBps: Number.isInteger(raw.feeBps) ? raw.feeBps : undefined,
    minPayoutCents: Number.isInteger(raw.minPayoutCents) ? raw.minPayoutCents : 0,
    minViews: Number.isInteger(raw.minViews) ? raw.minViews : 0,
    payModel: raw.payModel === "pool" ? "pool" : "cpm",
    countries: countries.length > 0 ? countries : [...DEFAULT_COUNTRY_CODES],
    feeReservedCents: Number.isInteger(raw.feeReservedCents) ? raw.feeReservedCents : 0,
    feeChargedCents: Number.isInteger(raw.feeChargedCents) ? raw.feeChargedCents : 0,
    feeRefundedCents: Number.isInteger(raw.feeRefundedCents) ? raw.feeRefundedCents : 0,
    unspentReturnedCents: Number.isInteger(raw.unspentReturnedCents) ? raw.unspentReturnedCents : 0,
    poolSettledAt: raw.poolSettledAt ?? null,
    closedAt: raw.closedAt ?? null,
    startDate: raw.startDate ?? null,
    endDate: raw.endDate ?? null,
  };
}

export function hydrateSubmission(raw: Submission): Submission {
  const views = Number.isInteger(raw.views) ? raw.views : 0;
  const legacyEarnings = Number.isInteger(raw.earningsCents) ? raw.earningsCents : 0;
  const legacyPaid = raw.payoutState == null && raw.status === "approved" && legacyEarnings > 0;
  const payoutState = raw.payoutState ?? (legacyPaid ? "released" : "none");
  const releasedCents = Number.isInteger(raw.releasedCents)
    ? raw.releasedCents
    : legacyPaid
      ? legacyEarnings
      : 0;
  const reservedCents = Number.isInteger(raw.reservedCents) ? raw.reservedCents : 0;
  let baselineViews: number | null = null;
  if (Number.isInteger(raw.baselineViews)) baselineViews = raw.baselineViews as number;
  else if (legacyPaid) baselineViews = 0;
  const payableViews = Number.isInteger(raw.payableViews)
    ? raw.payableViews
    : baselineViews == null
      ? 0
      : Math.max(0, views - baselineViews);
  return {
    ...raw,
    reviewNote: raw.reviewNote ?? null,
    views,
    baselineViews,
    payableViews,
    reservedCents,
    releasedCents,
    earningsCents: reservedCents + releasedCents,
    approvedAt: raw.approvedAt ?? null,
    earningUntil: raw.earningUntil ?? null,
    holdUntil: raw.holdUntil ?? null,
    releasedAt: raw.releasedAt ?? (legacyPaid ? raw.updatedAt : null),
    payoutState,
    nextPollAt: raw.nextPollAt ?? null,
    lastPolledAt: raw.lastPolledAt ?? null,
    postLive: raw.postLive ?? null,
    likes: Number.isInteger(raw.likes) ? raw.likes : null,
    comments: Number.isInteger(raw.comments) ? raw.comments : null,
    fraudScore: Number.isInteger(raw.fraudScore) ? raw.fraudScore : 0,
    fraudState: raw.fraudState ?? "clear",
    fraudReasons: Array.isArray(raw.fraudReasons)
      ? raw.fraudReasons.filter((reason) => typeof reason === "string")
      : [],
    appealUsed: Boolean(raw.appealUsed),
    confirmedChecks: Array.isArray(raw.confirmedChecks)
      ? raw.confirmedChecks.filter((item) => typeof item === "string")
      : [],
  };
}

export function hydrateViewSnapshot(raw: ViewSnapshot): ViewSnapshot {
  const status =
    raw.status === "pending" || raw.status === "replaced" || raw.status === "confirmed"
      ? raw.status
      : "confirmed";
  const source =
    raw.source === "bulk" || raw.source === "creator" || raw.source === "admin" || raw.source === "job"
      ? raw.source
      : "admin";
  return {
    ...raw,
    likes: Number.isInteger(raw.likes) ? raw.likes : null,
    comments: Number.isInteger(raw.comments) ? raw.comments : null,
    note: raw.note ?? null,
    screenshotPath: raw.screenshotPath ?? null,
    checkedBy: raw.checkedBy ?? null,
    source,
    status,
  };
}

function hydrateFraudFlag(raw: FraudFlag): FraudFlag {
  return {
    ...raw,
    kind: raw.kind === "score" ? "score" : "manual",
    score: Number.isInteger(raw.score) ? raw.score : null,
    appealNote: raw.appealNote ?? null,
    resolvedAt: raw.resolvedAt ?? null,
  };
}

export function hydrateStore(store: DatabaseStore): DatabaseStore {
  store.campaigns = (store.campaigns ?? []).map((c) => hydrateCampaign(c));
  store.submissions = (store.submissions ?? []).map((s) => hydrateSubmission(s));
  store.fraudFlags = (store.fraudFlags ?? []).map((f) => hydrateFraudFlag(f));
  store.viewSnapshots = (store.viewSnapshots ?? []).map((snap) => hydrateViewSnapshot(snap));
  if (!Array.isArray(store.linkedAccounts)) store.linkedAccounts = [];
  if (!Array.isArray(store.savedCampaigns)) store.savedCampaigns = [];
  if (!Array.isArray(store.supportTickets)) store.supportTickets = [];
  if (!Array.isArray(store.supportMessages)) store.supportMessages = [];
  if (!Array.isArray(store.auditLog)) store.auditLog = [];
  if (!Array.isArray(store.prizeAwards)) store.prizeAwards = [];
  if (!Array.isArray(store.platformSettings)) store.platformSettings = [];
  if (!Array.isArray(store.ugcBriefs)) store.ugcBriefs = [];
  if (!Array.isArray(store.ugcApplications)) store.ugcApplications = [];
  if (!Array.isArray(store.ugcDeliveries)) store.ugcDeliveries = [];
  if (!Array.isArray(store.contentLicenses)) store.contentLicenses = [];
  if (!Array.isArray(store.licenseDisputes)) store.licenseDisputes = [];
  if (!Array.isArray(store.creatorPortfolios)) store.creatorPortfolios = [];
  if (!Array.isArray(store.businessListings)) store.businessListings = [];
  if (!Array.isArray(store.creatorReviews)) store.creatorReviews = [];
  return store;
}

/** @deprecated use hydrateStore */
export function hydrateStoreCampaigns(store: DatabaseStore): DatabaseStore {
  return hydrateStore(store);
}

export function startInstant(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = DATE_ONLY.test(value) ? Date.parse(`${value}T00:00:00.000Z`) : Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function endInstant(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = DATE_ONLY.test(value) ? Date.parse(`${value}T23:59:59.999Z`) : Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function campaignWindowOpen(campaign: Campaign, now = Date.now()): boolean {
  const start = startInstant(campaign.startDate);
  const end = endInstant(campaign.endDate);
  if (start != null && now < start) return false;
  if (end != null && now > end) return false;
  return true;
}

export function campaignEnded(campaign: Campaign, now = Date.now()): boolean {
  if (campaign.status === "completed" || campaign.closedAt) return true;
  const end = endInstant(campaign.endDate);
  if (end != null && now > end) return true;
  if (
    campaign.payModel !== "pool" &&
    campaign.budgetTotalCents > 0 &&
    campaign.budgetSpentCents >= campaign.budgetTotalCents &&
    campaign.status !== "draft" &&
    campaign.status !== "pending"
  ) {
    return true;
  }
  return false;
}

/** Active, funded window still open, creator budget not exhausted. */
export function campaignIsDiscoverable(campaign: Campaign, now = Date.now()): boolean {
  if (campaign.status !== "active") return false;
  if (campaign.payModel !== "pool" && remainingBudgetCents(campaign) <= 0) return false;
  return campaignWindowOpen(campaign, now);
}

export function remainingBudgetCents(campaign: Campaign): number {
  return Math.max(0, campaign.budgetTotalCents - campaign.budgetSpentCents - campaign.unspentReturnedCents);
}

export function budgetUsedRatio(campaign: Campaign): number {
  if (campaign.budgetTotalCents <= 0) return 0;
  const used = campaign.payModel === "pool" && !campaign.poolSettledAt ? 0 : campaign.budgetSpentCents;
  return Math.min(1, used / campaign.budgetTotalCents);
}

export function qualifiedViewCount(submission: Submission, now = Date.now()): number {
  const baseline = submission.baselineViews ?? 0;
  const frozen =
    submission.earningUntil != null &&
    !Number.isNaN(Date.parse(submission.earningUntil)) &&
    now >= Date.parse(submission.earningUntil);
  if (frozen || submission.payoutState === "released" || submission.payoutState === "clawed_back") {
    return Math.max(0, submission.payableViews);
  }
  return Math.max(0, submission.views - baseline);
}

export function latestConfirmedSnapshot(
  snapshots: ViewSnapshot[],
  submissionId: string,
): ViewSnapshot | null {
  const rows = snapshots
    .filter((snap) => snap.submissionId === submissionId && snap.status === "confirmed")
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  return rows[0] ?? null;
}

export function pendingCreatorSnapshot(
  snapshots: ViewSnapshot[],
  submissionId: string,
): ViewSnapshot | null {
  const rows = snapshots
    .filter((snap) => snap.submissionId === submissionId && snap.status === "pending")
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  return rows[0] ?? null;
}

/**
 * CPM: floor(qualified views / 1000 * net rate), then the per-post cap.
 * Callers apply the campaign budget.
 */
export function uncappedEarningsCents(views: number, campaign: Campaign): number {
  if (views <= 0 || campaign.cpmCents <= 0) return 0;
  const raw = Math.floor((views / 1000) * campaign.cpmCents);
  return Math.min(raw, campaign.maxPayoutPerSubmissionCents);
}

export function allocatePoolShares(
  budgetCents: number,
  clips: { id: string; views: number }[],
  capCents: number,
): Map<string, number> {
  const shares = new Map<string, number>();
  const active = clips.filter((clip) => clip.views > 0);
  const total = active.reduce((sum, clip) => sum + clip.views, 0);
  if (budgetCents <= 0 || total <= 0) return shares;
  for (const clip of active) {
    const raw = Math.floor((budgetCents * clip.views) / total);
    shares.set(clip.id, Math.min(capCents, Math.max(0, raw)));
  }
  return shares;
}

export function poolEstimateCents(
  submission: Submission,
  campaign: Campaign,
  submissions: Submission[],
  now = Date.now(),
): number {
  if (campaign.payModel !== "pool") return 0;
  if (campaign.poolSettledAt) return submission.earningsCents;
  if (submission.status === "rejected" || submission.fraudState === "upheld") return 0;
  const mine = qualifiedViewCount(submission, now);
  if (mine < campaign.minViews) return 0;
  const eligible = submissions.filter((item) => {
    if (item.campaignId !== campaign.id) return false;
    if (item.status === "rejected" || item.fraudState === "upheld") return false;
    return qualifiedViewCount(item, now) >= campaign.minViews;
  });
  const shares = allocatePoolShares(
    campaign.budgetTotalCents,
    eligible.map((item) => ({ id: item.id, views: qualifiedViewCount(item, now) })),
    campaign.maxPayoutPerSubmissionCents,
  );
  return shares.get(submission.id) ?? 0;
}

/** What a clip would add to the wallet if it settled from today's views. */
export function projectedPayoutCents(
  submission: Submission,
  campaign: Campaign,
  submissions: Submission[] = [],
  now = Date.now(),
): number {
  if (campaign.payModel === "pool") return poolEstimateCents(submission, campaign, submissions, now);
  if (submission.payoutState === "released" || submission.payoutState === "clawed_back") {
    return submission.earningsCents;
  }
  const earned = uncappedEarningsCents(qualifiedViewCount(submission, now), campaign);
  const room = remainingBudgetCents(campaign) + submission.reservedCents + submission.releasedCents;
  return Math.min(earned, Math.max(0, room));
}

export function meetsPayoutMinimum(
  submission: Submission,
  campaign: Campaign,
  submissions: Submission[] = [],
  now = Date.now(),
): boolean {
  if ((campaign.minPayoutCents ?? 0) <= 0) return true;
  return projectedPayoutCents(submission, campaign, submissions, now) >= campaign.minPayoutCents;
}

export function meetsViewFloor(submission: Submission, campaign: Campaign, now = Date.now()): boolean {
  if ((campaign.minViews ?? 0) <= 0) return true;
  return qualifiedViewCount(submission, now) >= campaign.minViews;
}

export function readyForReview(
  submission: Submission,
  campaign: Campaign,
  submissions: Submission[] = [],
  now = Date.now(),
): boolean {
  return (
    submission.status === "pending" &&
    meetsViewFloor(submission, campaign, now) &&
    meetsPayoutMinimum(submission, campaign, submissions, now)
  );
}

export type ClipStatusKey =
  | "tracking"
  | "in_review"
  | "approved"
  | "rejected"
  | "budget_stopped"
  | "paid";

export function clipperClipStatus(
  submission: Submission,
  campaign: Campaign,
  submissions: Submission[] = [],
  now = Date.now(),
): { key: ClipStatusKey; label: string; note: string | null } {
  if (submission.status === "rejected") {
    return { key: "rejected", label: "Rejected", note: submission.reviewNote };
  }
  if (submission.payoutState === "clawed_back") {
    return {
      key: "rejected",
      label: "Rejected",
      note:
        submission.reviewNote ||
        "This clip was forfeited. The unsettled share returned to the brand. Money already in a wallet stays there.",
    };
  }
  if (submission.payoutState === "released") {
    return {
      key: "paid",
      label: "Paid",
      note: "In your wallet. A bank payout is a manual Namibian EFT from N$100.",
    };
  }
  if (submission.fraudState === "review" || submission.fraudState === "appealed") {
    return {
      key: "in_review",
      label: "In review",
      note: submission.fraudReasons.join(" ") || "A reviewer is checking this clip.",
    };
  }
  if (submission.status === "approved") {
    const holding = submission.payoutState === "holding";
    return {
      key: "approved",
      label: "Approved",
      note: holding
        ? "Approved. The fraud hold ends before this moves to your available balance."
        : campaign.payModel === "pool"
          ? "Approved. The pot is split when the campaign ends. This amount is an estimate until then."
          : "Approved. Qualified views are set aside until the fraud hold ends.",
    };
  }
  if (submission.status === "pending" && campaignEnded(campaign, now)) {
    return {
      key: "budget_stopped",
      label: "Stopped",
      note: "This campaign is no longer paying.",
    };
  }
  if (submission.status === "flagged" || readyForReview(submission, campaign, submissions, now)) {
    return {
      key: "in_review",
      label: "In review",
      note: submission.reviewNote,
    };
  }
  return {
    key: "tracking",
    label: "Tracking",
    note:
      campaign.minViews > 0
        ? `${qualifiedViewCount(submission, now)} of ${campaign.minViews} qualified views toward review.`
        : null,
  };
}

export function lastCheckedLabel(iso: string | null): string {
  if (!iso) return "Not checked yet";
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "Not checked yet";
  return `Last checked ${new Date(parsed).toLocaleString("en-NA", {
    dateStyle: "medium",
    timeStyle: "short",
  })}`;
}

export function audienceLabel(countries: string[]): string {
  const set = new Set(countries);
  const sadc = DEFAULT_COUNTRY_CODES.every((code) => set.has(code)) && set.size === DEFAULT_COUNTRY_CODES.length;
  if (sadc) return "Namibia and SADC";
  if (set.size === 1 && set.has("NA")) return "Namibia";
  return countries.map(countryName).join(", ");
}

export function detectPlatform(url: string): SocialPlatform | null {
  let host = "";
  try {
    host = new URL(url.trim()).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
  if (
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtu.be" ||
    host.endsWith(".youtu.be")
  ) {
    return "youtube";
  }
  if (host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.watch") {
    return "facebook";
  }
  if (
    host === "x.com" ||
    host.endsWith(".x.com") ||
    host === "twitter.com" ||
    host.endsWith(".twitter.com")
  ) {
    return "x";
  }
  return null;
}

export function normalizeHandle(value: string): string {
  return value.trim().toLowerCase().replace(/^@/, "").replace(/\s+/g, "");
}

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  tiktok: "TikTok",
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X",
};

export type LeaderRow = {
  clipperId: string;
  displayName: string;
  handle: string | null;
  views: number;
  earningsCents: number;
  clips: number;
  estimate: boolean;
};

export function publicHandle(
  accounts: DatabaseStore["linkedAccounts"],
  userId: string,
  platforms: SocialPlatform[] = [],
): string | null {
  const mine = accounts.filter((account) => account.userId === userId && account.verifiedAt);
  const preferred = mine.find((account) => platforms.includes(account.platform)) ?? mine[0];
  if (!preferred) return null;
  const handle = preferred.handle.trim().replace(/^@/, "");
  return handle ? `@${handle}` : null;
}

export function campaignLeaderboard(
  store: Pick<DatabaseStore, "submissions" | "profiles" | "campaigns" | "linkedAccounts">,
  campaignId: string,
  now = Date.now(),
): LeaderRow[] {
  const campaign = store.campaigns.find((item) => item.id === campaignId);
  const names = new Map<string, string>(
    store.profiles.map((p: Profile) => [p.id, p.displayName || "Creator"]),
  );
  const estimate = campaign?.payModel === "pool" && !campaign.poolSettledAt;
  const rows = new Map<string, LeaderRow>();
  for (const submission of store.submissions) {
    if (submission.campaignId !== campaignId || submission.status !== "approved") continue;
    const current = rows.get(submission.clipperId) ?? {
      clipperId: submission.clipperId,
      displayName: names.get(submission.clipperId) ?? "Creator",
      handle: publicHandle(store.linkedAccounts, submission.clipperId, campaign?.platforms ?? []),
      views: 0,
      earningsCents: 0,
      clips: 0,
      estimate: Boolean(estimate),
    };
    current.views += qualifiedViewCount(submission, now);
    const amount =
      estimate && campaign
        ? poolEstimateCents(submission, campaign, store.submissions, now)
        : submission.earningsCents;
    current.earningsCents += amount;
    current.clips += 1;
    rows.set(submission.clipperId, current);
  }
  return [...rows.values()].sort(
    (a, b) => b.views - a.views || b.earningsCents - a.earningsCents || a.displayName.localeCompare(b.displayName),
  );
}

export type CatalogCard = {
  campaign: Campaign;
  approvedClips: number;
  views: number;
};

export type CatalogClip = {
  submissionId: string;
  campaignId: string;
  campaignTitle: string;
  creatorName: string;
  handle: string | null;
  views: number;
};

export function buildPublicCatalog(store: DatabaseStore, country?: string): {
  featured: CatalogCard[];
  topCampaigns: CatalogCard[];
  topClips: CatalogClip[];
} {
  const code = country === undefined ? "NA" : country;
  const campaigns = store.campaigns.filter((campaign) => {
    if (!campaignIsDiscoverable(campaign)) return false;
    if (!code || code === "all") return true;
    return campaign.countries.includes(code);
  });
  const open = new Set(campaigns.map((campaign) => campaign.id));
  const approved = store.submissions.filter(
    (submission) => open.has(submission.campaignId) && submission.status === "approved",
  );
  const clipCounts = new Map<string, number>();
  const viewTotals = new Map<string, number>();
  for (const submission of approved) {
    clipCounts.set(submission.campaignId, (clipCounts.get(submission.campaignId) ?? 0) + 1);
    viewTotals.set(
      submission.campaignId,
      (viewTotals.get(submission.campaignId) ?? 0) + qualifiedViewCount(submission),
    );
  }
  const card = (campaign: Campaign): CatalogCard => ({
    campaign,
    approvedClips: clipCounts.get(campaign.id) ?? 0,
    views: viewTotals.get(campaign.id) ?? 0,
  });
  const featured = [...campaigns]
    .sort(
      (a, b) =>
        remainingBudgetCents(b) - remainingBudgetCents(a) || b.createdAt.localeCompare(a.createdAt),
    )
    .slice(0, 3)
    .map(card);
  const topCampaigns = [...campaigns]
    .sort(
      (a, b) =>
        (viewTotals.get(b.id) ?? 0) - (viewTotals.get(a.id) ?? 0) ||
        remainingBudgetCents(b) - remainingBudgetCents(a),
    )
    .slice(0, 3)
    .map(card);
  const topClips = [...approved]
    .sort((a, b) => qualifiedViewCount(b) - qualifiedViewCount(a))
    .slice(0, 6)
    .map((submission) => {
      const campaign = campaigns.find((item) => item.id === submission.campaignId);
      const profile = store.profiles.find((item) => item.id === submission.clipperId);
      return {
        submissionId: submission.id,
        campaignId: submission.campaignId,
        campaignTitle: campaign?.title ?? "Campaign",
        creatorName: profile?.displayName || "Creator",
        handle: publicHandle(store.linkedAccounts ?? [], submission.clipperId, campaign?.platforms ?? []),
        views: qualifiedViewCount(submission),
      };
    });
  return { featured, topCampaigns, topClips };
}

export function nextPollAtIso(createdAt: string, fromMs: number): string {
  const created = Date.parse(createdAt);
  const age = Number.isNaN(created) ? FAST_POLL_FOR_MS : fromMs - created;
  const step = age < FAST_POLL_FOR_MS ? FAST_POLL_MS : SLOW_POLL_MS;
  return new Date(fromMs + step).toISOString();
}
