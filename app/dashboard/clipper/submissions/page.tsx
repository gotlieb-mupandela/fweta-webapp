import Link from "next/link";
import { redirect } from "next/navigation";

import { listClipperSubmissions } from "@/app/actions/submissions";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { formatMoney, formatNumber } from "@/lib/utils";

export default async function ClipperSubmissionsPage() {
  const session = await getSession();
  if (!session?.roles.includes("clipper") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const [submissions, store] = await Promise.all([
    listClipperSubmissions(),
    readStore(),
  ]);

  return (
    <div className="dash-stack">
      <PageHeader title="My submissions" description="Track review status and earnings." />

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
            return (
              <li key={s.id} className="list-row items-start">
                <div className="flex w-full flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{campaign?.title ?? "Campaign"}</p>
                    <a
                      href={s.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block break-all text-sm text-gold-deep hover:underline"
                    >
                      {s.postUrl}
                    </a>
                    <p className="mt-1 text-xs text-muted">
                      {s.platform} · {formatNumber(s.views)} views · {formatMoney(s.earningsCents)}
                    </p>
                    {s.reviewNote ? (
                      <p className="mt-2 text-xs text-muted">Reviewer note: {s.reviewNote}</p>
                    ) : null}
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
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
