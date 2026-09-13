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
      [d.socials.tiktok, d.socials.instagram, d.socials.youtube, d.socials.x].some(
        (v) => (v ?? "").trim().length >= 2,
      ),
    { message: "Add at least one social profile", path: ["socials"] },
  );

export type OnboardingCompleteInput = z.infer<typeof onboardingCompleteSchema>;
