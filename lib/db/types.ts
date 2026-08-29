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

export type Profile = {
  id: string;
  email: string;
  passwordHash?: string;
  displayName: string;
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
  cpmCents: number;
  maxPayoutPerSubmissionCents: number;
  platforms: SocialPlatform[];
  requirements: string;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Submission = {
  id: string;
  campaignId: string;
  clipperId: string;
  postUrl: string;
  platform: SocialPlatform;
  status: SubmissionStatus;
  reviewNote: string | null;
  views: number;
  earningsCents: number;
  createdAt: string;
  updatedAt: string;
};

export type ViewSnapshot = {
  id: string;
  submissionId: string;
  views: number;
  recordedAt: string;
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
};
