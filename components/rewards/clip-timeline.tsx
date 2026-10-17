import type { Submission } from "@/lib/db/types";

function when(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toLocaleString("en-NA", { dateStyle: "medium", timeStyle: "short" });
}

export function ClipTimeline({ submission }: { submission: Submission }) {
  const events = [
    { label: "Submitted", at: when(submission.createdAt) },
    submission.approvedAt ? { label: "Approved", at: when(submission.approvedAt) } : null,
    submission.status === "rejected"
      ? { label: "Rejected", at: when(submission.updatedAt) }
      : null,
    submission.lastPolledAt ? { label: "Views checked", at: when(submission.lastPolledAt) } : null,
    submission.holdUntil && submission.payoutState === "holding"
      ? { label: "Hold ends", at: when(submission.holdUntil) }
      : null,
    submission.releasedAt ? { label: "In wallet", at: when(submission.releasedAt) } : null,
  ].filter((event): event is { label: string; at: string | null } => Boolean(event?.at));

  if (events.length === 0) return null;

  return (
    <ol className="mt-3 space-y-1 border-l border-border pl-3">
      {events.map((event) => (
        <li key={`${event.label}-${event.at}`} className="text-xs text-muted">
          <span className="font-medium text-foreground">{event.label}</span>
          {" · "}
          {event.at}
        </li>
      ))}
      {submission.status === "rejected" && submission.reviewNote ? (
        <li className="text-xs text-foreground">Brand note: {submission.reviewNote}</li>
      ) : null}
    </ol>
  );
}
