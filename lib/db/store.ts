import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { DatabaseStore } from "@/lib/db/types";
import {
  mapBooking,
  mapBrandDeposit,
  mapCampaign,
  mapFraudFlag,
  mapInfluencerProfile,
  mapLedger,
  mapPayoutMethod,
  mapProfile,
  mapRateCard,
  mapSubmission,
  mapViewSnapshot,
  mapWallet,
  mapWithdrawal,
  type BookingRow,
  type BrandDepositRow,
  type CampaignRow,
  type FraudFlagRow,
  type InfluencerProfileRow,
  type LedgerRow,
  type PayoutMethodRow,
  type ProfileRow,
  type RateCardRow,
  type SubmissionRow,
  type ViewSnapshotRow,
  type WalletRow,
  type WithdrawalRow,
} from "@/lib/db/mappers";

const emptyStore = (): DatabaseStore => ({
  profiles: [],
  campaigns: [],
  submissions: [],
  viewSnapshots: [],
  wallets: [],
  ledgerEntries: [],
  payoutMethods: [],
  withdrawalRequests: [],
  influencerProfiles: [],
  rateCards: [],
  bookings: [],
  brandDeposits: [],
  fraudFlags: [],
});

async function loadStore(supabase: SupabaseClient): Promise<DatabaseStore> {
  const [
    profiles,
    campaigns,
    submissions,
    viewSnapshots,
    wallets,
    ledgerEntries,
    payoutMethods,
    withdrawalRequests,
    influencerProfiles,
    rateCards,
    bookings,
    brandDeposits,
    fraudFlags,
  ] = await Promise.all([
    supabase.from("profiles").select("*"),
    supabase.from("campaigns").select("*"),
    supabase.from("submissions").select("*"),
    supabase.from("view_snapshots").select("*"),
    supabase.from("wallets").select("*"),
    supabase.from("ledger_entries").select("*"),
    supabase.from("payout_methods").select("*"),
    supabase.from("withdrawal_requests").select("*"),
    supabase.from("influencer_profiles").select("*"),
    supabase.from("rate_cards").select("*"),
    supabase.from("bookings").select("*"),
    supabase.from("brand_deposits").select("*"),
    supabase.from("fraud_flags").select("*"),
  ]);

  return {
    profiles: ((profiles.data ?? []) as ProfileRow[]).map(mapProfile),
    campaigns: ((campaigns.data ?? []) as CampaignRow[]).map(mapCampaign),
    submissions: ((submissions.data ?? []) as SubmissionRow[]).map(mapSubmission),
    viewSnapshots: ((viewSnapshots.data ?? []) as ViewSnapshotRow[]).map(mapViewSnapshot),
    wallets: ((wallets.data ?? []) as WalletRow[]).map(mapWallet),
    ledgerEntries: ((ledgerEntries.data ?? []) as LedgerRow[]).map(mapLedger),
    payoutMethods: ((payoutMethods.data ?? []) as PayoutMethodRow[]).map(mapPayoutMethod),
    withdrawalRequests: ((withdrawalRequests.data ?? []) as WithdrawalRow[]).map(
      mapWithdrawal,
    ),
    influencerProfiles: ((influencerProfiles.data ?? []) as InfluencerProfileRow[]).map(
      mapInfluencerProfile,
    ),
    rateCards: ((rateCards.data ?? []) as RateCardRow[]).map(mapRateCard),
    bookings: ((bookings.data ?? []) as BookingRow[]).map(mapBooking),
    brandDeposits: ((brandDeposits.data ?? []) as BrandDepositRow[]).map(mapBrandDeposit),
    fraudFlags: ((fraudFlags.data ?? []) as FraudFlagRow[]).map(mapFraudFlag),
  };
}

export async function readStore(opts?: { admin?: boolean }): Promise<DatabaseStore> {
  if (opts?.admin) {
    return loadStore(createAdminClient());
  }
  try {
    return loadStore(await createClient());
  } catch {
    return emptyStore();
  }
}

function deriveKey() {
  const secret =
    process.env.PAYOUT_ENCRYPTION_KEY ||
    process.env.AUTH_SECRET ||
    "fweta-local-dev-secret-change-me";
  return scryptSync(secret, "fweta-payout-salt", 32);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
