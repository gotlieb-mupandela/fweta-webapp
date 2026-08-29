"use server";

import { revalidatePath } from "next/cache";

import { getSession, requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  decryptSecret,
  encryptSecret,
} from "@/lib/db/store";
import {
  mapLedger,
  mapPayoutMethod,
  mapWithdrawal,
  type LedgerRow,
  type PayoutMethodRow,
  type WithdrawalRow,
} from "@/lib/db/mappers";
import { adjustWallet, getWallet } from "@/lib/wallet/ledger";
import { payoutMethodSchema } from "@/lib/validations/payout-method";
import { withdrawalSchema } from "@/lib/validations/withdrawal";
import { maskAccountNumber } from "@/lib/utils";

const MIN_WITHDRAWAL_CENTS = 10000; // N$100

export async function getMyWallet() {
  const session = await requireSession();
  return getWallet(session.id);
}

export async function getMyLedger() {
  const session = await requireSession();
  const supabase = await createClient();
  const { data } = await supabase
    .from("ledger_entries")
    .select("*")
    .eq("user_id", session.id)
    .order("created_at", { ascending: false });
  return ((data ?? []) as LedgerRow[]).map(mapLedger);
}

export async function adminCreditWalletAction(userId: string, amountCents: number, reason: string) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };
  if (amountCents <= 0) return { ok: false as const, error: "Amount must be positive." };
  await adjustWallet({
    userId,
    availableDelta: amountCents,
    type: "credit",
    reason: reason || "Admin credit",
    referenceType: "admin_credit",
  });
  revalidatePath("/dashboard/admin");
  return { ok: true as const };
}

export async function savePayoutMethodAction(raw: unknown) {
  const session = await requireSession();
  const parsed = payoutMethodSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Invalid bank details." };

  const supabase = await createClient();
  const enc = encryptSecret(parsed.data.accountNumber);
  const { data: existing } = await supabase
    .from("payout_methods")
    .select("id")
    .eq("user_id", session.id)
    .maybeSingle();

  const payload = {
    bank_name: parsed.data.bankName,
    branch_code: parsed.data.branchCode,
    account_number_enc: enc,
    account_holder_name: parsed.data.accountHolderName,
    account_type: parsed.data.accountType,
  };

  const { error } = existing
    ? await supabase.from("payout_methods").update(payload).eq("id", existing.id)
    : await supabase.from("payout_methods").insert({ user_id: session.id, ...payload });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/dashboard/settings/payout");
  return { ok: true as const };
}

export async function getMyPayoutMethodMasked() {
  const session = await requireSession();
  const supabase = await createClient();
  const { data } = await supabase
    .from("payout_methods")
    .select("*")
    .eq("user_id", session.id)
    .maybeSingle();
  if (!data) return null;
  const method = mapPayoutMethod(data as PayoutMethodRow);
  let last4 = "****";
  try {
    last4 = maskAccountNumber(decryptSecret(method.accountNumberEnc));
  } catch {
    last4 = "****";
  }
  return {
    id: method.id,
    bankName: method.bankName,
    branchCode: method.branchCode,
    accountHolderName: method.accountHolderName,
    accountType: method.accountType,
    accountNumberMasked: last4,
  };
}

export async function getPayoutMethodForAdmin(userId: string) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("payout_methods")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  const method = mapPayoutMethod(data as PayoutMethodRow);
  return {
    ...method,
    accountNumber: decryptSecret(method.accountNumberEnc),
  };
}

