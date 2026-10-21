import type { DatabaseStore } from "@/lib/db/types";
import type { SocialPlatform } from "@/types/enums";

export const USER_TABS = [
  { id: "all", label: "All users" },
  { id: "clipper", label: "Creators" },
  { id: "influencer", label: "Influencers" },
  { id: "brand", label: "Brands" },
] as const;

export type UserTab = (typeof USER_TABS)[number]["id"];

export type AdminDirectoryRow = {
  id: string;
  displayName: string;
  email: string;
  phone: string;
  roles: string[];
  primaryRole: string;
  joinedAt: string;
  verification: string;
  socialCount: number;
  clips: number;
  views: number;
  earningsCents: number;
  availableCents: number;
  pendingCents: number;
  suspended: boolean;
  avatarUrl: string | null;
};

type LooseAccount = {
  userId?: string;
  platform?: string;
  handle?: string;
  status?: string;
  code?: string;
};

const PLATFORMS = new Set(["tiktok", "instagram", "facebook", "youtube", "x"]);

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function loose(store: DatabaseStore): Record<string, unknown> {
  return store as unknown as Record<string, unknown>;
}

export function isUserTab(value: string | undefined): value is UserTab {
  return USER_TABS.some((tab) => tab.id === value);
}

export function profileUrl(platform: string, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const handle = trimmed.replace(/^@/, "");
  if (!handle || /\s/.test(handle)) return null;
  if (platform === "tiktok") return `https://www.tiktok.com/@${handle}`;
  if (platform === "instagram") return `https://www.instagram.com/${handle}/`;
  if (platform === "youtube") return `https://www.youtube.com/@${handle}`;
  if (platform === "facebook") return `https://www.facebook.com/${handle}`;
  if (platform === "x") return `https://x.com/${handle}`;
  return null;
}

export function isSocialPlatform(value: string): value is SocialPlatform {
  return PLATFORMS.has(value);
}

function socialKeys(socials: unknown): string[] {
  if (!socials || typeof socials !== "object") return [];
  return Object.entries(socials as Record<string, unknown>)
    .filter(([, value]) => typeof value === "string" && value.trim())
    .map(([key]) => key);
}

function idLabel(kyc: unknown): string {
  if (!kyc || typeof kyc !== "object") return "No ID check";
  const status = (kyc as { status?: string }).status;
  if (status === "verified") return "ID verified";
  if (status === "pending") return "ID pending";
  if (status === "rejected") return "ID rejected";
  return "ID submitted";
}

function bioLabel(accounts: LooseAccount[]): string {
  if (accounts.length === 0) return "No bio check";
  if (accounts.some((account) => account.status === "verified")) {
    return accounts.some((account) => account.status === "review" || account.status === "pending")
      ? "Bio verified, some still open"
      : "Bio verified";
  }
  if (accounts.some((account) => account.status === "review")) return "Bio in review";
  if (accounts.some((account) => account.status === "rejected")) return "Bio rejected";
  return "Bio pending";
}

export function buildDirectory(store: DatabaseStore): AdminDirectoryRow[] {
  const extra = loose(store);
  const accounts = asArray<LooseAccount>(extra.socialAccounts);
  const linked = asArray<LooseAccount>(extra.linkedAccounts);
  const submissions = store.submissions ?? [];
  const wallets = store.wallets ?? [];

  return [...store.profiles]
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    .map((profile) => {
      const mine = accounts.filter((account) => account.userId === profile.id);
      const linkedMine = linked.filter((account) => account.userId === profile.id);
      const socials = new Set([
        ...socialKeys(profile.socials),
        ...mine.map((account) => account.platform).filter(Boolean),
        ...linkedMine.map((account) => account.platform).filter(Boolean),
      ]);
      const clips = submissions.filter((submission) => submission.clipperId === profile.id);
      const wallet = wallets.find((item) => item.userId === profile.id);
      const record = profile as typeof profile & { phone?: string; kyc?: unknown };
      const codeStatus = profile.verification?.status;
      const codeLabel =
        codeStatus === "verified"
          ? "Bio code verified"
          : codeStatus === "pending"
            ? "Bio code pending"
            : codeStatus === "rejected"
              ? "Bio code rejected"
              : null;
      return {
        id: profile.id,
        displayName: profile.displayName,
        email: profile.email,
        phone: record.phone?.trim() || "",
        roles: profile.roles,
        primaryRole: profile.primaryRole,
        joinedAt: profile.createdAt,
        verification: [bioLabel(mine), codeLabel, idLabel(record.kyc)].filter(Boolean).join(" · "),
        socialCount: socials.size,
        clips: clips.length,
        views: clips.reduce((sum, submission) => sum + (submission.views || 0), 0),
        earningsCents: clips.reduce((sum, submission) => sum + (submission.earningsCents || 0), 0),
        availableCents: wallet?.availableCents ?? 0,
        pendingCents: wallet?.pendingCents ?? 0,
        suspended: profile.suspended,
        avatarUrl: profile.avatarUrl,
      };
    });
}

export function filterDirectory(rows: AdminDirectoryRow[], tab: UserTab, query: string): AdminDirectoryRow[] {
  const needle = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (tab !== "all" && !row.roles.includes(tab)) return false;
    if (!needle) return true;
    const haystack = [row.displayName, row.email, row.phone, row.roles.join(" "), row.verification]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

function csvCell(value: string | number): string {
  const text = String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function directoryCsv(rows: AdminDirectoryRow[]): string {
  const header = [
    "Name",
    "Email",
    "Phone",
    "Roles",
    "Joined",
    "Verification",
    "Linked socials",
    "Clips",
    "Views",
    "Clip earnings (cents)",
    "Wallet available (cents)",
    "Wallet pending (cents)",
    "Suspended",
  ];
  const lines = rows.map((row) =>
    [
      row.displayName,
      row.email,
      row.phone,
      row.roles.join(" "),
      row.joinedAt,
      row.verification,
      row.socialCount,
      row.clips,
      row.views,
      row.earningsCents,
      row.availableCents,
      row.pendingCents,
      row.suspended ? "yes" : "no",
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.map(csvCell).join(","), ...lines].join("\n");
}
