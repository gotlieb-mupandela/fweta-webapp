import type {
  Booking,
  BrandDeposit,
  Campaign,
  FraudFlag,
  InfluencerProfile,
  LedgerEntry,
  PayoutMethod,
  Profile,
  RateCardItem,
  Submission,
  ViewSnapshot,
  Wallet,
  WithdrawalRequest,
} from "@/lib/db/types";
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

export type ProfileRow = {
  id: string;
  email: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  roles: UserRole[];
  primary_role: UserRole;
  notify_email: boolean;
  notify_withdrawals: boolean;
  notify_bookings: boolean;
  suspended: boolean;
  created_at: string;
  updated_at: string;
};

export type CampaignRow = {
  id: string;
  brand_id: string;
  title: string;
  description: string;
  type: CampaignType;
  category: string;
  status: CampaignStatus;
  budget_total_cents: number;
  budget_spent_cents: number;
  cpm_cents: number;
  max_payout_per_submission_cents: number;
  platforms: SocialPlatform[];
  requirements: string;
  end_date: string | null;
  created_at: string;
  updated_at: string;
};

export type SubmissionRow = {
  id: string;
  campaign_id: string;
  clipper_id: string;
  post_url: string;
  platform: SocialPlatform;
  status: SubmissionStatus;
  review_note: string | null;
  views: number;
  earnings_cents: number;
  created_at: string;
  updated_at: string;
};

export type ViewSnapshotRow = {
  id: string;
  submission_id: string;
  views: number;
  recorded_at: string;
};

export type WalletRow = {
  user_id: string;
  available_cents: number;
  pending_cents: number;
  updated_at: string;
};

export type LedgerRow = {
  id: string;
  user_id: string;
  amount_cents: number;
  type: "credit" | "debit";
  reason: string;
  reference_type: LedgerEntry["referenceType"];
  reference_id: string | null;
  balance_after_available_cents: number;
  balance_after_pending_cents: number;
  created_at: string;
};

export type PayoutMethodRow = {
  id: string;
  user_id: string;
  bank_name: string;
  branch_code: string;
  account_number_enc: string;
  account_holder_name: string;
  account_type: AccountType;
  created_at: string;
  updated_at: string;
};

export type WithdrawalRow = {
  id: string;
  user_id: string;
  payout_method_id: string;
  amount_cents: number;
  status: WithdrawalStatus;
  bank_reference: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
};

export type InfluencerProfileRow = {
  id: string;
  user_id: string;
  slug: string;
  display_name: string;
  headline: string;
  bio: string;
  niche: string;
  location: string;
  avatar_url: string | null;
  socials: InfluencerProfile["socials"] | null;
  featured_work: string[] | null;
  published: boolean;
  created_at: string;
  updated_at: string;
};

export type RateCardRow = {
  id: string;
  influencer_profile_id: string;
  title: string;
  description: string;
  type: RateCardItem["type"];
  platform: RateCardItem["platform"];
  price_cents: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type BookingRow = {
  id: string;
  brand_id: string;
  influencer_id: string;
  influencer_profile_id: string;
  rate_card_item_id: string;
  amount_cents: number;
  brief: string;
  deliverable_url: string | null;
  status: BookingStatus;
  created_at: string;
  updated_at: string;
};

export type BrandDepositRow = {
  id: string;
  brand_id: string;
  amount_cents: number;
  note: string;
  status: BrandDeposit["status"];
  created_at: string;
};

export type FraudFlagRow = {
  id: string;
  submission_id: string;
  reason: string;
  status: FraudFlag["status"];
  created_at: string;
  resolved_at: string | null;
};

export function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email,
    passwordHash: "",
    displayName: row.display_name,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    roles: row.roles ?? [],
    primaryRole: row.primary_role,
    notifyEmail: row.notify_email,
    notifyWithdrawals: row.notify_withdrawals,
    notifyBookings: row.notify_bookings,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    suspended: row.suspended,
  };
}

export function mapCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    brandId: row.brand_id,
    title: row.title,
    description: row.description,
    type: row.type,
    category: row.category,
    status: row.status,
    budgetTotalCents: row.budget_total_cents,
    budgetSpentCents: row.budget_spent_cents,
    cpmCents: row.cpm_cents,
    maxPayoutPerSubmissionCents: row.max_payout_per_submission_cents,
    platforms: row.platforms ?? [],
    requirements: row.requirements,
    endDate: row.end_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSubmission(row: SubmissionRow): Submission {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    clipperId: row.clipper_id,
    postUrl: row.post_url,
    platform: row.platform,
    status: row.status,
    reviewNote: row.review_note,
    views: row.views,
    earningsCents: row.earnings_cents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapViewSnapshot(row: ViewSnapshotRow): ViewSnapshot {
  return {
    id: row.id,
    submissionId: row.submission_id,
    views: row.views,
    recordedAt: row.recorded_at,
  };
}

export function mapWallet(row: WalletRow): Wallet {
  return {
    userId: row.user_id,
    availableCents: row.available_cents,
    pendingCents: row.pending_cents,
    updatedAt: row.updated_at,
  };
}

export function mapLedger(row: LedgerRow): LedgerEntry {
  return {
    id: row.id,
    userId: row.user_id,
    amountCents: row.amount_cents,
    type: row.type,
    reason: row.reason,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    balanceAfterAvailableCents: row.balance_after_available_cents,
    balanceAfterPendingCents: row.balance_after_pending_cents,
    createdAt: row.created_at,
  };
}

export function mapPayoutMethod(row: PayoutMethodRow): PayoutMethod {
  return {
    id: row.id,
    userId: row.user_id,
    bankName: row.bank_name,
    branchCode: row.branch_code,
    accountNumberEnc: row.account_number_enc,
    accountHolderName: row.account_holder_name,
    accountType: row.account_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapWithdrawal(row: WithdrawalRow): WithdrawalRequest {
  return {
    id: row.id,
    userId: row.user_id,
    payoutMethodId: row.payout_method_id,
    amountCents: row.amount_cents,
    status: row.status,
    bankReference: row.bank_reference,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    paidAt: row.paid_at,
  };
}

export function mapInfluencerProfile(row: InfluencerProfileRow): InfluencerProfile {
  return {
    id: row.id,
    userId: row.user_id,
    slug: row.slug,
    displayName: row.display_name,
    headline: row.headline,
    bio: row.bio,
    niche: row.niche,
    location: row.location,
    avatarUrl: row.avatar_url,
    socials: row.socials ?? {},
    featuredWork: row.featured_work ?? [],
    published: row.published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRateCard(row: RateCardRow): RateCardItem {
  return {
    id: row.id,
    influencerProfileId: row.influencer_profile_id,
    title: row.title,
    description: row.description,
    type: row.type,
    platform: row.platform,
    priceCents: row.price_cents,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    brandId: row.brand_id,
    influencerId: row.influencer_id,
    influencerProfileId: row.influencer_profile_id,
    rateCardItemId: row.rate_card_item_id,
    amountCents: row.amount_cents,
    brief: row.brief,
    deliverableUrl: row.deliverable_url,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapBrandDeposit(row: BrandDepositRow): BrandDeposit {
  return {
    id: row.id,
    brandId: row.brand_id,
    amountCents: row.amount_cents,
    note: row.note,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function mapFraudFlag(row: FraudFlagRow): FraudFlag {
  return {
    id: row.id,
    submissionId: row.submission_id,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}
