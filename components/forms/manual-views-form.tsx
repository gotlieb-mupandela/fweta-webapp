"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setManualViewsAction } from "@/app/actions/views";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

export function ManualViewsForm({
  submissionId,
  views,
}: {
  submissionId: string;
  views: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fieldId = `views-${submissionId}`;

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const next = Number(new FormData(form).get("views"));
        if (!Number.isInteger(next) || next < 0) {
          setError("Enter a whole view count.");
          return;
        }
        setError(null);
        startTransition(async () => {
          const res = await setManualViewsAction({ submissionId, views: next });
          if (!res.ok) setError(res.error);
          else router.refresh();
        });
      }}
    >
      <div>
        <Label htmlFor={fieldId}>Total views</Label>
        <Input
          id={fieldId}
          name="views"
          type="number"
          inputMode="numeric"
          min={views}
          step={1}
          required
          defaultValue={views}
          className="w-36"
        />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save views"}
      </Button>
      <FieldError>{error}</FieldError>
    </form>
  );
}
