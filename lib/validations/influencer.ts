import { z } from "zod";

import { socialPlatformSchema } from "./shared";

export const influencerProfileSchema = z.object({
  displayName: z.string().min(2).max(80),
  headline: z.string().min(5).max(160),
  bio: z.string().min(10).max(3000),
  niche: z.string().min(2).max(80),
  location: z.string().min(2).max(80),
  socials: z
    .object({
      tiktok: z.string().url().optional().or(z.literal("")),
      youtube: z.string().url().optional().or(z.literal("")),
      instagram: z.string().url().optional().or(z.literal("")),
      x: z.string().url().optional().or(z.literal("")),
    })
    .optional(),
  published: z.boolean().optional(),
});

export const rateCardSchema = z.object({
  title: z.string().min(2).max(100),
  description: z.string().max(1000).optional(),
  type: z.enum(["per_post", "per_reel", "per_1k_views", "package", "ugc_flat"]),
  platform: socialPlatformSchema.or(z.literal("multi")),
  priceCents: z.number().int().positive(),
  active: z.boolean().optional(),
});

export type InfluencerProfileInput = z.infer<typeof influencerProfileSchema>;
export type RateCardInput = z.infer<typeof rateCardSchema>;
