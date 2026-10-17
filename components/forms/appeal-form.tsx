"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { appealClipAction } from "@/app/actions/submissions";
import { Button } from "@/components/ui/button";
import { FieldError, Textarea } from "@/components/ui/input";

export function AppealForm({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
          const res = await appealClipAction(submissionId, { note: String(fd.get("note") || "") });
          if (!res.ok) setError(res.error);
          else router.refresh();
        });
      }}
    >
      <Textarea name="note" required minLength={3} placeholder="Why should this clip stay payable?" />
      <FieldError>{error}</FieldError>
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? "Sending…" : "Appeal this clip"}
      </Button>
    </form>
  );
}
