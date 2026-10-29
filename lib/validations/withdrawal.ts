import { z } from "zod";

/** Placeholder, implement when withdrawal flow is built. */
export const withdrawalSchema = z.object({
  amountCents: z.number().int().positive(),
  payoutMethodId: z.string().uuid(),
});

export const kycSchema = z.object({
  legalName: z.string().trim().min(3).max(120),
  idNumber: z
    .string()
    .trim()
    .min(6)
    .max(20)
    .regex(/^[A-Za-z0-9]+$/, "Use letters and numbers only."),
  country: z.string().trim().length(2),
});

export type WithdrawalInput = z.infer<typeof withdrawalSchema>;
