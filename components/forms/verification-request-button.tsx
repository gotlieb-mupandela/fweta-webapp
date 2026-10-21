"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { requestVerificationCodeAction } from "@/app/actions/verification";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";

export function VerificationRequestButton({ pendingAlready }: { pendingAlready: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <Button
        type="button"
        disabled={pending || pendingAlready}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await requestVerificationCodeAction();
            if (!res.ok) {
              setError(res.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {pending ? "Creating…" : pendingAlready ? "Code already issued" : "Get a bio code"}
      </Button>
      <FieldError>{error}</FieldError>
    </div>
  );
}
