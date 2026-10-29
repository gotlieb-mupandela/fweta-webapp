"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { confirmCreatorViewAction, saveAdminViewAction, saveBulkViewsAction } from "@/app/actions/views";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Input, Label, Textarea } from "@/components/ui/input";
import { SCREENSHOT_MAX_BYTES, uploadLimitMessage } from "@/lib/uploads/limits";

export type ViewCheckRow = {
  submissionId: string;
  campaignTitle: string;
  creatorName: string;
  postUrl: string;
  platform: string;
  baseline: number;
  qualified: number;
  earningsLabel: string;
  budgetLeftLabel: string;
  lastChecked: string;
};

export type PendingViewReport = {
  snapshotId: string;
  submissionId: string;
  campaignTitle: string;
  creatorName: string;
  postUrl: string;
  views: number;
  likes: number | null;
  comments: number | null;
  note: string | null;
  screenshotPath: string | null;
  reportedAt: string;
};

const NOTICE_KEY = "fweta-view-notice";

function rememberNotice(message: string) {
  try {
    sessionStorage.setItem(NOTICE_KEY, message);
  } catch {
    // The in-form message still shows when the row stays on the page.
  }
}

export function ViewCheckNotice() {
  const [message] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const saved = sessionStorage.getItem(NOTICE_KEY);
      if (!saved) return null;
      sessionStorage.removeItem(NOTICE_KEY);
      return saved;
    } catch {
      return null;
    }
  });

  if (!message) return null;
  return (
    <p className="rounded-2xl border border-border bg-white px-4 py-3 text-sm text-foreground" role="status">
      {message}
    </p>
  );
}

function CountFields({
  viewsDefault,
  likesDefault,
  commentsDefault,
}: {
  viewsDefault?: number;
  likesDefault?: number | null;
  commentsDefault?: number | null;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div>
        <Label>Views</Label>
        <Input name="views" inputMode="numeric" min={0} step={1} required defaultValue={viewsDefault ?? ""} />
      </div>
      <div>
        <Label>Likes</Label>
        <Input name="likes" inputMode="numeric" min={0} step={1} defaultValue={likesDefault ?? ""} />
      </div>
      <div>
        <Label>Comments</Label>
        <Input name="comments" inputMode="numeric" min={0} step={1} defaultValue={commentsDefault ?? ""} />
      </div>
    </div>
  );
}

export function AdminViewForm({ row }: { row: ViewCheckRow }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-3 border-t border-border/80 pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        const body = new FormData(e.currentTarget);
        body.set("submissionId", row.submissionId);
        const shot = body.get("screenshot");
        if (shot instanceof File && shot.size > 0) {
          const tooBig = uploadLimitMessage(shot, SCREENSHOT_MAX_BYTES, "Screenshot");
          if (tooBig) {
            setError(tooBig);
            return;
          }
        }
        startTransition(async () => {
          const res = await saveAdminViewAction(body);
          if (!res.ok) setError(res.error);
          else {
            setSuccess(res.message);
            rememberNotice(res.message);
            router.refresh();
          }
        });
      }}
    >
      <CountFields />
      <div>
        <Label>Note</Label>
        <Textarea name="note" className="min-h-16" maxLength={500} placeholder="Optional" />
      </div>
      <div>
        <Label>Screenshot</Label>
        <Input name="screenshot" type="file" accept="image/png,image/jpeg,image/webp" />
        <p className="mt-1.5 text-xs text-muted">PNG, JPG, or WebP. 2 MB or smaller.</p>
      </div>
      <FieldError>{error}</FieldError>
      <FieldSuccess>{success}</FieldSuccess>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save count"}
      </Button>
    </form>
  );
}

export function ConfirmViewForm({ report }: { report: PendingViewReport }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-3 border-t border-border/80 pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        const body = new FormData(e.currentTarget);
        body.set("snapshotId", report.snapshotId);
        body.set("submissionId", report.submissionId);
        startTransition(async () => {
          const res = await confirmCreatorViewAction(body);
          if (!res.ok) setError(res.error);
          else {
            setSuccess(res.message);
            rememberNotice(res.message);
            router.refresh();
          }
        });
      }}
    >
      <CountFields viewsDefault={report.views} likesDefault={report.likes} commentsDefault={report.comments} />
      <div>
        <Label>Note</Label>
        <Textarea name="note" className="min-h-16" maxLength={500} defaultValue={report.note ?? ""} />
      </div>
      <FieldError>{error}</FieldError>
      <FieldSuccess>{success}</FieldSuccess>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Confirming…" : "Confirm count"}
      </Button>
    </form>
  );
}

export function BulkViewForm({ rows }: { rows: ViewCheckRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (rows.length === 0) return null;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        const data = new FormData(e.currentTarget);
        const entries = rows.flatMap((row) => {
          const viewsText = String(data.get(`views-${row.submissionId}`) ?? "").trim();
          if (!viewsText) return [];
          const likesText = String(data.get(`likes-${row.submissionId}`) ?? "").trim();
          const commentsText = String(data.get(`comments-${row.submissionId}`) ?? "").trim();
          const note = String(data.get(`note-${row.submissionId}`) ?? "").trim();
          return [
            {
              submissionId: row.submissionId,
              views: Number(viewsText),
              likes: likesText === "" ? null : Number(likesText),
              comments: commentsText === "" ? null : Number(commentsText),
              note,
            },
          ];
        });
        if (entries.length === 0) {
          setError("Enter at least one view count.");
          return;
        }
        startTransition(async () => {
          const res = await saveBulkViewsAction({ entries });
          if (!res.ok) setError(res.error);
          else {
            setSuccess(res.message);
            rememberNotice(res.message);
            router.refresh();
          }
        });
      }}
    >
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
                  {row.platform} · baseline {row.baseline} · {row.qualified} qualified · {row.earningsLabel} · {row.budgetLeftLabel} left · {row.lastChecked}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <Input name={`views-${row.submissionId}`} inputMode="numeric" min={0} step={1} placeholder="Views" aria-label={`Views for ${row.creatorName}`} />
                <Input name={`likes-${row.submissionId}`} inputMode="numeric" min={0} step={1} placeholder="Likes" aria-label={`Likes for ${row.creatorName}`} />
                <Input name={`comments-${row.submissionId}`} inputMode="numeric" min={0} step={1} placeholder="Comments" aria-label={`Comments for ${row.creatorName}`} />
                <Input name={`note-${row.submissionId}`} maxLength={500} placeholder="Note" aria-label={`Note for ${row.creatorName}`} />
              </div>
            </div>
          </li>
        ))}
      </ul>
      <FieldError>{error}</FieldError>
      <FieldSuccess>{success}</FieldSuccess>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save filled counts"}
      </Button>
    </form>
  );
}
