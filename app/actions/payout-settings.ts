"use server";

import { savePayoutMethodAction } from "@/app/actions/wallet";
import {
  payoutFieldErrors,
  payoutMethodSchema,
  type PayoutFieldErrors,
} from "@/lib/validations/payout-method";

export async function savePayoutMethodFormAction(raw: unknown): Promise<
  | { ok: true }
  | { ok: false; error: string; fieldErrors: PayoutFieldErrors }
> {
  const parsed = payoutMethodSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: payoutFieldErrors(parsed.error),
    };
  }

  const saved = await savePayoutMethodAction(parsed.data);
  if (!saved.ok) {
    return { ok: false, error: saved.error, fieldErrors: {} };
  }
  return { ok: true };
}
