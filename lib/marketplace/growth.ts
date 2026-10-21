import type {
  Campaign,
  DatabaseStore,
  FraudCategory,
  Profile,
  SavedCampaign,
  Submission,
  ViewSnapshot,
} from "@/lib/db/types";

/** Fixed NAD bonus when a referred creator's first clip is approved. */
export const REFERRAL_BONUS_CENTS = 5_000;

/** Published weekly prizes. Places are fixed amounts, not a draw. */
export const WEEKLY_PRIZES_CENTS = [20_000, 10_000, 5_000] as const;

export const FRAUD_CATEGORIES: FraudCategory[] = [
  "view_spike",
  "duplicate",
  "ownership",
  "paid_promotion",
  "other",
];

export const FRAUD_CATEGORY_LABEL: Record<FraudCategory, string> = {
  view_spike: "View spike",
  duplicate: "Duplicate",
  ownership: "Ownership",
  paid_promotion: "Paid promotion",
  other: "Other",
};

export function referralCodeFor(userId: string): string {
  return `FW${userId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export function payoutIdentityReady(kyc: Profile["kyc"]): boolean {
  if (!kyc?.legalName || !kyc.idNumberEnc || !kyc.documentPath) return false;
  return kyc.status === "verified";
}

export function linesToList(value: string, max = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value.split(/\n+/)) {
    const line = raw.trim().replace(/^#/, "");
    if (!line || line.length > 80) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
    if (out.length >= max) break;
  }
  return out;
}

export function checksSatisfied(required: string[] | undefined, confirmed: string[] | undefined): boolean {
  const need = required ?? [];
  if (need.length === 0) return true;
  const got = new Set((confirmed ?? []).map((item) => item.trim().toLowerCase()));
  return need.every((item) => got.has(item.trim().toLowerCase()));
}

export type CreatorLevel = {
  name: "Starter" | "Rising" | "Established" | "Lead";
  next: string | null;
};

export function creatorLevel(verifiedViews: number): CreatorLevel {
  if (verifiedViews >= 50_000) return { name: "Lead", next: null };
  if (verifiedViews >= 10_000) return { name: "Established", next: "Lead at 50,000 verified views" };
  if (verifiedViews >= 1_000) return { name: "Rising", next: "Established at 10,000 verified views" };
  return { name: "Starter", next: "Rising at 1,000 verified views" };
}

export type CreatorBadge = {
  id: "first_clip" | "paid" | "referrer" | "namibia";
  label: string;
};

export function creatorBadges(store: DatabaseStore, userId: string): CreatorBadge[] {
  const mine = store.submissions.filter((item) => item.clipperId === userId);
  const badges: CreatorBadge[] = [];
  if (mine.some((item) => item.status === "approved")) {
    badges.push({ id: "first_clip", label: "First clip" });
  }
  const paidOut =
    mine.some((item) => item.releasedCents > 0) ||
    store.withdrawalRequests.some((item) => item.userId === userId && item.status === "paid");
  if (paidOut) badges.push({ id: "paid", label: "Paid out" });
  const referred = store.profiles.some((item) => item.referredByUserId === userId && item.referralRewarded);
  if (referred) badges.push({ id: "referrer", label: "Referrer" });
  const profile = store.profiles.find((item) => item.id === userId);
  const namibia =
    profile?.kyc?.country === "NA" || /namibia/i.test(profile?.location ?? "") || /windhoek/i.test(profile?.location ?? "");
  if (namibia) badges.push({ id: "namibia", label: "Namibia" });
  return badges;
}

export function verifiedViewsFor(submissions: Submission[], userId: string): number {
  return submissions
    .filter((item) => item.clipperId === userId && item.status === "approved")
    .reduce((sum, item) => sum + item.payableViews, 0);
}

/** Monday 00:00 UTC for the week containing `now`. */
export function weekStartMs(now = Date.now()): number {
  const date = new Date(now);
  const day = date.getUTCDay();
  const diff = (day + 6) % 7;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - diff);
}

export function weekKey(now = Date.now()): string {
  return new Date(weekStartMs(now)).toISOString().slice(0, 10);
}

export type WeeklyRow = {
  userId: string;
  name: string;
  handle: string | null;
  views: number;
  clips: number;
  prizeCents: number;
};

export function weeklyLeaderboard(
  store: Pick<DatabaseStore, "submissions" | "viewSnapshots" | "profiles" | "linkedAccounts">,
  now = Date.now(),
  handleFor?: (userId: string) => string | null,
): WeeklyRow[] {
  const start = weekStartMs(now);
  const end = start + 7 * 24 * 60 * 60 * 1000;
  const latest = new Map<string, ViewSnapshot>();
  for (const snap of store.viewSnapshots) {
    if (snap.status !== "confirmed") continue;
    const at = Date.parse(snap.recordedAt);
    if (Number.isNaN(at) || at < start || at >= end) continue;
    const prev = latest.get(snap.submissionId);
    if (!prev || prev.recordedAt < snap.recordedAt) latest.set(snap.submissionId, snap);
  }
  const rows = new Map<string, WeeklyRow>();
  for (const snap of latest.values()) {
    const submission = store.submissions.find((item) => item.id === snap.submissionId);
    if (!submission || submission.status !== "approved") continue;
    const profile = store.profiles.find((item) => item.id === submission.clipperId);
    const current = rows.get(submission.clipperId) ?? {
      userId: submission.clipperId,
      name: profile?.displayName || "Creator",
      handle: handleFor ? handleFor(submission.clipperId) : null,
      views: 0,
      clips: 0,
      prizeCents: 0,
    };
    current.views += snap.views;
    current.clips += 1;
    rows.set(submission.clipperId, current);
  }
  const ranked = [...rows.values()].sort((a, b) => b.views - a.views || a.name.localeCompare(b.name));
  ranked.forEach((row, index) => {
    row.prizeCents = WEEKLY_PRIZES_CENTS[index] ?? 0;
  });
  return ranked;
}

export function thisWeekLeaderboard(
  store: Pick<DatabaseStore, "submissions" | "viewSnapshots" | "profiles" | "linkedAccounts">,
  handleFor?: (userId: string) => string | null,
): WeeklyRow[] {
  return weeklyLeaderboard(store, Date.now(), handleFor);
}

export function campaignMatchesCreator(
  profile: Profile,
  campaign: Campaign,
  saved: SavedCampaign[],
  campaigns: Campaign[],
): boolean {
  const interests = profile.onboarding?.interests ?? [];
  if (interests.some((item) => item.trim().toLowerCase() === campaign.category.trim().toLowerCase())) {
    return true;
  }
  const location = `${profile.location ?? ""} ${profile.kyc?.country ?? ""}`.toLowerCase();
  if (campaign.countries.includes("NA") && /namibia|\bna\b|windhoek/.test(location)) return true;
  if (campaign.countries.some((code) => location.includes(code.toLowerCase()))) return true;
  const savedIds = new Set(saved.filter((item) => item.userId === profile.id).map((item) => item.campaignId));
  return campaigns.some(
    (item) =>
      savedIds.has(item.id) &&
      item.id !== campaign.id &&
      item.category.trim().toLowerCase() === campaign.category.trim().toLowerCase(),
  );
}
