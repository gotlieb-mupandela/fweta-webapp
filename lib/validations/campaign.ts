import { z } from "zod";

import { accountTypeSchema, campaignTypeSchema, socialPlatformSchema } from "./shared";

/** Placeholder — implement when campaign CRUD is built. */
export const campaignSchema = z.object({
  title: z.string().min(3).max(120),
  type: campaignTypeSchema,
  category: z.string().min(2).max(80),
  budgetCents: z.number().int().positive(),
  rewardRatePerThousandViewsCents: z.number().int().positive(),
  platforms: z.array(socialPlatformSchema).min(1),
  requirements: z.string().max(5000).optional(),
});

export type CampaignInput = z.infer<typeof campaignSchema>;
