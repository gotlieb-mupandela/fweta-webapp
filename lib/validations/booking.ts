import { z } from "zod";

export const bookingSchema = z.object({
  influencerProfileId: z.string().uuid(),
  rateCardItemId: z.string().uuid(),
  brief: z.string().min(10, "Brief must be at least 10 characters.").max(5000),
});

export type BookingInput = z.infer<typeof bookingSchema>;

export const privateDealSchema = z.object({
  influencerProfileId: z.string().uuid(),
  amountCents: z.number().int().positive("Enter an offer amount."),
  brief: z.string().trim().min(10, "Brief must be at least 10 characters.").max(5000, "Brief is too long."),
});

export type PrivateDealInput = z.infer<typeof privateDealSchema>;
