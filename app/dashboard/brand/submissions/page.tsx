import Link from "next/link";
import { redirect } from "next/navigation";

import { listBrandPendingSubmissions } from "@/app/actions/submissions";
import { SubmissionReviewForm } from "@/components/forms/submission-review-form";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { formatMoney, formatNumber } from "@/lib/utils";

export default async function BrandSubmissionsInboxPage() {
  const session = await getSession();
  if (!session?.roles.includes("brand") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const [submissions, store] = await Promise.all([
    listBrandPendingSubmissions(),
    readStore(),
  ]);

  return (
    <div>
      <PageHeader
        title="Submission reviews"
        description="Approve, reject, or flag clips across all of your campaigns."
      />

      {submissions.length === 0 ? (
        <EmptyState
          title="No pending reviews"
          description="When clippers submit to your campaigns, they show up here."
        />
      ) : (
        <ul className="space-y-4">
          {submissions.map((s) => {
            const clipper = store.profiles.find((p) => p.id === s.clipperId);
            const campaign = store.campaigns.find((c) => c.id === s.campaignId);
            return (
              <li key={s.id} className="rounded-2xl border border-border bg-white px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{clipper?.displayName ?? "Creator"}</p>
                    {campaign ? (
                      <Link
                        href={`/dashboard/brand/campaigns/${campaign.id}`}
                        className="mt-0.5 block text-xs text-muted hover:underline"
                      >
                        {campaign.title}
                      </Link>
                    ) : null}
                    <a
                      href={s.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block text-sm text-gold hover:underline"
                    >
                      {s.postUrl}
                    </a>
                    <p className="mt-1 text-xs text-muted">
                      {s.platform} · {formatNumber(s.views)} views · {formatMoney(s.earningsCents)} earned
                    </p>
                  </div>
                  <Badge tone="muted">{s.status}</Badge>
                </div>
                <div className="mt-4 border-t border-border pt-4">
                  <SubmissionReviewForm submissionId={s.id} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
