import { redirect } from "next/navigation";

import { ContextHelp } from "@/components/onboarding/context-help";
import { ViewEntryForm } from "@/components/onboarding/view-entry-form";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { formatMoney, formatNumber } from "@/lib/utils";

export default async function AdminViewsPage() {
  const session = await getSession();
  if (!session?.roles.includes("admin")) redirect("/dashboard");

  const store = await readStore();
  const submissions = store.submissions
    .filter((submission) => submission.status === "approved")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="dash-stack">
      <PageHeader
        title="View checks"
        description="Enter qualified views. Earnings are calculated from the campaign rate."
      />
      <ContextHelp
        title="Views update the wallet"
        body="Saving a higher view count writes a snapshot and credits the creator for the new earnings, up to the per-clip cap and the remaining budget."
        hint="Approve the clip first. Views cannot be lowered after they are saved."
      />
      {submissions.length === 0 ? (
        <EmptyState
          title="No approved clips"
          description="View checks start after a brand approves a submission."
        />
      ) : (
        <ul className="space-y-2.5">
          {submissions.map((submission) => {
            const campaign = store.campaigns.find((item) => item.id === submission.campaignId);
            const creator = store.profiles.find((item) => item.id === submission.clipperId);
            const account = (store.socialAccounts ?? []).find((item) => item.id === submission.socialAccountId);
            return (
              <li key={submission.id} className="rounded-2xl border border-border bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{campaign?.title ?? "Campaign"}</p>
                    <p className="text-sm text-muted">{creator?.displayName ?? "Creator"}</p>
                    <p className="mt-1 break-all text-sm text-gold-deep">{submission.postUrl}</p>
                    <p className="mt-1 text-xs text-muted">
                      {formatNumber(submission.views)} views · {formatMoney(submission.earningsCents)} earned
                      {account ? ` · @${account.handle}` : ""}
                    </p>
                  </div>
                  <Badge tone="success">Approved</Badge>
                </div>
                <div className="mt-4">
                  <ViewEntryForm submissionId={submission.id} currentViews={submission.views} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
