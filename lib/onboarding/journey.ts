import type {
  DatabaseStore,
  JourneyMomentId,
  Profile,
} from "@/lib/db/types";
import { isLegacyAccount } from "@/lib/onboarding/model";
import type { UserRole } from "@/types/enums";

export type JourneyAudience = "brand" | "creator" | "admin";

export type JourneyMoment = {
  id: JourneyMomentId;
  audience: JourneyAudience;
  title: string;
  help: string;
  steps: string[];
  href: string;
  cta: string;
  emptyTitle: string;
  emptyDescription: string;
};

export const JOURNEY_MOMENTS: JourneyMoment[] = [
  {
    id: "first_campaign",
    audience: "brand",
    title: "Create your first campaign",
    help: "A campaign is the brief creators clip against. It stays a draft until you fund it and set it live.",
    steps: [
      "Name the campaign and say what to promote.",
      "Set the rate per 1,000 views, the budget, and the per-clip cap.",
      "Save the draft. Nothing is charged yet.",
    ],
    href: "/dashboard/brand/campaigns/new",
    cta: "Create campaign",
    emptyTitle: "No campaigns yet",
    emptyDescription: "Create a draft with a rate, a budget, and the rules. You can fund it after it is saved.",
  },
  {
    id: "campaign_funded",
    audience: "brand",
    title: "Fund the campaign",
    help: "Pay in by bank transfer. An admin confirms the amount before it reaches your wallet. There is no card checkout.",
    steps: [
      "Copy your payment reference and send the EFT.",
      "Request confirmation for the amount you transferred.",
      "Wait for an admin to credit the wallet. Then you can go live.",
    ],
    href: "/dashboard/brand/deposits",
    cta: "Request confirmation",
    emptyTitle: "No transfer requested yet",
    emptyDescription: "After you send the EFT, request confirmation here. An admin credits the wallet by hand.",
  },
  {
    id: "campaign_live",
    audience: "brand",
    title: "Set the campaign live",
    help: "Going live spends the wallet balance into the campaign budget and lets creators submit clips.",
    steps: [
      "Open the draft campaign.",
      "Check the wallet covers the budget.",
      "Activate it. Creators can then submit links.",
    ],
    href: "/dashboard/brand/campaigns",
    cta: "Open campaigns",
    emptyTitle: "Nothing is live yet",
    emptyDescription: "Activate a funded draft when you want creators to start posting.",
  },
  {
    id: "first_review",
    audience: "brand",
    title: "Review the first clip",
    help: "Approve clips that follow the brief. Reject the ones that do not. Approved clips can earn after a view check.",
    steps: [
      "Open the submission queue.",
      "Watch the post and read the brief.",
      "Approve or reject it, with a short note if you reject.",
    ],
    href: "/dashboard/brand/campaigns",
    cta: "Review clips",
    emptyTitle: "No clips to review",
    emptyDescription: "When a creator submits a link, it lands here for approval or rejection.",
  },
  {
    id: "first_submission",
    audience: "creator",
    title: "Submit your first clip",
    help: "Post on a connected account, then paste the public link. Pick which account the clip came from.",
    steps: [
      "Open a live campaign and read the rules.",
      "Post the clip on TikTok, Reels, Shorts, or X.",
      "Submit the link and choose the account you posted from.",
    ],
    href: "/dashboard/clipper/campaigns",
    cta: "Find a campaign",
    emptyTitle: "No clips submitted",
    emptyDescription: "Join a live campaign, post the clip, and send the link in for review.",
  },
  {
    id: "first_review",
    audience: "creator",
    title: "Wait for the first review",
    help: "The brand approves or rejects each clip. You will see the result on Submissions.",
    steps: [
      "Open Submissions.",
      "Pending means the brand has not decided yet.",
      "Approved clips can earn. Rejected clips include the note.",
    ],
    href: "/dashboard/clipper/submissions",
    cta: "See submissions",
    emptyTitle: "Nothing in review",
    emptyDescription: "Submit a clip first. The brand decision shows up on this list.",
  },
  {
    id: "first_earning",
    audience: "creator",
    title: "See your first earnings",
    help: "An admin records qualified views. Earnings are calculated from the campaign rate and added to your wallet.",
    steps: [
      "The clip must be approved.",
      "An admin enters the view count.",
      "The wallet updates from the rate per 1,000 views, up to the caps.",
    ],
    href: "/dashboard/clipper/earnings",
    cta: "Open earnings",
    emptyTitle: "No earnings yet",
    emptyDescription: "Earnings appear after a clip is approved and an admin records its views.",
  },
  {
    id: "first_withdrawal",
    audience: "creator",
    title: "Request your first payout",
    help: "Withdrawals are paid by an admin as a manual EFT. The minimum is N$100.",
    steps: [
      "Save your bank details under Payout method.",
      "Request a withdrawal from the available balance.",
      "An admin sends the EFT and marks it paid.",
    ],
    href: "/dashboard/settings/withdraw",
    cta: "Request payout",
    emptyTitle: "No payout requested",
    emptyDescription: "When the wallet is at least N$100, request an EFT. An admin pays it manually.",
  },
  {
    id: "admin_payin",
    audience: "admin",
    title: "Confirm the first pay-in",
    help: "Brands transfer by EFT and request confirmation. Crediting the wallet is a manual step. Do not mark it paid until the transfer is in the account.",
    steps: [
      "Open Pay-ins and match the reference and amount.",
      "Confirm the transfer to credit the brand wallet.",
      "The brand can then set the campaign live.",
    ],
    href: "/dashboard/admin/payins",
    cta: "Open pay-ins",
    emptyTitle: "No pay-ins waiting",
    emptyDescription: "Brand transfer requests show up here. Confirm one to credit the wallet.",
  },
  {
    id: "admin_view_check",
    audience: "admin",
    title: "Record the first view check",
    help: "Enter the qualified view count on an approved clip. Earnings are calculated automatically from the campaign rate.",
    steps: [
      "Open View checks.",
      "Pick an approved clip and enter the view count.",
      "Save. The creator wallet updates from the CPM math.",
    ],
    href: "/dashboard/admin/views",
    cta: "Record views",
    emptyTitle: "No view check yet",
    emptyDescription: "Approved clips wait here. Enter views and earnings are credited automatically.",
  },
];

