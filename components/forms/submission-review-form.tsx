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

  function review(status: "approved" | "rejected" | "flagged", note?: string) {
    setError(null);
    startTransition(async () => {
      const res = await reviewSubmissionAction(submissionId, { status, reviewNote: note });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="gold" disabled={pending} onClick={() => review("approved")}>
          Approve
        </Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => review("rejected")}>
          Reject
        </Button>
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
      </div>
      <FieldError>{error}</FieldError>
    </div>
  );
}
