import { encryptSecret, decryptSecret, newId, nowIso, updateStore, readStore } from "@/lib/db/store";
import type { LedgerEntry, Wallet } from "@/lib/db/types";

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
  const store = await readStore();
  const existing = store.wallets.find((w) => w.userId === userId);
  if (existing) return existing;
  return updateStore((s) => {
    getOrCreateWallet(s, userId);
  }).then((s) => s.wallets.find((w) => w.userId === userId)!);
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
    const wallet = getOrCreateWallet(store, params.userId);
    const pendingDelta = params.pendingDelta ?? 0;

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
    result = { wallet: { ...wallet }, entry };
  });

  return result;
}

export { encryptSecret, decryptSecret, getOrCreateWallet };
