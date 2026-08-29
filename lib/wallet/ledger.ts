import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret } from "@/lib/db/store";
import type { LedgerEntry, Wallet } from "@/lib/db/types";
import { mapWallet, type WalletRow } from "@/lib/db/mappers";

export async function getWallet(userId: string): Promise<Wallet> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (data) return mapWallet(data as WalletRow);

  try {
    const admin = createAdminClient();
    const { data: created, error } = await admin
      .from("wallets")
      .upsert({ user_id: userId, available_cents: 0, pending_cents: 0 })
      .select("*")
      .single();
    if (error || !created) {
      return {
        userId,
        availableCents: 0,
        pendingCents: 0,
        updatedAt: new Date().toISOString(),
      };
    }
    return mapWallet(created as WalletRow);
  } catch {
    return {
      userId,
      availableCents: 0,
      pendingCents: 0,
      updatedAt: new Date().toISOString(),
    };
  }
}

export async function adjustWallet(params: {
  userId: string;
  availableDelta: number;
  pendingDelta?: number;
  type: "credit" | "debit";
  reason: string;
  referenceType: LedgerEntry["referenceType"];
  referenceId?: string | null;
  admin?: boolean;
}): Promise<{ wallet: Wallet; entry: LedgerEntry }> {
  const client = params.admin ? createAdminClient() : await createClient();
  const { data, error } = await client.rpc("adjust_wallet", {
    p_user_id: params.userId,
    p_available_delta: params.availableDelta,
    p_pending_delta: params.pendingDelta ?? 0,
    p_type: params.type,
    p_reason: params.reason,
    p_reference_type: params.referenceType,
    p_reference_id: params.referenceId ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
  const payload = data as {
    wallet: Wallet;
    entry: LedgerEntry & { createdAt?: string };
  };
  return {
    wallet: payload.wallet,
    entry: {
      ...payload.entry,
      createdAt: payload.entry.createdAt ?? new Date().toISOString(),
      referenceId: payload.entry.referenceId ?? params.referenceId ?? null,
    },
  };
}

export { encryptSecret, decryptSecret };
