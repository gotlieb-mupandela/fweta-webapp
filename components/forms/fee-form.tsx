"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setPlatformFeeAction } from "@/app/actions/growth";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

export function FeeForm({ feeBps }: { feeBps: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const percent = Number(new FormData(event.currentTarget).get("percent"));
        setError(null);
        startTransition(async () => {
          const res = await setPlatformFeeAction({ platformFeeBps: Math.round(percent * 100) });
          if (!res.ok) setError(res.error);
          else router.refresh();
        });
      }}
    >
      <div>
        <Label htmlFor="percent">Fee on new campaigns (%)</Label>
        <Input
          id="percent"
          name="percent"
          type="number"
          min="0"
          max="25"
          step="0.01"
          defaultValue={(feeBps / 100).toFixed(2)}
          className="w-32"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save fee"}
      </Button>
      <FieldError>{error}</FieldError>
    </form>
  );
}
