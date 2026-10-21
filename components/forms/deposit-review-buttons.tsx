"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { confirmBrandDepositAction, rejectBrandDepositAction } from "@/app/actions/wallet";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

export function DepositReviewButtons({ depositId }: { depositId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex w-full flex-col gap-2 sm:w-auto sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
          const res = await confirmBrandDepositAction(
            depositId,
            String(fd.get("bankReference") || ""),
          );
          if (!res.ok) {
            setError(res.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      <div className="w-full sm:w-56">
        <Label htmlFor={`ref-${depositId}`}>EFT reference</Label>
        <Input id={`ref-${depositId}`} name="bankReference" placeholder="Bank reference" />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Confirm and credit"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const res = await rejectBrandDepositAction(depositId);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              router.refresh();
            });
          }}
        >
          Reject
        </Button>
      </div>
      <FieldError>{error}</FieldError>
    </form>
  );
}
