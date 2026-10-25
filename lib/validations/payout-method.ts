import { z } from "zod";

import { accountTypeSchema } from "./shared";

/** SA EFT payout method. Same schema on the settings form and the server action. */
export const payoutMethodSchema = z.object({
  bankName: z
    .string()
    .trim()
    .min(1, "Bank name is required.")
    .min(2, "Bank name must be at least 2 characters.")
    .max(100, "Bank name must be at most 100 characters."),
  branchCode: z
    .string()
    .trim()
    .min(1, "Branch code is required.")
    .regex(/^\d{6}$/, "Branch code must be 6 digits."),
  accountNumber: z
    .string()
    .trim()
    .min(1, "Account number is required.")
    .min(8, "Account number must be at least 8 characters.")
    .max(20, "Account number must be at most 20 characters."),
  accountHolderName: z
    .string()
    .trim()
    .min(1, "Account holder name is required.")
    .min(2, "Account holder name must be at least 2 characters.")
    .max(120, "Account holder name must be at most 120 characters."),
  accountType: accountTypeSchema,
});

export type PayoutMethodInput = z.infer<typeof payoutMethodSchema>;

export const PAYOUT_FIELDS = [
  "bankName",
  "branchCode",
  "accountNumber",
  "accountHolderName",
  "accountType",
] as const;

export type PayoutField = (typeof PAYOUT_FIELDS)[number];
export type PayoutFieldErrors = Partial<Record<PayoutField, string>>;

export function payoutFieldErrors(error: {
  issues: { path: PropertyKey[]; message: string }[];
}): PayoutFieldErrors {
  const out: PayoutFieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key !== "string" || !PAYOUT_FIELDS.includes(key as PayoutField)) continue;
    const field = key as PayoutField;
    if (!out[field]) out[field] = issue.message;
  }
  return out;
}
