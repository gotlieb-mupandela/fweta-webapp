"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { reviewSubmissionAction } from "@/app/actions/submissions";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

export function SubmissionReviewForm({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
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
    <div className="flex flex-col gap-2">
      <form
        className="flex flex-wrap items-end gap-2"
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
        <div>
          <Label htmlFor={`views-${submissionId}`}>Checked views</Label>
          <Input
            id={`views-${submissionId}`}
            name="views"
            type="number"
            min={0}
            step={1}
            placeholder="0"
            className="h-9 w-32"
          />
        </div>
        <Button size="sm" variant="gold" type="submit" disabled={pending}>
          Approve
        </Button>
        <Button
          size="sm"
          variant="secondary"
          type="button"
          disabled={pending}
          onClick={() => review("rejected")}
        >
          Reject
        </Button>
      </form>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          review("flagged", String(fd.get("note") || "Flagged"));
        }}
      >
        <div>
          <Label htmlFor={`flag-${submissionId}`} className="sr-only">
            Flag note
          </Label>
          <Input
            id={`flag-${submissionId}`}
            name="note"
            placeholder="Flag reason"
            className="h-9 w-40"
          />
        </div>
        <Button size="sm" variant="danger" type="submit" disabled={pending}>
          Flag
        </Button>
      </form>
      <FieldError>{error}</FieldError>
    </div>
  );
}
