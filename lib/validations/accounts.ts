import { z } from "zod";

import { MAX_DEPOSIT_CENTS } from "@/lib/money/cents";

import { socialPlatformSchema } from "./shared";

export const addSocialAccountSchema = z.object({
  platform: socialPlatformSchema,
  handle: z.string().trim().min(2).max(200),
});

export const socialAccountIdSchema = z.string().uuid();

export const socialReviewSchema = z.object({
  accountId: z.string().uuid(),
  decision: z.enum(["verified", "rejected"]),
  reason: z.string().trim().max(240).optional(),
});

export const recordViewsSchema = z.object({
  submissionId: z.string().uuid(),
  views: z.number().int().min(0).max(2_000_000_000),
});

export const payInRequestSchema = z.object({
  amountCents: z
    .number()
    .int()
    .positive()
    .max(MAX_DEPOSIT_CENTS, "Deposit cannot exceed N$1,000,000."),
  note: z.string().trim().max(240).optional(),
});
