import type {
  AccountType,
  BookingStatus,
  CampaignStatus,
  CampaignType,
  SocialPlatform,
  SubmissionStatus,
  UserRole,
  WithdrawalStatus,
} from "@/types/enums";

export type ProfileSocials = {
  tiktok?: string;
  youtube?: string;
  instagram?: string;
  x?: string;
};

export type OnboardingStepId =
  | "name"
  | "interests"
  | "socials"
  | "payout"
  | "company"
  | "promote"
  | "campaign"
  | "deposit"
  | "tour"
  | "discover";

export type OnboardingSocialCheck = {
  platform: SocialPlatform;
  handle: string;
  code: string;
  status: "pending" | "verified";
  verifiedAt?: string | null;
};

/** Resume state for signup setup. Lives on the profile so it ports with the store. */
export type JourneyMomentId =
  | "first_campaign"
  | "campaign_funded"
  | "campaign_live"
  | "first_submission"
  | "first_review"
  | "first_earning"
  | "first_withdrawal"
  | "admin_payin"
  | "admin_view_check";

export type JourneyState = {
  dismissed: JourneyMomentId[];
};

export type OnboardingDraft = {
  version: 1;
  stepId: OnboardingStepId;
  completed: OnboardingStepId[];
  skipped: OnboardingStepId[];
  firstName: string;
  lastName: string;
  phone: string;
  interests: string[];
  location: string;
  companyName: string;
  website: string;
  promote: string;
  socials: ProfileSocials;
  brandSocials: ProfileSocials;
  checks: OnboardingSocialCheck[];
  payoutSaved: boolean;
  campaignId: string | null;
  minViews: number | null;
  depositSeen: boolean;
  productTourSeen: boolean;
  checklistDismissed: boolean;
  updatedAt: string;
};

export type Profile = {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  companyName?: string;
  website?: string;
  niche?: string;
  location?: string;
  primaryPlatform?: SocialPlatform;
  socials?: ProfileSocials;
  /** `null` = must finish onboarding. Missing/undefined = legacy (skip). */
  onboardingCompletedAt?: string | null;
  /** Step progress. Missing on legacy accounts. */
  onboarding?: OnboardingDraft;
  /** Brand workspace currently open in the switcher. */
  activeWorkspaceId?: string | null;
  /** First-run moments the user has dismissed. */
  journey?: JourneyState;
  bio: string;
  avatarUrl: string | null;
  roles: UserRole[];
  primaryRole: UserRole;
  notifyEmail: boolean;
  notifyWithdrawals: boolean;
  notifyBookings: boolean;
  createdAt: string;
  updatedAt: string;
  suspended: boolean;
  /** Stable code other people can enter at signup. */
  referralCode?: string;
  /** Profile id of the person who referred this account. */
  referredByUserId?: string | null;
  /** True once the referrer has been paid for this account's first approved clip. */
  referralRewarded?: boolean;
  /** Collected on the first payout, not at signup. */
  kyc?: {
    legalName: string;
    idNumberEnc: string;
    country: string;
    submittedAt: string;
    /** Filename in data/kyc. Never a public URL. */
    documentPath?: string | null;
    status?: "pending" | "verified" | "rejected";
    reviewedAt?: string | null;
    reviewNote?: string | null;
  } | null;
  /** Bumped on password change so older session cookies stop working. */
  credentialVersion?: number;
};

export type CampaignAsset = {
  id: string;
  label: string;
  url: string;
};

