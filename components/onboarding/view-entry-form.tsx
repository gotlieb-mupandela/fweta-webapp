"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { recordSubmissionViewsAction } from "@/app/actions/views";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

export function ViewEntryForm({
  submissionId,
  currentViews,
}: {
  submissionId: string;
  currentViews: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const fd = new FormData(event.currentTarget);
        const views = Number(fd.get("views"));
        setError(null);
        startTransition(async () => {
          const res = await recordSubmissionViewsAction({ submissionId, views });
          if (!res.ok) setError(res.error);
          else router.refresh();
        });
      }}
    >
      <div>
        <Label htmlFor={`views-${submissionId}`}>Qualified views</Label>
        <Input
          id={`views-${submissionId}`}
          name="views"
          type="number"
          min={currentViews}
          step={1}
          required
          defaultValue={currentViews}
        />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving..." : "Save views"}
      </Button>
      <FieldError>{error}</FieldError>
    </form>
  );
}
