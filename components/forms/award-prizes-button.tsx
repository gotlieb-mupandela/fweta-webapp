"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { awardWeeklyPrizesAction } from "@/app/actions/growth";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess } from "@/components/ui/input";

export function AwardPrizesButton({ awarded }: { awarded: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(awarded);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="sm"
        disabled={pending || done}
        onClick={() =>
          startTransition(async () => {
            const res = await awardWeeklyPrizesAction();
            if (!res.ok) setError(res.error);
            else {
              setDone(true);
              router.refresh();
            }
          })
        }
      >
        {done ? "Prizes awarded" : "Award this week's prizes"}
      </Button>
      <FieldError>{error}</FieldError>
      {done ? <FieldSuccess>Published prizes are in the available balance.</FieldSuccess> : null}
    </div>
  );
}
