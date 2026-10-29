import { z } from "zod";

import { accountTypeSchema } from "./shared";

/** Namibian EFT payout method. Account numbers are digits only. */
export const payoutMethodSchema = z.object({
  bankName: z.string().min(2).max(100),
  branchCode: z.string().regex(/^\d{6}$/, "Branch code must be 6 digits"),
  accountNumber: z.string().regex(/^\d{8,20}$/, "Account number must be digits only"),
  accountHolderName: z.string().min(2).max(120),
  accountType: accountTypeSchema,
});

export type PayoutMethodInput = z.infer<typeof payoutMethodSchema>;
