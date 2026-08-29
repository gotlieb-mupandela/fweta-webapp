import { z } from "zod";

/** Placeholder — implement when withdrawal flow is built. */
export const withdrawalSchema = z.object({
  amountCents: z.number().int().positive(),
  payoutMethodId: z.string().uuid(),
});

export type WithdrawalInput = z.infer<typeof withdrawalSchema>;
