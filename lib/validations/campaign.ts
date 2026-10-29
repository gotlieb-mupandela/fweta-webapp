import { z } from "zod";

import { endDateHasPassed } from "@/lib/campaigns/dates";

import { accountTypeSchema, campaignTypeSchema, socialPlatformSchema } from "./shared";

export const campaignStatusSchema = z.enum([
  "draft",
  "pending",
  "active",
  "paused",
  "completed",
]);

const assetSchema = z.object({
  label: z.string().trim().min(1, "Each reference needs a label.").max(80, "Reference label is too long."),
  url: z.string().trim().url("Each reference needs a valid link.").max(2000, "Reference link is too long."),
});

function refineCampaign(
  value: {
    budgetTotalCents?: number;
    cpmCents?: number;
    minPayoutCents?: number;
    maxPayoutPerSubmissionCents?: number;
    startDate?: string | null;
    endDate?: string | null;
    payModel?: "cpm" | "pool";
    countries?: string[];
  },
  ctx: z.RefinementCtx,
) {
  const max = value.maxPayoutPerSubmissionCents;
  const min = value.minPayoutCents ?? 0;
  const budget = value.budgetTotalCents;
  if (max != null && min > max) {
    ctx.addIssue({
      code: "custom",
      message: "Minimum before review cannot exceed the per-post cap.",
      path: ["minPayoutCents"],
    });
  }
  if (max != null && budget != null && max > budget) {
    ctx.addIssue({
      code: "custom",
      message: "Per-post cap cannot exceed the campaign budget.",
      path: ["maxPayoutPerSubmissionCents"],
    });
  }
  if (value.startDate && value.endDate && value.endDate < value.startDate) {
    ctx.addIssue({
      code: "custom",
      message: "End date must be on or after the start date.",
      path: ["endDate"],
    });
  }
  if (value.endDate && endDateHasPassed(value.endDate)) {
    ctx.addIssue({
      code: "custom",
      message: "End date must be in the future.",
      path: ["endDate"],
    });
  }
  if ((value.payModel ?? "cpm") === "cpm" && value.cpmCents != null && value.cpmCents <= 0) {
    ctx.addIssue({
      code: "custom",
      message: "Set the rate per 1,000 views.",
      path: ["cpmCents"],
    });
  }
  if (value.payModel === "pool" && !value.endDate) {
    ctx.addIssue({
      code: "custom",
      message: "A pool campaign needs an end date.",
      path: ["endDate"],
    });
  }
  if (value.countries && value.countries.some((code) => !/^[A-Z]{2}$/.test(code))) {
    ctx.addIssue({
      code: "custom",
      message: "Choose a country.",
      path: ["countries"],
    });
  }
}

export const campaignCreateSchema = z
  .object({
    title: z.string().trim().min(3, "Title must be at least 3 characters.").max(120, "Title is too long."),
    description: z
      .string()
      .trim()
      .min(10, "Description must be at least 10 characters.")
      .max(5000, "Description is too long."),
    type: campaignTypeSchema,
    category: z.string().trim().min(2, "Category must be at least 2 characters.").max(80, "Category is too long."),
    budgetTotalCents: z.number().int().positive("Budget must be greater than zero."),
    cpmCents: z.number().int().min(0),
    minPayoutCents: z.number().int().min(0).optional(),
    minViews: z.number().int().min(0).max(100_000_000).optional(),
    payModel: z.enum(["cpm", "pool"]).optional(),
    countries: z.array(z.string().length(2)).min(1, "Choose at least one country.").max(30).optional(),
    maxPayoutPerSubmissionCents: z.number().int().positive("Max per video must be greater than zero."),
    platforms: z.array(socialPlatformSchema).min(1, "Select at least one platform."),
    requirements: z.string().max(5000).optional(),
    rules: z.string().max(5000).optional(),
    captionGuide: z.string().max(500).optional(),
    hashtags: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
    requiredChecks: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
    assets: z.array(assetSchema).max(8).optional(),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
    status: campaignStatusSchema.optional(),
  })
  .superRefine(refineCampaign);

export const campaignUpdateSchema = z
  .object({
    title: z.string().trim().min(3, "Title must be at least 3 characters.").max(120, "Title is too long.").optional(),
    description: z
      .string()
      .trim()
      .min(10, "Description must be at least 10 characters.")
      .max(5000, "Description is too long.")
      .optional(),
    type: campaignTypeSchema.optional(),
    category: z
      .string()
      .trim()
      .min(2, "Category must be at least 2 characters.")
      .max(80, "Category is too long.")
      .optional(),
    budgetTotalCents: z.number().int().positive("Budget must be greater than zero.").optional(),
    cpmCents: z.number().int().min(0).optional(),
    minPayoutCents: z.number().int().min(0).optional(),
    minViews: z.number().int().min(0).max(100_000_000).optional(),
    payModel: z.enum(["cpm", "pool"]).optional(),
    countries: z.array(z.string().length(2)).min(1).max(30).optional(),
    maxPayoutPerSubmissionCents: z
      .number()
      .int()
      .positive("Max per video must be greater than zero.")
      .optional(),
    platforms: z.array(socialPlatformSchema).min(1, "Select at least one platform.").optional(),
    requirements: z.string().max(5000).optional(),
    rules: z.string().max(5000).optional(),
    captionGuide: z.string().max(500).optional(),
    hashtags: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
    requiredChecks: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
    assets: z.array(assetSchema).max(8).optional(),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
    status: campaignStatusSchema.optional(),
  })
  .superRefine(refineCampaign);

export type CampaignCreateInput = z.infer<typeof campaignCreateSchema>;
export type CampaignUpdateInput = z.infer<typeof campaignUpdateSchema>;

/** @deprecated use campaignCreateSchema */
export const campaignSchema = campaignCreateSchema;
export type CampaignInput = CampaignCreateInput;

export { accountTypeSchema };
