import { z } from "zod";

/** Placeholder — implement when withdrawal flow is built. */
export const withdrawalSchema = z.object({
  amountCents: z.number().int().positive(),
  payoutMethodId: z.string().uuid(),
});

export const kycSchema = z.object({
  legalName: z
    .string()
    .trim()
    .min(1, "Legal name is required.")
    .min(3, "Legal name must be at least 3 characters.")
    .max(120, "Legal name must be at most 120 characters."),
  idNumber: z
    .string()
    .trim()
    .min(1, "ID number is required.")
    .min(6, "ID number must be at least 6 characters.")
    .max(20, "ID number must be at most 20 characters.")
    .regex(/^[A-Za-z0-9]+$/, "Use letters and numbers only."),
  country: z
    .string()
    .trim()
    .min(1, "Country is required.")
    .length(2, "Country must be a 2 letter code."),
});

export type WithdrawalInput = z.infer<typeof withdrawalSchema>;
