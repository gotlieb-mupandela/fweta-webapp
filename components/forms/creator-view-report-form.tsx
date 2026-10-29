"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { reportCreatorViewsAction } from "@/app/actions/views";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Input, Label, Textarea } from "@/components/ui/input";
import { SCREENSHOT_MAX_BYTES, uploadLimitMessage } from "@/lib/uploads/limits";

export function CreatorViewReportForm({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Report views
      </Button>
    );
  }

  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        const body = new FormData(e.currentTarget);
        body.set("submissionId", submissionId);
        const shot = body.get("screenshot");
        if (shot instanceof File && shot.size > 0) {
          const tooBig = uploadLimitMessage(shot, SCREENSHOT_MAX_BYTES, "Screenshot");
          if (tooBig) {
            setError(tooBig);
            return;
          }
        }
        startTransition(async () => {
          const res = await reportCreatorViewsAction(body);
          if (!res.ok) setError(res.error);
          else {
            setSuccess(res.message);
            setOpen(false);
            router.refresh();
          }
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Views</Label>
          <Input name="views" inputMode="numeric" min={0} step={1} required />
        </div>
        <div>
          <Label>Likes</Label>
          <Input name="likes" inputMode="numeric" min={0} step={1} />
        </div>
        <div>
          <Label>Comments</Label>
          <Input name="comments" inputMode="numeric" min={0} step={1} />
        </div>
      </div>
      <div>
        <Label>Note</Label>
        <Textarea name="note" className="min-h-16" maxLength={500} placeholder="Optional" />
      </div>
      <div>
        <Label>Analytics screenshot</Label>
        <Input name="screenshot" type="file" accept="image/png,image/jpeg,image/webp" />
        <p className="mt-1.5 text-xs text-muted">Optional. PNG, JPG, or WebP, up to 2 MB. Earnings wait until an admin confirms.</p>
      </div>
      <FieldError>{error}</FieldError>
      <FieldSuccess>{success}</FieldSuccess>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Sending…" : "Send report"}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
