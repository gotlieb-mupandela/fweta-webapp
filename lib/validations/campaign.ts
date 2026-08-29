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
  title: z.string().min(3).max(120),
  description: z.string().min(10).max(5000),
  type: campaignTypeSchema,
  category: z.string().min(2).max(80),
  budgetTotalCents: z.number().int().positive(),
  cpmCents: z.number().int().positive(),
  maxPayoutPerSubmissionCents: z.number().int().positive(),
  platforms: z.array(socialPlatformSchema).min(1),
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
