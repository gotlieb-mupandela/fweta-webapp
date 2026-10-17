"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { reviewSubmissionAction } from "@/app/actions/submissions";
import { Button } from "@/components/ui/button";
import { FieldError, Label, Textarea } from "@/components/ui/input";

export function SubmissionReviewForm({
  submissionId,
  canApprove = true,
  cancelOnly = false,
}: {
  submissionId: string;
  canApprove?: boolean;
  cancelOnly?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function review(status: "approved" | "rejected" | "flagged") {
    setError(null);
    startTransition(async () => {
      const res = await reviewSubmissionAction(submissionId, {
        status,
        reviewNote: reason.trim() || undefined,
      });
      if (!res.ok) setError(res.error);
      else {
        setReason("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2">
      <div>
        <Label htmlFor={`reason-${submissionId}`}>Reason</Label>
        <Textarea
          id={`reason-${submissionId}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={
            cancelOnly
              ? "Required. The unsettled share returns to the brand. Wallet money stays."
              : "Required to reject or flag. Name the rule the clip missed."
          }
          className="min-h-20"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {cancelOnly ? null : (
          <Button
            size="sm"
            variant="gold"
            disabled={pending || !canApprove}
            onClick={() => review("approved")}
          >
            Approve
          </Button>
        )}
        <Button
          size="sm"
          variant="secondary"
          disabled={pending || reason.trim().length < 3}
          onClick={() => review("rejected")}
        >
          {cancelOnly ? "Reject and return" : "Reject"}
        </Button>
        {cancelOnly ? null : (
          <Button
            size="sm"
            variant="danger"
            disabled={pending || reason.trim().length < 3}
            onClick={() => review("flagged")}
          >
            Flag
          </Button>
        )}
      </div>
      {!canApprove ? (
        <p className="text-xs text-muted">Approve unlocks once estimated earnings clear the minimum.</p>
      ) : null}
      <FieldError>{error}</FieldError>
    </div>
  );
}
