import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCampaign } from "@/app/actions/campaigns";
import { listCampaignSubmissions } from "@/app/actions/submissions";
import { SubmissionReviewForm } from "@/components/forms/submission-review-form";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { formatMoney, formatNumber } from "@/lib/utils";

export default async function CampaignSubmissionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.roles.includes("brand") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const campaign = await getCampaign(id);
  if (!campaign) notFound();
  if (campaign.brandId !== session.id && !session.roles.includes("admin")) {
    redirect("/dashboard/brand/campaigns");
  }

  const [submissions, store] = await Promise.all([
    listCampaignSubmissions(id),
    readStore(),
  ]);

  return (
    <div>
      <PageHeader
        title="Submission queue"
        description={`Review clips for ${campaign.title}.`}
        action={
          <Link href={`/dashboard/brand/campaigns/${id}`} className="text-sm text-muted">
            ← Back to campaign
          </Link>
        }
      />

      {submissions.length === 0 ? (
        <EmptyState title="No submissions" description="Clippers haven't submitted clips yet." />
      ) : (
        <ul className="space-y-4">
          {submissions.map((s) => {
            const clipper = store.profiles.find((p) => p.id === s.clipperId);
            return (
              <li
                key={s.id}
                className="rounded-2xl border border-border bg-white px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{clipper?.displayName ?? "Creator"}</p>
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
                  <Badge
                    tone={
                      s.status === "approved"
                        ? "success"
                        : s.status === "rejected"
                          ? "danger"
                          : s.status === "flagged"
                            ? "gold"
                            : "muted"
                    }
                  >
                    {s.status}
                  </Badge>
                </div>
                {s.status === "pending" ? (
                  <div className="mt-4 border-t border-border pt-4">
                    <SubmissionReviewForm submissionId={s.id} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
