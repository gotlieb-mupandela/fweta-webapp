/** Shared domain enums — expand when database schema is defined. */

export type UserRole = "brand" | "influencer" | "clipper" | "admin";

export type CampaignType = "clipping" | "ugc";

export type CampaignStatus = "draft" | "pending" | "active" | "paused" | "completed";

export type SubmissionStatus = "pending" | "approved" | "flagged" | "rejected";

export type BookingStatus =
  | "requested"
  | "accepted"
  | "in_progress"
  | "delivered"
  | "approved"
  | "cancelled";

export type WithdrawalStatus = "pending" | "processing" | "paid" | "rejected";

export type AccountType = "cheque" | "savings" | "transmission";

export type SocialPlatform = "tiktok" | "youtube" | "instagram" | "x";
