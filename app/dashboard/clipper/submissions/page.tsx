import Link from "next/link";
import { redirect } from "next/navigation";

import { listClipperSubmissions } from "@/app/actions/submissions";
import { PlatformChip } from "@/components/platforms/platform-chip";
import { AppealForm } from "@/components/forms/appeal-form";
import { CreatorViewReportForm } from "@/components/forms/creator-view-report-form";
import { ContextHelp } from "@/components/onboarding/context-help";
import { ClipTimeline } from "@/components/rewards/clip-timeline";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import {
  clipperClipStatus,
  lastCheckedLabel,
  latestConfirmedSnapshot,
  pendingCreatorSnapshot,
  qualifiedViewCount,
} from "@/lib/rewards/content-rewards";
import { formatMoney, formatNumber, shortUrl } from "@/lib/utils";

export default async function ClipperSubmissionsPage() {
  const session = await getSession();
  if (
    !session?.roles.includes("clipper") &&
    !session?.roles.includes("influencer") &&
    !session?.roles.includes("admin")
  ) {
    redirect("/dashboard");
  }

  const [submissions, store] = await Promise.all([
    listClipperSubmissions(),
    readStore(),
  ]);

  return (
    <div className="dash-stack">
      <PageHeader title="My submissions" description="Track review status and earnings." />
      <ContextHelp
        title="Approval or rejection shows here"
        body="Pending means the brand has not decided. Approved clips can earn after a view check. A rejection includes the brand's note."
        hint="Submit from the account you posted on so the stats stay with that profile."
      />

      {submissions.length === 0 ? (
        <EmptyState
          title="No submissions"
          description="Browse campaigns to submit your first clip."
          action={
            <Link href="/dashboard/clipper/campaigns">
              <Button size="sm">Browse campaigns</Button>
            </Link>
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {submissions.map((s) => {
            const campaign = store.campaigns.find((c) => c.id === s.campaignId);
            const clipStatus = campaign ? clipperClipStatus(s, campaign, store.submissions) : null;
            const checked = latestConfirmedSnapshot(store.viewSnapshots, s.id);
            const waiting = pendingCreatorSnapshot(store.viewSnapshots, s.id);
            return (
              <li key={s.id} className="list-row items-start">
                <div className="flex w-full flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{campaign?.title ?? "Campaign"}</p>
                    <a
                      href={shortUrl(s.postUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block break-words text-sm text-gold-deep hover:underline"
                    >
                      {shortUrl(s.postUrl)}
                    </a>
                    <div className="mt-2">
                      <PlatformChip platform={s.platform} />
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {formatNumber(qualifiedViewCount(s))} qualified views · {formatMoney(s.earningsCents)} ·{" "}
                      {lastCheckedLabel(checked?.recordedAt ?? null)}
                    </p>
                    {waiting ? (
                      <p className="mt-1 text-xs text-muted">Creator report waiting for confirmation.</p>
                    ) : null}
                    {clipStatus?.note ? <p className="mt-1 text-xs text-muted">{clipStatus.note}</p> : null}
                    {s.status === "rejected" && s.reviewNote ? (
                      <p className="mt-1 text-xs text-foreground">Brand note: {s.reviewNote}</p>
                    ) : null}
                    <ClipTimeline submission={s} />
                    {s.status !== "rejected" ? <CreatorViewReportForm submissionId={s.id} /> : null}
                    {s.fraudState === "review" && !s.appealUsed ? (
                      <div className="mt-3">
                        <AppealForm submissionId={s.id} />
                      </div>
                    ) : null}
                  </div>
                  <Badge
                    tone={
                      clipStatus?.key === "paid"
                        ? "success"
                        : clipStatus?.key === "rejected" || clipStatus?.key === "budget_stopped"
                          ? "danger"
                          : "gold"
                    }
                  >
                    {clipStatus?.label ?? s.status}
                  </Badge>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
