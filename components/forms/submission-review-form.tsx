"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { reviewSubmissionAction } from "@/app/actions/submissions";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

export function SubmissionReviewForm({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function review(status: "approved" | "rejected" | "flagged", note?: string, views?: number) {
    setError(null);
    startTransition(async () => {
      const res = await reviewSubmissionAction(submissionId, { status, reviewNote: note, views });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        className="grid grid-cols-[1fr_auto_auto] items-end gap-2 max-sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const raw = String(fd.get("views") || "").trim();
          const views = raw === "" ? undefined : Number(raw);
          if (views != null && (!Number.isInteger(views) || views < 0)) {
            setError("Enter a whole view count.");
            return;
          }
          review("approved", undefined, views);
        }}
      >
        <div className="max-sm:col-span-2">
          <Label htmlFor={`views-${submissionId}`}>Checked views</Label>
          <Input
            id={`views-${submissionId}`}
            name="views"
            type="number"
            min={0}
            step={1}
            placeholder="0"
            className="h-11 w-full sm:max-w-[12rem]"
          />
        </div>
        <Button size="sm" variant="primary" type="submit" className="h-11" disabled={pending}>
          Approve
        </Button>
        <Button
          size="sm"
          variant="secondary"
          type="button"
          className="h-11"
          disabled={pending}
          onClick={() => review("rejected")}
        >
          Reject
        </Button>
      </form>
      <details className="group">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm text-muted hover:text-foreground">
          Flag this clip
        </summary>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          review("flagged", String(fd.get("note") || "Flagged"));
        }}
      >
        <div className="min-w-0 flex-1">
          <Label htmlFor={`flag-${submissionId}`} className="sr-only">
            Flag note
          </Label>
          <Input
            id={`flag-${submissionId}`}
            name="note"
            placeholder="Flag reason"
            className="h-11 w-full"
          />
        </div>
        <Button size="sm" variant="ghost" className="h-11 text-danger hover:text-danger" type="submit" disabled={pending}>
          Flag
        </Button>
      </form>
      </details>
      <FieldError>{error}</FieldError>
    </div>
  );
}
