import { endInstant } from "@/lib/rewards/content-rewards";

/** True once the campaign end instant is in the past. A date-only value ends at 23:59:59.999 UTC. */
export function endDateHasPassed(endDate: string | null | undefined, now = Date.now()): boolean {
  const end = endInstant(endDate);
  return end != null && now > end;
}
