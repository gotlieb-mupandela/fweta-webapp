/** Manual EFT deposits stop here. N$1,000,000. */
export const MAX_DEPOSIT_CENTS = 100_000_000;

export function depositAmountError(cents: number): string | null {
  if (!Number.isInteger(cents) || cents <= 0) return "Enter a valid amount in NAD.";
  if (cents > MAX_DEPOSIT_CENTS) return "Deposit cannot exceed N$1,000,000.";
  return null;
}

/** Convert a NAD amount to integer cents. Rejects blank, zero, and non-numeric input. */
export function nadToCents(amount: number): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const cents = Math.round((amount + Number.EPSILON) * 100);
  if (!Number.isInteger(cents) || cents <= 0) return null;
  return cents;
}
