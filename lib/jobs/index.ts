/**
 * Trigger.dev job definitions — scaffold only.
 *
 * Install when ready:
 *   npm install @trigger.dev/sdk@latest
 *
 * Configure TRIGGER_SECRET_KEY in .env.local
 * See: https://trigger.dev/docs
 */

export const JOB_NAMES = {
  pollSubmissionViews: "poll-submission-views",
  recalculateEarnings: "recalculate-earnings",
  notifyAdminWithdrawal: "notify-admin-withdrawal",
  notifyCreatorPaid: "notify-creator-paid",
  budgetAlerts: "budget-alerts",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];
