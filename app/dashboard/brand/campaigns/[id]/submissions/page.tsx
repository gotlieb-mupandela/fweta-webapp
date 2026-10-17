import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCampaign } from "@/app/actions/campaigns";
import { listCampaignSubmissions } from "@/app/actions/submissions";
import { SubmissionReviewForm } from "@/components/forms/submission-review-form";
import { ContextHelp } from "@/components/onboarding/context-help";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { canEditCampaign, canViewCampaign } from "@/lib/onboarding/access";
import {
  PLATFORM_LABEL,
  lastCheckedLabel,
  latestConfirmedSnapshot,
  meetsPayoutMinimum,
  meetsViewFloor,
  projectedPayoutCents,
  qualifiedViewCount,
  readyForReview,
} from "@/lib/rewards/content-rewards";
import { formatMoney, formatNumber } from "@/lib/utils";

export default async function CampaignSubmissionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const session = await getSession();
  if (!session?.roles.includes("brand") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const campaign = await getCampaign(id);
  if (!campaign) notFound();
  const accessStore = await readStore();
  if (!canViewCampaign(accessStore, session, campaign)) {
    redirect("/dashboard/brand/campaigns");
  }
  const canEdit = canEditCampaign(accessStore, session, campaign);

  const [submissions, store] = await Promise.all([
    listCampaignSubmissions(id),
    readStore(),
  ]);

  const activeTab = tab === "approved" || tab === "rejected" || tab === "warming" ? tab : "pending";
  const visible = submissions.filter((submission) => {
    if (activeTab === "approved") return submission.status === "approved";
    if (activeTab === "rejected") return submission.status === "rejected" || submission.status === "flagged";
    if (activeTab === "warming") return submission.status === "pending" && !readyForReview(submission, campaign, submissions);
    return submission.status === "pending" && readyForReview(submission, campaign, submissions);
  });

  const tabs = [
    { id: "pending", label: "Pending" },
    { id: "warming", label: "Below minimum" },
    { id: "approved", label: "Approved" },
    { id: "rejected", label: "Rejected" },
  ] as const;

  return (
    <div className="dash-stack">
      <PageHeader
        title="Review queue"
        description={`Approve or reject clips for ${campaign.title}. Rejection needs a reason.`}
        action={
          <Link href={`/dashboard/brand/campaigns/${id}`}>
            <Button size="sm" variant="secondary">
              Campaign
            </Button>
          </Link>
        }
      />

      <ContextHelp
        title="First review"
        body="Approve a clip that matches the brief, or reject it with a short note. Approved clips can earn after an admin records views."
        hint="A viewer can read the queue. Owners and managers decide."
      />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((item) => (
          <Link
            key={item.id}
            href={`/dashboard/brand/campaigns/${id}/submissions?tab=${item.id}`}
            className={
              activeTab === item.id
                ? "shrink-0 rounded-full bg-foreground px-3.5 py-1.5 text-sm text-white"
                : "shrink-0 rounded-full border border-border bg-white px-3.5 py-1.5 text-sm text-muted"
            }
          >
            {item.label}
          </Link>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState title="Nothing in this tab" description="New clips show up here after creators submit a link." />
      ) : (
        <ul className="space-y-2.5">
          {visible.map((submission) => {
            const clipper = store.profiles.find((p) => p.id === submission.clipperId);
            const projected = projectedPayoutCents(submission, campaign, submissions);
            const canApprove = meetsViewFloor(submission, campaign) && meetsPayoutMinimum(submission, campaign, submissions);
            const checked = latestConfirmedSnapshot(store.viewSnapshots, submission.id);
            return (
              <li key={submission.id} className="list-row items-start">
                <div className="w-full space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{clipper?.displayName ?? "Creator"}</p>
                      <a
                        href={submission.postUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block break-all text-sm text-gold-deep hover:underline"
                      >
                        {submission.postUrl}
                      </a>
                      <p className="mt-1 text-xs text-muted">
                        {PLATFORM_LABEL[submission.platform]} · {formatNumber(qualifiedViewCount(submission))} qualified views ·{" "}
                        {campaign.payModel === "pool" && !campaign.poolSettledAt ? "Estimate" : "Amount"}{" "}
                        {formatMoney(projected)} · {lastCheckedLabel(checked?.recordedAt ?? null)}
                      </p>
                      <p className="mt-1 text-xs text-muted">Bot score {submission.fraudScore}</p>
                      {submission.fraudReasons.length > 0 ? (
                        <p className="mt-1 text-xs text-muted">{submission.fraudReasons.join(" ")}</p>
                      ) : null}
                      {submission.reviewNote ? (
                        <p className="mt-2 text-xs text-muted">Note: {submission.reviewNote}</p>
                      ) : null}
                    </div>
                    <Badge
                      tone={
                        submission.status === "approved"
                          ? "success"
                          : submission.status === "rejected"
                            ? "danger"
                            : submission.status === "flagged"
                              ? "gold"
                              : "muted"
                      }
                    >
                      {submission.status}
                    </Badge>
                  </div>
                  {(submission.status === "pending" || submission.status === "flagged") && canEdit ? (
                    <div className="border-t border-border/80 pt-3">
                      <SubmissionReviewForm submissionId={submission.id} canApprove={canApprove} />
                    </div>
                  ) : null}
                  {submission.status === "approved" && submission.releasedCents === 0 ? (
                    <div className="border-t border-border/80 pt-3">
                      <SubmissionReviewForm submissionId={submission.id} cancelOnly />
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
