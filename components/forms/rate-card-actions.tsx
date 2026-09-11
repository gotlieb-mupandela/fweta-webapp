"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { toggleRateCardAction } from "@/app/actions/influencer";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";

export function RateCardActions({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="shrink-0 text-right">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await toggleRateCardAction(id, !active);
            if (!res.ok) setError(res.error);
            else router.refresh();
          });
        }}
      >
        {pending ? "Updating…" : active ? "Deactivate" : "Activate"}
      </Button>
      <FieldError>{error}</FieldError>
    </div>
  );
}
