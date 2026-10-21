import { z } from "zod";

import { socialPlatformSchema } from "./shared";

export const submissionSchema = z.object({
  campaignId: z.string().uuid(),
  postUrl: z.string().url(),
  platform: socialPlatformSchema,
});

export const submissionReviewSchema = z.object({
  status: z.enum(["approved", "rejected", "flagged"]),
  reviewNote: z.string().max(2000).optional(),
  views: z.number().int().min(0).max(2_000_000_000).optional(),
});

export const manualViewsSchema = z.object({
  submissionId: z.string().uuid(),
  views: z.number().int().min(0).max(2_000_000_000),
});

export type SubmissionInput = z.infer<typeof submissionSchema>;
export type SubmissionReviewInput = z.infer<typeof submissionReviewSchema>;
