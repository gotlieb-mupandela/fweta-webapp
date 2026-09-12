import { z } from "zod";

import { socialPlatformSchema } from "./shared";

export const onboardingCompleteSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(60),
  lastName: z.string().trim().min(1, "Surname is required").max(60),
  phone: z
    .string()
    .trim()
    .min(8, "Enter a valid phone number")
    .max(24)
    .regex(/^[+]?[\d\s()-]{8,24}$/, "Use digits, spaces, or +country code"),
  socialPlatform: socialPlatformSchema,
  socialHandle: z
    .string()
    .trim()
    .min(2, "Add your handle or profile link")
    .max(200),
  companyName: z.string().trim().max(100).optional(),
  website: z.string().trim().max(300).optional(),
  niche: z.string().trim().max(80).optional(),
  location: z.string().trim().max(80).optional(),
  primaryPlatform: socialPlatformSchema.optional(),
});

export type OnboardingCompleteInput = z.infer<typeof onboardingCompleteSchema>;
