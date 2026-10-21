"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { reviewVerificationAction } from "@/app/actions/verification";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";

export function VerificationReviewButtons({ userId }: { userId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function review(status: "verified" | "rejected") {
    setError(null);
    startTransition(async () => {
      const res = await reviewVerificationAction(userId, status);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={() => review("verified")}>
          Mark verified
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => review("rejected")}
        >
          Reject
        </Button>
      </div>
      <FieldError>{error}</FieldError>
    </div>
  );
}
