import { z } from "zod";

/** Placeholder — implement when influencer booking is built. */
export const bookingSchema = z.object({
  influencerProfileId: z.string().uuid(),
  rateCardItemId: z.string().uuid(),
  brief: z.string().min(10).max(5000),
});

export type BookingInput = z.infer<typeof bookingSchema>;
