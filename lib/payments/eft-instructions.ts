/**
 * Placeholder collections details. Not a real bank account.
 * Replace this copy only after Gotlieb confirms the account that should receive EFTs.
 */
export const FWETA_EFT_INSTRUCTIONS = {
  bankName: "Placeholder bank (not a real account)",
  accountName: "Placeholder account name",
  accountNumber: "PLACEHOLDER",
  branchCode: "PLACEHOLDER",
  warning:
    "These bank details are placeholders until the collections account is confirmed. Do not send money to this text.",
} as const;

/** Stable reference the brand puts on the EFT so an admin can match the transfer. */
export function depositReferenceFor(userId: string): string {
  const compact = userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase();
  return `FWETA-${compact || "BRAND"}`;
}
