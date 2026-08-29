import { z } from "zod";

import { socialPlatformSchema } from "./shared";

/** Placeholder — implement when submission flow is built. */
export const submissionSchema = z.object({
  campaignId: z.string().uuid(),
  postUrl: z.string().url(),
  platform: socialPlatformSchema,
});

export type SubmissionInput = z.infer<typeof submissionSchema>;