export async function requestWithdrawalAction(raw: unknown) {
  const session = await requireSession();
  const parsed = withdrawalSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Invalid withdrawal." };
  if (parsed.data.amountCents < MIN_WITHDRAWAL_CENTS) {
    return { ok: false as const, error: "Minimum withdrawal is N$100." };
  }

  const supabase = await createClient();
  const { data: method } = await supabase
    .from("payout_methods")
    .select("id")
    .eq("id", parsed.data.payoutMethodId)
    .eq("user_id", session.id)
    .maybeSingle();
  if (!method) return { ok: false as const, error: "Add a payout method first." };

  const { data: req, error: insertError } = await supabase
    .from("withdrawal_requests")
    .insert({
      user_id: session.id,
      payout_method_id: method.id,
      amount_cents: parsed.data.amountCents,
      status: "pending",
    })
    .select("id")
    .single();
  if (insertError || !req) {
    return { ok: false as const, error: insertError?.message ?? "Failed." };
  }

  try {
    await adjustWallet({
      userId: session.id,
      availableDelta: -parsed.data.amountCents,
      pendingDelta: parsed.data.amountCents,
      type: "debit",
      reason: "Withdrawal requested",
      referenceType: "withdrawal",
      referenceId: req.id,
    });
  } catch (e) {
    await supabase.from("withdrawal_requests").delete().eq("id", req.id);
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed." };
  }

  revalidatePath("/dashboard/settings/withdraw");
  revalidatePath("/dashboard/admin/withdrawals");
  return { ok: true as const, id: req.id as string };
}

export async function listMyWithdrawals() {
  const session = await requireSession();
  const supabase = await createClient();
  const { data } = await supabase
    .from("withdrawal_requests")
    .select("*")
    .eq("user_id", session.id)
    .order("created_at", { ascending: false });
  return ((data ?? []) as WithdrawalRow[]).map(mapWithdrawal);
}

export async function listPendingWithdrawalsAdmin() {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("withdrawal_requests")
    .select("*")
    .order("created_at", { ascending: false });
  return ((data ?? []) as WithdrawalRow[]).map(mapWithdrawal);
}

export async function markWithdrawalPaidAction(id: string, bankReference?: string) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("withdrawal_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { ok: false as const, error: "Not found." };
  const req = mapWithdrawal(row as WithdrawalRow);
  if (req.status === "paid") return { ok: false as const, error: "Not found." };

  await adjustWallet({
    userId: req.userId,
    availableDelta: 0,
    pendingDelta: -req.amountCents,
    type: "debit",
    reason: "Withdrawal paid via EFT",
    referenceType: "withdrawal",
    referenceId: req.id,
  });

  const { error } = await supabase
    .from("withdrawal_requests")
    .update({
      status: "paid",
      bank_reference: bankReference || null,
      paid_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/dashboard/admin/withdrawals");
  return { ok: true as const };
}

export async function rejectWithdrawalAction(id: string, note?: string) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("withdrawal_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { ok: false as const, error: "Not found." };
  const req = mapWithdrawal(row as WithdrawalRow);
  if (req.status !== "pending") return { ok: false as const, error: "Not found." };

  await adjustWallet({
    userId: req.userId,
    availableDelta: req.amountCents,
    pendingDelta: -req.amountCents,
    type: "credit",
    reason: "Withdrawal rejected — funds restored",
    referenceType: "withdrawal",
    referenceId: req.id,
  });

  const { error } = await supabase
    .from("withdrawal_requests")
    .update({ status: "rejected", admin_note: note || null })
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/dashboard/admin/withdrawals");
  return { ok: true as const };
}

export async function brandDepositAction(amountCents: number, note?: string) {
  const session = await requireSession();
  if (!session.roles.includes("brand")) return { ok: false as const, error: "Brand only." };
  if (amountCents <= 0) return { ok: false as const, error: "Invalid amount." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_deposits")
    .insert({
      brand_id: session.id,
      amount_cents: amountCents,
      note: note || "Manual deposit (v1)",
      status: "credited",
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false as const, error: error?.message ?? "Failed." };

  await adjustWallet({
    userId: session.id,
    availableDelta: amountCents,
    type: "credit",
    reason: note || "Brand deposit (manual)",
    referenceType: "brand_deposit",
    referenceId: data.id,
  });

  revalidatePath("/dashboard/brand/deposits");
  return { ok: true as const };
}

export async function currentUserId() {
  const session = await getSession();
  return session?.id ?? null;
}
