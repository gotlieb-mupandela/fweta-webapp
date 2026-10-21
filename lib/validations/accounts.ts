import { z } from "zod";

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
  amountCents: z.number().int().positive().max(100_000_000_00),
  note: z.string().trim().max(240).optional(),
});
