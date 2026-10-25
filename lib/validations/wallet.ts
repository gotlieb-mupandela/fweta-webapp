import { z } from "zod";

/** One admin credit cannot exceed N$1,000,000. */
export const ADMIN_CREDIT_MAX_CENTS = 100_000_000;

export const adminCreditSchema = z.object({
  userId: z.string().uuid("Choose a user."),
  amountCents: z
    .number()
    .int("Enter an amount in cents.")
    .positive("Enter an amount greater than zero.")
    .max(ADMIN_CREDIT_MAX_CENTS, "A single credit cannot exceed N$1,000,000."),
  reason: z.string().trim().min(3, "Add a reason for this credit.").max(200, "Reason is too long."),
  requestKey: z.string().uuid("Submit the credit again."),
});

export type AdminCreditInput = z.infer<typeof adminCreditSchema>;
