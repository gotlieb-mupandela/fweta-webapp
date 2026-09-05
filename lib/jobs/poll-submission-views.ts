/**
 * Scheduled: every hour — fetch view counts from social APIs and store snapshots.
 * Canonical implementation lives in `@/app/actions/jobs` (callable via
 * `/api/jobs/poll-views` or cron); re-exported here under the Trigger.dev
 * job name so `lib/jobs/*` never throws "not implemented".
 */
export { pollSubmissionViewsJob as pollSubmissionViews } from "@/app/actions/jobs";
