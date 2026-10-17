import { z } from "zod";

export const manualViewsSchema = z.object({
  submissionId: z.string().uuid(),
  views: z.number().int().nonnegative().max(2_000_000_000),
});
