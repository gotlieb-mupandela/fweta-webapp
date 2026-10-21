import { z } from "zod";

export const supportTicketSchema = z.object({
  subject: z.string().trim().min(3, "Add a subject.").max(120),
  body: z.string().trim().min(10, "Describe the issue in a sentence or two.").max(4000),
});

export const supportReplySchema = z.object({
  body: z.string().trim().min(2, "Write a reply.").max(4000),
});

export const platformFeeSchema = z.object({
  platformFeeBps: z.number().int().min(0).max(2500),
});

export const kycReviewSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["verified", "rejected"]),
  reviewNote: z.string().trim().max(500).optional(),
});
