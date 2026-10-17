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
  const accessStore = await readStore();
  if (!canViewCampaign(accessStore, session, campaign)) {
    redirect("/dashboard/brand/campaigns");
  }
  const canEdit = canEditCampaign(accessStore, session, campaign);

  const [submissions, store] = await Promise.all([
    listCampaignSubmissions(id),
    readStore(),
  ]);

  return (
    <div className="dash-stack">
      <PageHeader
        title="Submission queue"
        description={`Review clips for ${campaign.title}.`}
        action={
          <Link href={`/dashboard/brand/campaigns/${id}`}>
            <Button size="sm" variant="secondary">
              ← Back to campaign
            </Button>
          </Link>
        }
      />

      <ContextHelp
        title="First review"
        body="Approve a clip that matches the brief, or reject it with a short note. Approved clips can earn after an admin records views."
        hint="A viewer can read the queue. Owners and managers decide."
      />

      {submissions.length === 0 ? (
        <EmptyState
          title="No clips yet"
          description="When a creator submits a link, approve it or reject it from this queue."
        />
      ) : (
        <ul className="space-y-2.5">
          {submissions.map((s) => {
            const clipper = store.profiles.find((p) => p.id === s.clipperId);
            return (
              <li key={s.id} className="list-row items-start">
                <div className="w-full space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{clipper?.displayName ?? "Creator"}</p>
                      <a
                        href={s.postUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block break-all text-sm text-gold-deep hover:underline"
                      >
                        {s.postUrl}
                      </a>
                      <p className="mt-1 text-xs text-muted">
                        {s.platform} · {formatNumber(s.views)} views · {formatMoney(s.earningsCents)}{" "}
                        earned
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
                  {s.status === "pending" && canEdit ? (
                    <div className="border-t border-border/80 pt-3">
                      <SubmissionReviewForm submissionId={s.id} />
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
