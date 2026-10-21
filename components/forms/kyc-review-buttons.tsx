"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { reviewKycAction } from "@/app/actions/growth";
import { Button } from "@/components/ui/button";
import { FieldError, Input } from "@/components/ui/input";

export function KycReviewButtons({ userId }: { userId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function decide(status: "verified" | "rejected") {
    setError(null);
    startTransition(async () => {
      const res = await reviewKycAction({ userId, status, reviewNote: note });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Input
        aria-label="Review note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Note, required if you reject"
      />
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="gold" disabled={pending} onClick={() => decide("verified")}>
          Verify identity
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => decide("rejected")}>
          Reject
        </Button>
      </div>
      <FieldError>{error}</FieldError>
    </div>
  );
}
