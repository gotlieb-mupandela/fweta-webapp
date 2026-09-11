import { listClipperSubmissions } from "@/app/actions/submissions";
import { Badge, EmptyState } from "@/components/ui/card";
import { readStore } from "@/lib/db/store";
import { formatMoney, formatNumber } from "@/lib/utils";

export async function SubmissionsList({
  emptyAction,
}: {
  emptyAction?: React.ReactNode;
}) {
  const [submissions, store] = await Promise.all([listClipperSubmissions(), readStore()]);

  if (submissions.length === 0) {
    return (
      <EmptyState
        title="No submissions"
        description="Browse campaigns to submit your first clip."
        action={emptyAction}
      />
    );
  }

  return (
    <ul className="space-y-3">
      {submissions.map((s) => {
        const campaign = store.campaigns.find((c) => c.id === s.campaignId);
        return (
          <li key={s.id} className="rounded-2xl border border-border bg-white px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{campaign?.title ?? "Campaign"}</p>
                <a
                  href={s.postUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block break-all text-sm text-gold hover:underline"
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
  );
}
