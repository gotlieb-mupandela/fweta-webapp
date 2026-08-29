import { z } from "zod";

import { accountTypeSchema } from "./shared";

/** SA EFT payout method — matches Salt-style form fields. */
export const payoutMethodSchema = z.object({
  bankName: z.string().min(2).max(100),
  branchCode: z.string().regex(/^\d{6}$/, "Branch code must be 6 digits"),
  accountNumber: z.string().min(8).max(20),
  accountHolderName: z.string().min(2).max(120),
  accountType: accountTypeSchema,
});

export type PayoutMethodInput = z.infer<typeof payoutMethodSchema>;
