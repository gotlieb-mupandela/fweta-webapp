/**
 * Triggered after view snapshots update — recalculate clipper wallet balances.
 * Canonical implementation lives in `@/app/actions/jobs`; re-exported here
 * under the Trigger.dev job name so `lib/jobs/*` never throws "not implemented".
 */
export { recalculateEarningsJob as recalculateEarnings } from "@/app/actions/jobs";
