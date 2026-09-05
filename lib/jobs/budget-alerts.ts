/**
 * Triggered after earnings update — warn brand when campaign budget is low.
 * Canonical implementation lives in `@/app/actions/jobs`; re-exported here
 * under the Trigger.dev job name so `lib/jobs/*` never throws "not implemented".
 */
export { budgetAlertsJob as budgetAlerts } from "@/app/actions/jobs";
