/** Convert a NAD amount to integer cents. Rejects blank, zero, and non-numeric input. */
export function nadToCents(amount: number): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const cents = Math.round((amount + Number.EPSILON) * 100);
  if (!Number.isInteger(cents) || cents <= 0) return null;
  return cents;
}
