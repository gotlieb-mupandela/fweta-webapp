import { z } from "zod";

const count = z.number().int().min(0).max(2_000_000_000);

export const viewCountSchema = z.object({
  submissionId: z.string().uuid(),
  views: count,
  likes: count.nullable().optional(),
  comments: count.nullable().optional(),
  note: z.string().trim().max(500).optional(),
});

export const bulkViewsSchema = z.object({
  entries: z.array(viewCountSchema).min(1).max(100),
});

export const confirmViewSchema = viewCountSchema.extend({
  snapshotId: z.string().uuid(),
});

export type ViewCountInput = z.infer<typeof viewCountSchema>;

export const manualViewsSchema = viewCountSchema.pick({ submissionId: true, views: true });