export type Campaign = {
  id: string;
  brandId: string;
  title: string;
  description: string;
  type: CampaignType;
  category: string;
  status: CampaignStatus;
  budgetTotalCents: number;
  budgetSpentCents: number;
  /** Pay per 1,000 verified views. */
  cpmCents: number;
  /** Clip stays out of the review queue until estimated earnings reach this. 0 = review immediately. */
  minPayoutCents: number;
  /** Qualified views (after the submission baseline) required before review. */
  minViews: number;
  /** CPM pays per 1,000 views. A pool splits the reserved budget at the close. */
  payModel: "cpm" | "pool";
  /** ISO country codes whose audience the brand is paying for. */
  countries: string[];
  /** Platform fee cash locked at launch. Charged only as views are paid. */
  feeReservedCents: number;
  /** Portion of the fee reserve kept because views were delivered. */
  feeChargedCents: number;
  /** Fee cash already returned to the brand. */
  feeRefundedCents: number;
  /** Creator budget already returned to the brand. */
  unspentReturnedCents: number;
  poolSettledAt: string | null;
  /** Set once accrual has stopped and unused cash has been returned. */
  closedAt: string | null;
  maxPayoutPerSubmissionCents: number;
  platforms: SocialPlatform[];
  /** What to make — shown on the campaign page. */
  requirements: string;
  /** Checkable rules the brand can reject against. */
  rules: string;
  /** Reference links (footage, guides). */
  assets: CampaignAsset[];
  /** Suggested caption. Shown next to the required tags. */
  captionGuide?: string;
  /** Tags the clipper must include. Stored without a leading hash. */
  hashtags?: string[];
  /** Checklist the clipper confirms before submit. */
  requiredChecks?: string[];
  /** Fee rate locked when the budget was reserved. Missing means the default 10%. */
  feeBps?: number;
  startDate: string | null;
  endDate: string | null;
  /** Set when the campaign belongs to a brand workspace. Missing on older rows. */
  workspaceId?: string | null;
  /** Set when unused budget has been returned. Further view credits stop. */
  settledAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PayoutState = "none" | "reserved" | "holding" | "released" | "clawed_back";

export type FraudState = "clear" | "review" | "appealed" | "dismissed" | "upheld";

export type Submission = {
  id: string;
  campaignId: string;
  clipperId: string;
  postUrl: string;
  platform: SocialPlatform;
  status: SubmissionStatus;
  reviewNote: string | null;
  /** Latest observed view count. */
  views: number;
  /** Views observed when the clip was submitted. Only growth after this is paid. */
  baselineViews: number | null;
  /** Views that count toward pay. Frozen when the 7-day earning window ends. */
  payableViews: number;
  /** Set aside in the pending wallet. Not a bank payout. */
  reservedCents: number;
  /** Moved from pending to available after the hold, if the post was still live. */
  releasedCents: number;
  /** Reserved plus released. Kept so older screens can show one earnings figure. */
  earningsCents: number;
  approvedAt: string | null;
  earningUntil: string | null;
  holdUntil: string | null;
  releasedAt: string | null;
  payoutState: PayoutState;
  nextPollAt: string | null;
  lastPolledAt: string | null;
  postLive: boolean | null;
  likes: number | null;
  comments: number | null;
  fraudScore: number;
  fraudState: FraudState;
  /** Plain reasons shown to the clipper. No weights. */
  fraudReasons: string[];
  appealUsed: boolean;
  /** Verified social account the clip was posted from. */
  socialAccountId?: string | null;
  /** Required checks the clipper ticked at submit. */
  confirmedChecks?: string[];
  createdAt: string;
  updatedAt: string;
};

export type LinkedSocialAccount = {
  id: string;
  userId: string;
  platform: SocialPlatform;
  handle: string;
  bioCode: string;
  verifiedAt: string | null;
  checkSource: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ViewSnapshot = {
  id: string;
  submissionId: string;
  views: number;
  likes: number | null;
  comments: number | null;
  note: string | null;
  /** Filename in data/view-screenshots. Never a public bucket URL. */
  screenshotPath: string | null;
  recordedAt: string;
  /** Admin who confirmed the count. Null while a creator report is waiting. */
  checkedBy: string | null;
  /** `job` is a background poll. Older rows may omit this and still mean a poll. */
  source: "admin" | "bulk" | "creator" | "job";
  status: "confirmed" | "pending" | "replaced";
};

export type Wallet = {
  userId: string;
  availableCents: number;
  pendingCents: number;
  updatedAt: string;
};

export type LedgerEntry = {
  id: string;
  userId: string;
  amountCents: number;
  type: "credit" | "debit";
  reason: string;
  referenceType:
    | "admin_credit"
    | "campaign_earning"
    | "campaign_reserve"
    | "campaign_release"
    | "campaign_clawback"
    | "campaign_fee"
    | "campaign_fund"
    | "campaign_settlement"
    | "withdrawal"
    | "booking_escrow"
    | "booking_release"
    | "booking_refund"
    | "brand_deposit"
    | "referral_bonus"
    | "prize_award";
  referenceId: string | null;
  balanceAfterAvailableCents: number;
  balanceAfterPendingCents: number;
  createdAt: string;
};

export type PayoutMethod = {
  id: string;
  userId: string;
  bankName: string;
  branchCode: string;
  /** Encrypted-at-rest style obfuscation for local store */
  accountNumberEnc: string;
  accountHolderName: string;
  accountType: AccountType;
  createdAt: string;
  updatedAt: string;
};

export type WithdrawalRequest = {
  id: string;
  userId: string;
  payoutMethodId: string;
  amountCents: number;
  status: WithdrawalStatus;
  bankReference: string | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
};

export type InfluencerProfile = {
  id: string;
  userId: string;
  slug: string;
  displayName: string;
  headline: string;
  bio: string;
  niche: string;
  location: string;
  avatarUrl: string | null;
  socials: {
    tiktok?: string;
    youtube?: string;
    instagram?: string;
    x?: string;
  };
  featuredWork: string[];
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RateCardItem = {
  id: string;
  influencerProfileId: string;
  title: string;
  description: string;
  type: "per_post" | "per_reel" | "per_1k_views" | "package" | "ugc_flat";
  platform: SocialPlatform | "multi";
  priceCents: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Booking = {
  id: string;
  brandId: string;
  influencerId: string;
  influencerProfileId: string;
  rateCardItemId: string;
  amountCents: number;
  brief: string;
  deliverableUrl: string | null;
  status: BookingStatus;
  createdAt: string;
  updatedAt: string;
};

export type BrandDeposit = {
  id: string;
  brandId: string;
  amountCents: number;
  note: string;
  status: "pending" | "credited";
  createdAt: string;
  confirmedAt?: string | null;
  confirmedBy?: string | null;
};

export type SocialAccount = {
  id: string;
  userId: string;
  platform: SocialPlatform;
  handle: string;
  code: string;
  /** pending: code not sent for review. review: admin queue. rejected: admin said no. */
  status: "pending" | "review" | "verified" | "rejected";
  isDefault: boolean;
  verifiedAt: string | null;
  /** Set when the creator taps I've added it. */
  reviewRequestedAt?: string | null;
  rejectionReason?: string | null;
  /** Optional public-page hint. Never a substitute for the admin decision. */
  bioHint?: "match" | "missing" | "unread" | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceRole = "owner" | "manager" | "viewer";

export type Workspace = {
  id: string;
  name: string;
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceMember = {
  id: string;
  workspaceId: string;
  userId: string | null;
  email: string;
  role: WorkspaceRole;
  status: "invited" | "active";
  createdAt: string;
  updatedAt: string;
};

export type FraudCategory = "view_spike" | "duplicate" | "ownership" | "paid_promotion" | "other";

export type FraudFlag = {
  id: string;
  submissionId: string;
  reason: string;
  status: "open" | "resolved" | "dismissed";
  kind: "manual" | "score";
  score: number | null;
  appealNote: string | null;
  /** Reason category shown in the review queue. */
  category?: FraudCategory;
  createdAt: string;
  resolvedAt: string | null;
};

export type SavedCampaign = {
  id: string;
  userId: string;
  campaignId: string;
  createdAt: string;
};

export type SupportTicket = {
  id: string;
  userId: string;
  subject: string;
  status: "open" | "answered" | "closed";
  createdAt: string;
  updatedAt: string;
};

export type SupportMessage = {
  id: string;
  ticketId: string;
  authorId: string;
  body: string;
  createdAt: string;
};

export type AuditLogEntry = {
  id: string;
  actorId: string;
  action: string;
  summary: string;
  targetType: string;
  targetId: string | null;
  createdAt: string;
};

export type PrizeAward = {
  id: string;
  weekKey: string;
  userId: string;
  place: number;
  amountCents: number;
  createdAt: string;
};

export type PlatformSetting = {
  id: "default";
  platformFeeBps: number;
  updatedAt: string;
  updatedBy: string | null;
};

export type NotificationKind =
  | "welcome"
  | "campaign_live"
  | "campaign_budget_low"
  | "submission_approved"
  | "submission_rejected"
  | "booking_requested"
  | "booking_accepted"
  | "booking_declined"
  | "booking_completed"
  | "withdrawal_requested"
  | "withdrawal_paid"
  | "withdrawal_rejected"
  | "deposit_confirmed"
  | "workspace_invite"
  | "campaign_match"
  | "support_reply"
  | "kyc_reviewed"
  | "prize_awarded"
  | "referral_bonus"
  | "account_reviewed";

export type AppNotification = {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

/** Idempotency record so a repeated event (re-activating a campaign) does not notify twice. */
export type NotificationDispatch = {
  id: string;
  dedupeKey: string;
  createdAt: string;
};

export type DatabaseStore = {
  profiles: Profile[];
  campaigns: Campaign[];
  submissions: Submission[];
  viewSnapshots: ViewSnapshot[];
  wallets: Wallet[];
  ledgerEntries: LedgerEntry[];
  payoutMethods: PayoutMethod[];
  withdrawalRequests: WithdrawalRequest[];
  influencerProfiles: InfluencerProfile[];
  rateCards: RateCardItem[];
  bookings: Booking[];
  brandDeposits: BrandDeposit[];
  fraudFlags: FraudFlag[];
  notifications: AppNotification[];
  notificationDispatches: NotificationDispatch[];
  linkedAccounts: LinkedSocialAccount[];
  socialAccounts: SocialAccount[];
  workspaces: Workspace[];
  workspaceMembers: WorkspaceMember[];
  savedCampaigns: SavedCampaign[];
  supportTickets: SupportTicket[];
  supportMessages: SupportMessage[];
  auditLog: AuditLogEntry[];
  prizeAwards: PrizeAward[];
  platformSettings: PlatformSetting[];
};
