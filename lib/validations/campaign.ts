import { z } from "zod";

import { accountTypeSchema, campaignTypeSchema, socialPlatformSchema } from "./shared";

export const campaignStatusSchema = z.enum([
  "draft",
  "pending",
  "active",
  "paused",
  "completed",
]);

export const campaignCreateSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters.").max(120, "Title is too long."),
  description: z
    .string()
    .min(10, "Description must be at least 10 characters.")
    .max(5000, "Description is too long."),
  type: campaignTypeSchema,
  category: z.string().min(2, "Category must be at least 2 characters.").max(80, "Category is too long."),
  budgetTotalCents: z.number().int().positive("Budget must be greater than zero."),
  cpmCents: z.number().int().positive("CPM must be greater than zero."),
  maxPayoutPerSubmissionCents: z
    .number()
    .int()
    .positive("Max per video must be greater than zero."),
  platforms: z.array(socialPlatformSchema).min(1, "Select at least one platform."),
  requirements: z.string().max(5000).optional(),
  endDate: z.string().optional().nullable(),
  status: campaignStatusSchema.optional(),
});

export const campaignUpdateSchema = campaignCreateSchema.partial();

export type CampaignCreateInput = z.infer<typeof campaignCreateSchema>;
export type CampaignUpdateInput = z.infer<typeof campaignUpdateSchema>;

/** @deprecated use campaignCreateSchema */
export const campaignSchema = campaignCreateSchema;
export type CampaignInput = CampaignCreateInput;

export { accountTypeSchema };
