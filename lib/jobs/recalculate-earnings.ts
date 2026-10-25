/**
 * Triggered after view snapshots update. Recalculate clipper wallet balances.
 * Implementation lives in ./submission-jobs. Re-exported under the Trigger.dev
 * job name so `lib/jobs/*` never throws "not implemented".
 */
export { recalculateEarningsJob as recalculateEarnings } from "./submission-jobs";
