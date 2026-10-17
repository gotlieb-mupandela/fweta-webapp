/**
 * Disabled. View counts are manual. This export does not fetch providers.
 * Settlement without a view fetch lives at `/api/jobs/settle-rewards`.
 */
export { pollSubmissionViewsJob as pollSubmissionViews } from "@/app/actions/jobs";