export type JourneyFacts = {
  role: UserRole;
  legacy: boolean;
  dismissed: JourneyMomentId[];
  campaignCount: number;
  creditedDeposit: boolean;
  pendingDeposit: boolean;
  liveCampaign: boolean;
  submissionCount: number;
  reviewedCount: number;
  earningsCents: number;
  withdrawalCount: number;
  confirmedPayins: number;
  adminViewChecks: number;
};

export function journeyFactsFromStore(
  store: DatabaseStore,
  profile: Profile,
  role: UserRole,
): JourneyFacts {
  const campaigns = (store.campaigns ?? []).filter(
    (campaign) =>
      campaign.brandId === profile.id ||
      (campaign.workspaceId &&
        (store.workspaceMembers ?? []).some(
          (member) =>
            member.workspaceId === campaign.workspaceId &&
            member.userId === profile.id &&
            member.status === "active",
        )),
  );
  const submissions = (store.submissions ?? []).filter((submission) => submission.clipperId === profile.id);
  const brandSubmissionIds = new Set(
    (store.submissions ?? [])
      .filter((submission) => campaigns.some((campaign) => campaign.id === submission.campaignId))
      .filter((submission) => submission.status === "approved" || submission.status === "rejected")
      .map((submission) => submission.id),
  );
  const deposits = (store.brandDeposits ?? []).filter((deposit) => deposit.brandId === profile.id);
  const earningsCents = submissions.reduce((sum, submission) => sum + submission.earningsCents, 0);
  return {
    role,
    legacy: isLegacyAccount(profile),
    dismissed: profile.journey?.dismissed ?? [],
    campaignCount: campaigns.length,
    creditedDeposit: deposits.some((deposit) => deposit.status === "credited"),
    pendingDeposit: deposits.some((deposit) => deposit.status === "pending"),
    liveCampaign: campaigns.some((campaign) => campaign.status === "active"),
    submissionCount: submissions.length,
    reviewedCount:
      role === "brand"
        ? brandSubmissionIds.size
        : submissions.filter((submission) => submission.status === "approved" || submission.status === "rejected")
            .length,
    earningsCents,
    withdrawalCount: (store.withdrawalRequests ?? []).filter((request) => request.userId === profile.id).length,
    confirmedPayins: (store.brandDeposits ?? []).filter((deposit) => deposit.confirmedBy === profile.id).length,
    adminViewChecks: (store.viewSnapshots ?? []).filter((snapshot) => snapshot.source === "admin").length,
  };
}

export function momentIsDone(moment: JourneyMoment, facts: JourneyFacts): boolean {
  switch (moment.id) {
    case "first_campaign":
      return facts.campaignCount > 0;
    case "campaign_funded":
      return facts.creditedDeposit || facts.liveCampaign;
    case "campaign_live":
      return facts.liveCampaign;
    case "first_submission":
      return facts.submissionCount > 0;
    case "first_review":
      return facts.reviewedCount > 0 || facts.earningsCents > 0;
    case "first_earning":
      return facts.earningsCents > 0 || facts.withdrawalCount > 0;
    case "first_withdrawal":
      return facts.withdrawalCount > 0;
    case "admin_payin":
      return facts.confirmedPayins > 0;
    case "admin_view_check":
      return facts.adminViewChecks > 0;
    default:
      return false;
  }
}

export function audienceForRole(role: UserRole): JourneyAudience {
  if (role === "brand") return "brand";
  if (role === "admin") return "admin";
  return "creator";
}

export function openJourneyMoment(facts: JourneyFacts): JourneyMoment | null {
  if (facts.legacy && facts.role !== "admin") return null;
  const audience = audienceForRole(facts.role);
  return (
    JOURNEY_MOMENTS.find(
      (moment) =>
        moment.audience === audience &&
        !facts.dismissed.includes(moment.id) &&
        !momentIsDone(moment, facts),
    ) ?? null
  );
}

export function journeyEmpty(
  facts: JourneyFacts,
  id: JourneyMomentId,
): { title: string; description: string; href: string; cta: string } | null {
  const moment = openJourneyMoment(facts);
  if (!moment || moment.id !== id) return null;
  return {
    title: moment.emptyTitle,
    description: moment.emptyDescription,
    href: moment.href,
    cta: moment.cta,
  };
}

export function collectJourneyCopy(): string[] {
  const lines: string[] = [];
  for (const moment of JOURNEY_MOMENTS) {
    lines.push(moment.title, moment.help, moment.cta, moment.emptyTitle, moment.emptyDescription, ...moment.steps);
  }
  return lines;
}
