"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { reviewSubmissionAction } from "@/app/actions/submissions";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

export function SubmissionReviewForm({
  submissionId,
  mode = "review",
}: {
  submissionId: string;
  mode?: "review" | "reject";
}) {
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

  if (mode === "reject") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted">
          Rejecting an approved clip returns unsettled earnings to the campaign budget.
        </p>
        <div>
          <Button size="sm" variant="secondary" type="button" disabled={pending} onClick={() => review("rejected")}>
            Reject
          </Button>
        </div>
        <FieldError>{error}</FieldError>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="gold" type="button" disabled={pending} onClick={() => review("approved")}>
          Approve
        </Button>
        <Button size="sm" variant="secondary" type="button" disabled={pending} onClick={() => review("rejected")}>
          Reject
        </Button>
      </div>
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
          <Input id={`flag-${submissionId}`} name="note" placeholder="Flag reason" className="h-9 w-40" />
        </div>
        <Button size="sm" variant="danger" type="submit" disabled={pending}>
          Flag
        </Button>
      </form>
      <FieldError>{error}</FieldError>
    </div>
  );
}
