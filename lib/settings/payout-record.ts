import { decryptSecret } from "@/lib/db/store";
import type { PayoutMethod } from "@/lib/db/types";
import { maskAccountNumber } from "@/lib/utils";

/** Lookup is by user id. There is no separate verified flag on the bank record. */
export function payoutMethodForUser<T extends { userId: string }>(
  methods: readonly T[],
  userId: string,
): T | null {
  return methods.find((method) => method.userId === userId) ?? null;
}

export function maskPayoutRecord(method: PayoutMethod) {
  let accountNumberMasked = "****";
  try {
    accountNumberMasked = maskAccountNumber(decryptSecret(method.accountNumberEnc));
  } catch {
    accountNumberMasked = "****";
  }
  return {
    id: method.id,
    bankName: method.bankName,
    branchCode: method.branchCode,
    accountHolderName: method.accountHolderName,
    accountType: method.accountType,
    accountNumberMasked,
  };
}
