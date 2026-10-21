import { z } from "zod";

import { socialPlatformSchema } from "./shared";

const socialHandleField = z.string().trim().max(200);

export const onboardingCompleteSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required").max(60),
    lastName: z.string().trim().min(1, "Surname is required").max(60),
    phone: z
      .string()
      .trim()
      .min(8, "Enter a valid phone number")
      .max(24)
      .regex(/^[+]?[\d\s()-]{8,24}$/, "Use digits, spaces, or +country code"),
    socials: z.object({
      tiktok: socialHandleField.optional().default(""),
      instagram: socialHandleField.optional().default(""),
      facebook: socialHandleField.optional().default(""),
      youtube: socialHandleField.optional().default(""),
      x: socialHandleField.optional().default(""),
    }),
    companyName: z.string().trim().max(100).optional(),
    website: z.string().trim().max(300).optional(),
    niche: z.string().trim().max(80).optional(),
    location: z.string().trim().max(80).optional(),
    primaryPlatform: socialPlatformSchema.optional(),
  })
  .refine(
    (d) =>
      Boolean(d.companyName?.trim()) ||
      [d.socials.tiktok, d.socials.instagram, d.socials.facebook, d.socials.youtube, d.socials.x].some(
        (v) => (v ?? "").trim().length >= 2,
      ),
    { message: "Add a business name or at least one social profile", path: ["socials"] },
  );

export type OnboardingCompleteInput = z.infer<typeof onboardingCompleteSchema>;

const handleField = z.string().trim().max(200);

export const onboardingStepIdSchema = z.enum([
  "name",
  "interests",
  "socials",
  "payout",
  "company",
  "promote",
  "campaign",
  "deposit",
  "tour",
  "discover",
]);

export const onboardingSocialsSchema = z.object({
  tiktok: handleField.optional().default(""),
  instagram: handleField.optional().default(""),
  facebook: handleField.optional().default(""),
  youtube: handleField.optional().default(""),
  x: handleField.optional().default(""),
});

export const onboardingStepSchema = z.object({
  stepId: onboardingStepIdSchema,
  mode: z.enum(["complete", "skip"]),
  firstName: z.string().trim().max(60).optional(),
  lastName: z.string().trim().max(60).optional(),
  phone: z.string().trim().max(24).optional(),
  interests: z.array(z.string().trim().min(1).max(40)).max(5).optional(),
  location: z.string().trim().max(80).optional(),
  companyName: z.string().trim().max(100).optional(),
  website: z.string().trim().max(300).optional(),
  promote: z.string().trim().max(500).optional(),
  socials: onboardingSocialsSchema.optional(),
  brandSocials: onboardingSocialsSchema.optional(),
});

export const onboardingHandleSchema = z.object({
  platform: socialPlatformSchema,
  handle: z.string().trim().min(2).max(200),
});

export const onboardingCampaignSchema = z
  .object({
    title: z.string().trim().min(3, "Give the campaign a title.").max(120),
    brief: z.string().trim().min(10, "Add a short brief.").max(5000),
    rules: z.string().trim().min(3, "Add the rules creators should follow.").max(5000),
    type: z.enum(["clipping", "ugc"]),
    category: z.string().trim().min(2).max(80),
    budgetNad: z.number().positive("Enter a budget."),
    cpmNad: z.number().positive("Enter the rate per 1,000 views."),
    maxPayoutNad: z.number().positive("Enter a per-clip cap."),
    minViews: z.number().int().nonnegative("Minimum views cannot be negative.").max(100_000_000),
    platforms: z.array(socialPlatformSchema).min(1, "Pick at least one platform."),
  })
  .refine((data) => Math.round(data.maxPayoutNad * 100) <= Math.round(data.budgetNad * 100), {
    message: "Per-clip cap cannot exceed the campaign budget.",
    path: ["maxPayoutNad"],
  });

export const onboardingPayoutSchema = z.object({
  bankName: z.string().trim().min(2).max(100),
  branchCode: z.string().regex(/^\d{6}$/, "Branch code must be 6 digits"),
  accountNumber: z.string().trim().min(8).max(20),
  accountHolderName: z.string().trim().min(2).max(120),
  accountType: z.enum(["cheque", "savings", "transmission"]),
});

export type OnboardingStepPayload = z.infer<typeof onboardingStepSchema>;
export type OnboardingCampaignPayload = z.infer<typeof onboardingCampaignSchema>;
export type OnboardingPayoutPayload = z.infer<typeof onboardingPayoutSchema>;
