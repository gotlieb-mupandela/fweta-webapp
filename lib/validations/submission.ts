import { z } from "zod";

import { postUrlMatchesPlatform } from "@/lib/clips/post-url";

import { socialPlatformSchema } from "./shared";

export const submissionSchema = z
  .object({
    campaignId: z.string().uuid(),
    postUrl: z.string().url(),
    platform: socialPlatformSchema,
  })
  .superRefine((value, ctx) => {
    if (!postUrlMatchesPlatform(value.postUrl, value.platform)) {
      ctx.addIssue({
        code: "custom",
        message: "That link is not a post on the selected platform.",
        path: ["postUrl"],
      });
    }
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

export const fraudAppealSchema = z.object({
  note: z.string().trim().min(3, "Enter a short note.").max(2000),
});

export const linkAccountSchema = z.object({
  platform: socialPlatformSchema,
  handle: z.string().trim().min(2).max(80),
});

export const verifyAccountSchema = z.object({
  id: z.string().uuid(),
  pastedBio: z.string().max(5000).optional(),
});

export type SubmissionInput = z.infer<typeof submissionSchema>;
export type SubmissionReviewInput = z.infer<typeof submissionReviewSchema>;
