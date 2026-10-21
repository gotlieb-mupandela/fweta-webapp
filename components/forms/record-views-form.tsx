"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { recordCheckedViewsAction } from "@/app/actions/submissions";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Input, Label } from "@/components/ui/input";
import { formatMoney } from "@/lib/utils";

export function RecordViewsForm({
  submissionId,
  currentViews,
}: {
  submissionId: string;
  currentViews: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const views = Number(fd.get("views"));
        if (!Number.isInteger(views) || views < 0) {
          setError("Enter a whole view count.");
          return;
        }
        setError(null);
        setSuccess(null);
        startTransition(async () => {
          const res = await recordCheckedViewsAction({ submissionId, views });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          setSuccess(
            res.creditedCents > 0
              ? `Views saved. Credited ${formatMoney(res.creditedCents)} to the clipper wallet.`
              : "Views saved. No new earnings yet. CPM pays once per 1,000 views, up to the video cap.",
          );
          router.refresh();
        });
      }}
    >
      <div>
        <Label htmlFor={`checked-${submissionId}`}>Checked views</Label>
        <Input
          id={`checked-${submissionId}`}
          name="views"
          type="number"
          min={0}
          step={1}
          required
          defaultValue={currentViews}
          className="h-9 w-32"
        />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save views"}
      </Button>
      <FieldError>{error}</FieldError>
      <FieldSuccess>{success}</FieldSuccess>
    </form>
  );
}
