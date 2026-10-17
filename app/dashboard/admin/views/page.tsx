import { redirect } from "next/navigation";

import { AdminViewForm, BulkViewForm, ConfirmViewForm, ViewCheckNotice } from "@/components/forms/view-check-forms";
import type { PendingViewReport, ViewCheckRow } from "@/components/forms/view-check-forms";
import { EmptyState, PageHeader, SectionHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import {
  PLATFORM_LABEL,
  lastCheckedLabel,
  latestConfirmedSnapshot,
  pendingCreatorSnapshot,
  qualifiedViewCount,
  remainingBudgetCents,
} from "@/lib/rewards/content-rewards";
import { formatMoney, formatNumber } from "@/lib/utils";

export default async function AdminViewChecksPage() {
  const session = await getSession();
  if (!session?.roles.includes("admin")) redirect("/dashboard");

  const store = await readStore();
  const rows: ViewCheckRow[] = store.submissions
    .flatMap((submission) => {
      const campaign = store.campaigns.find((item) => item.id === submission.campaignId);
      if (!campaign || campaign.status !== "active" || submission.status !== "approved") return [];
      if (submission.payoutState === "clawed_back") return [];
      const creator = store.profiles.find((item) => item.id === submission.clipperId);
      const confirmed = latestConfirmedSnapshot(store.viewSnapshots, submission.id);
      return [
        {
          submissionId: submission.id,
          campaignTitle: campaign.title,
          creatorName: creator?.displayName || "Creator",
          postUrl: submission.postUrl,
          platform: PLATFORM_LABEL[submission.platform],
          baseline: submission.baselineViews ?? 0,
          qualified: qualifiedViewCount(submission),
          earningsLabel: formatMoney(submission.earningsCents),
          budgetLeftLabel: formatMoney(remainingBudgetCents(campaign)),
          lastChecked: lastCheckedLabel(confirmed?.recordedAt ?? null),
          sortAt: confirmed?.recordedAt ?? "",
        },
      ];
    })
    .sort((a, b) => a.sortAt.localeCompare(b.sortAt) || a.campaignTitle.localeCompare(b.campaignTitle))
    .map((row) => ({
      submissionId: row.submissionId,
      campaignTitle: row.campaignTitle,
      creatorName: row.creatorName,
      postUrl: row.postUrl,
      platform: row.platform,
      baseline: row.baseline,
      qualified: row.qualified,
      earningsLabel: row.earningsLabel,
      budgetLeftLabel: row.budgetLeftLabel,
      lastChecked: row.lastChecked,
    }));

  const pending: PendingViewReport[] = store.viewSnapshots
    .filter((snap) => snap.status === "pending" && snap.source === "creator")
    .map((snap) => {
      const submission = store.submissions.find((item) => item.id === snap.submissionId);
      const campaign = submission ? store.campaigns.find((item) => item.id === submission.campaignId) : undefined;
      const creator = submission ? store.profiles.find((item) => item.id === submission.clipperId) : undefined;
      if (!submission || !campaign || submission.status === "rejected") return null;
      return {
        snapshotId: snap.id,
        submissionId: submission.id,
        campaignTitle: campaign.title,
        creatorName: creator?.displayName || "Creator",
        postUrl: submission.postUrl,
        views: snap.views,
        likes: snap.likes,
        comments: snap.comments,
        note: snap.note,
        screenshotPath: snap.screenshotPath,
        reportedAt: snap.recordedAt,
      };
    })
    .filter((item): item is PendingViewReport => item != null)
    .sort((a, b) => a.reportedAt.localeCompare(b.reportedAt));

  return (
    <div className="dash-stack">
      <PageHeader
        title="View checks"
        description="Saving a count updates that clip's earnings, the creator wallet, the campaign budget, and the leaderboard immediately. The bank payout stays a manual EFT."
      />
      <ViewCheckNotice />

      <section className="space-y-3">
        <SectionHeader title="Creator reports" />
        {pending.length === 0 ? (
          <EmptyState title="No reports waiting" description="Creator screenshots show up here until you confirm or edit the count." />
        ) : (
          <ul className="space-y-2.5">
            {pending.map((report) => (
              <li key={report.snapshotId} className="list-row items-start">
                <div className="w-full space-y-3">
                  <div>
                    <p className="text-sm font-medium">
                      {report.campaignTitle} · {report.creatorName}
                    </p>
                    <a href={report.postUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-sm text-gold-deep hover:underline">
                      Open post
                    </a>
                    <p className="mt-1 text-xs text-muted">
                      Reported {formatNumber(report.views)} views
                      {report.screenshotPath ? (
                        <>
                          {" "}
                          ·{" "}
                          <a href={`/api/view-screenshots/${report.screenshotPath}`} target="_blank" rel="noopener noreferrer" className="text-gold-deep hover:underline">
                            Open screenshot
                          </a>
                        </>
                      ) : null}
                    </p>
                    {pendingCreatorSnapshot(store.viewSnapshots, report.submissionId) ? (
                      <p className="mt-1 text-xs text-muted">This report does not move money until you confirm it.</p>
                    ) : null}
                  </div>
                  <ConfirmViewForm report={report} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader title="Approved clips" />
        {rows.length === 0 ? (
          <EmptyState title="Nothing to check" description="Approved clips on active campaigns show up here, oldest check first." />
        ) : (
          <ul className="space-y-2.5">
            {rows.map((row) => (
              <li key={row.submissionId} className="list-row items-start">
                <div className="w-full space-y-3">
                  <div>
                    <p className="text-sm font-medium">
                      {row.campaignTitle} · {row.creatorName}
                    </p>
                    <a href={row.postUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-sm text-gold-deep hover:underline">
                      Open post
                    </a>
                    <p className="mt-1 text-xs text-muted">
                      {row.platform} · baseline {formatNumber(row.baseline)} · {formatNumber(row.qualified)} qualified · {row.earningsLabel} · {row.budgetLeftLabel} left · {row.lastChecked}
                    </p>
                  </div>
                  <AdminViewForm row={row} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader title="Bulk entry" />
        {rows.length === 0 ? (
          <p className="text-sm text-muted">Add counts above once clips are approved.</p>
        ) : (
          <BulkViewForm rows={rows} />
        )}
      </section>
    </div>
  );
}
