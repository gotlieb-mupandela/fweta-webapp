import { z } from "zod";

import { socialPlatformSchema } from "./shared";

export const influencerProfileSchema = z.object({
  displayName: z.string().trim().min(2, "Display name must be at least 2 characters.").max(80, "Display name must be 80 characters or fewer."),
  headline: z.string().trim().min(5, "Headline must be at least 5 characters.").max(160, "Headline must be 160 characters or fewer."),
  bio: z.string().trim().min(10, "Bio must be at least 10 characters.").max(3000, "Bio must be 3,000 characters or fewer."),
  niche: z.string().trim().min(2, "Niche must be at least 2 characters.").max(80, "Niche must be 80 characters or fewer."),
  location: z.string().trim().min(2, "Location must be at least 2 characters.").max(80, "Location must be 80 characters or fewer."),
  socials: z
    .object({
      tiktok: z.string().url().optional().or(z.literal("")),
      youtube: z.string().url().optional().or(z.literal("")),
      instagram: z.string().url().optional().or(z.literal("")),
      facebook: z.string().url().optional().or(z.literal("")),
      x: z.string().url().optional().or(z.literal("")),
    })
    .optional(),
  published: z.boolean().optional(),
});

/** N$1,000,000. Blocks accidental huge prices without rejecting a real package. */
export const MAX_RATE_CENTS = 100_000_000;

export const rateCardSchema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters.").max(100, "Title must be 100 characters or fewer."),
  description: z.string().trim().max(1000, "Description must be 1,000 characters or fewer.").optional(),
  type: z.enum(["per_post", "per_reel", "per_1k_views", "package", "ugc_flat"]),
  platform: socialPlatformSchema.or(z.literal("multi")),
  priceCents: z
    .number()
    .int("Enter a price in cents.")
    .positive("Enter a price above zero.")
    .max(MAX_RATE_CENTS, "Price cannot exceed N$1,000,000."),
  active: z.boolean().optional(),
});

export type InfluencerProfileInput = z.infer<typeof influencerProfileSchema>;
export type RateCardInput = z.infer<typeof rateCardSchema>;
