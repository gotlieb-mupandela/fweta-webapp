import type { Profile } from "@/lib/db/types";
import { payoutIdentityReady } from "@/lib/marketplace/growth";

export function withdrawalIdentityError(kyc: Profile["kyc"]): string | null {
  if (!payoutIdentityReady(kyc)) {
    return "ID must be verified before a payout.";
  }
  return null;
}
