import { redirect } from "next/navigation";

import { ManualViewsForm } from "@/components/forms/manual-views-form";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { formatMoney } from "@/lib/utils";

export default async function AdminViewsPage() {
  const session = await getSession();
  if (!session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const store = await readStore();
  const approved = store.submissions
    .filter((submission) => submission.status === "approved")
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  return (
    <div className="dash-stack">
      <PageHeader
        title="View counts"
        description="Enter the total views on each approved post. Earnings follow that number. Counts can be raised, not lowered. After a campaign settles, leftover budget returns to the brand and further views are not paid."
      />

      {approved.length === 0 ? (
        <EmptyState
          title="No approved submissions"
          description="Approve a clip before recording its view count."
        />
      ) : (
        <ul className="space-y-2.5">
          {approved.map((submission) => {
            const campaign = store.campaigns.find((row) => row.id === submission.campaignId);
            const clipper = store.profiles.find((row) => row.id === submission.clipperId);
            const settled = Boolean(campaign?.settledAt);
            return (
              <li key={submission.id} className="list-row items-start">
                <div className="w-full space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{campaign?.title ?? "Unknown campaign"}</p>
                      <p className="text-sm text-muted">
                        {clipper?.displayName || clipper?.email || "Unknown clipper"}
                        {" · "}
                        {submission.platform}
                      </p>
                      <a
                        href={submission.postUrl}
                        className="text-sm text-foreground underline-offset-2 hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {submission.postUrl}
                      </a>
                      <p className="text-xs text-muted">
                        {submission.views.toLocaleString("en-NA")} views · earned{" "}
                        {formatMoney(submission.earningsCents)}
                      </p>
                    </div>
                    {settled ? <Badge tone="muted">Settled</Badge> : <Badge tone="gold">Open</Badge>}
                  </div>
                  {settled ? (
                    <p className="text-sm text-muted">
                      This campaign is settled. Further views are not paid.
                    </p>
                  ) : (
                    <div className="border-t border-border/80 pt-3">
                      <ManualViewsForm submissionId={submission.id} views={submission.views} />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
