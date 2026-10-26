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

/** Bank reference a brand enters when filing a manual EFT. Older rows may omit it. */
export const bankReferenceSchema = z
  .string({ error: "Enter the bank reference from your EFT." })
  .trim()
  .superRefine((value, ctx) => {
    if (!value) {
      ctx.addIssue({ code: "custom", message: "Enter the bank reference from your EFT." });
      return;
    }
    if (value.length < 4 || value.length > 64) {
      ctx.addIssue({ code: "custom", message: "Bank reference must be 4 to 64 characters." });
      return;
    }
    if (/^[=+\-@]/.test(value)) {
      ctx.addIssue({
        code: "custom",
        message: "Bank reference cannot start with =, +, - or @.",
      });
      return;
    }
    if (/[\r\n]/.test(value)) {
      ctx.addIssue({ code: "custom", message: "Bank reference cannot contain a line break." });
      return;
    }
    if (!/^[A-Za-z0-9 /-]+$/.test(value)) {
      ctx.addIssue({
        code: "custom",
        message: "Bank reference can use letters, digits, spaces, hyphens, and slashes.",
      });
    }
  });

export const payInRequestSchema = z.object({
  amountCents: z.number().int().positive().max(100_000_000_00),
  note: z.string().trim().max(240).optional(),
  bankReference: bankReferenceSchema,
});

export const brandDepositFileSchema = z.object({
  bankReference: bankReferenceSchema,
});
