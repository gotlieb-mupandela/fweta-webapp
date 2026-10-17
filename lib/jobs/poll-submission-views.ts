/**
 * Re-export. Without Apify this does not fetch views.
 * Settlement without a view fetch lives at `/api/jobs/settle-rewards`.
 */
export { pollSubmissionViewsJob as pollSubmissionViews } from "@/app/actions/jobs";
