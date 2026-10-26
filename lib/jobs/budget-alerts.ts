/**
 * Triggered after earnings update. Warn the brand when campaign budget is low.
 * Implementation lives in ./submission-jobs. Re-exported under the Trigger.dev
 * job name so `lib/jobs/*` never throws "not implemented".
 */
export { budgetAlertsJob as budgetAlerts } from "./submission-jobs";
