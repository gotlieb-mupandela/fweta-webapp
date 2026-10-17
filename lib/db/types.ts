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
  /** Collected on the first payout, not at signup. */
  kyc?: {
    legalName: string;
    idNumberEnc: string;
    country: string;
    submittedAt: string;
  } | null;
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
  /** Reference links (footage, guides). Not Whop assets. */
  assets: CampaignAsset[];
  startDate: string | null;
  endDate: string | null;
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
  source: "admin" | "bulk" | "creator";
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
    | "withdrawal"
    | "booking_escrow"
    | "booking_release"
    | "booking_refund"
    | "brand_deposit";
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
};

export type FraudFlag = {
  id: string;
  submissionId: string;
  reason: string;
  status: "open" | "resolved" | "dismissed";
  kind: "manual" | "score";
  score: number | null;
  appealNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
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
  linkedAccounts: LinkedSocialAccount[];
};
