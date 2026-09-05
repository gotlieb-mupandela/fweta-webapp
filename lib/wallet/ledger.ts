import { encryptSecret, decryptSecret, newId, nowIso, updateStore } from "@/lib/db/store";
import type { DatabaseStore, LedgerEntry, Wallet } from "@/lib/db/types";

type WalletDelta = {
  userId: string;
  availableDelta: number;
  pendingDelta?: number;
  type: "credit" | "debit";
  reason: string;
  referenceType: LedgerEntry["referenceType"];
  referenceId?: string | null;
};

function getOrCreateWallet(store: { wallets: Wallet[] }, userId: string): Wallet {
  let wallet = store.wallets.find((w) => w.userId === userId);
  if (!wallet) {
    wallet = {
      userId,
      availableCents: 0,
      pendingCents: 0,
      updatedAt: nowIso(),
    };
    store.wallets.push(wallet);
  }
  return wallet;
}

export async function getWallet(userId: string): Promise<Wallet> {
  // Single transaction: create-if-missing inside the mutator so two
  // concurrent first-logins can't both see "no wallet" and push duplicates.
  let result!: Wallet;
  await updateStore((s) => {
    result = { ...getOrCreateWallet(s, userId) };
  });
  return result;
}

/**
 * Synchronous wallet mutation for use *inside* a single updateStore() call.
 * Keeps balance change + ledger row + domain record in one atomic write,
 * so a crash between two separate updateStore() calls can't leave money
 * moved without its withdrawal/booking/earnings record (or vice versa).
 */
export function applyWalletDelta(
  store: DatabaseStore,
  params: WalletDelta,
): { wallet: Wallet; entry: LedgerEntry } {
  const wallet = getOrCreateWallet(store, params.userId);
  const pendingDelta = params.pendingDelta ?? 0;

  if (!Number.isInteger(params.availableDelta) || !Number.isInteger(pendingDelta)) {
    throw new Error("Amounts must be whole cents.");
  }
  if (wallet.availableCents + params.availableDelta < 0) {
    throw new Error("Insufficient available balance.");
  }
  if (wallet.pendingCents + pendingDelta < 0) {
    throw new Error("Insufficient pending balance.");
  }

  wallet.availableCents += params.availableDelta;
  wallet.pendingCents += pendingDelta;
  wallet.updatedAt = nowIso();

  const entry: LedgerEntry = {
    id: newId(),
    userId: params.userId,
    amountCents: Math.abs(params.availableDelta || pendingDelta),
    type: params.type,
    reason: params.reason,
    referenceType: params.referenceType,
    referenceId: params.referenceId ?? null,
    balanceAfterAvailableCents: wallet.availableCents,
    balanceAfterPendingCents: wallet.pendingCents,
    createdAt: nowIso(),
  };
  store.ledgerEntries.push(entry);
  return { wallet: { ...wallet }, entry };
}

export async function adjustWallet(params: {
  userId: string;
  availableDelta: number;
  pendingDelta?: number;
  type: "credit" | "debit";
  reason: string;
  referenceType: LedgerEntry["referenceType"];
  referenceId?: string | null;
}): Promise<{ wallet: Wallet; entry: LedgerEntry }> {
  let result!: { wallet: Wallet; entry: LedgerEntry };

  await updateStore((store) => {
    result = applyWalletDelta(store, params);
  });

  return result;
}

export { encryptSecret, decryptSecret, getOrCreateWallet };
