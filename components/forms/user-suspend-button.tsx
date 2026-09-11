"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { adminSetUserSuspended } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";

export function UserSuspendButton({
  userId,
  suspended,
  disableSelf,
}: {
  userId: string;
  suspended: boolean;
  disableSelf?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (disableSelf) {
    return <p className="text-xs text-muted">You</p>;
  }

  return (
    <div className="text-right">
      <Button
        size="sm"
        variant={suspended ? "secondary" : "danger"}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await adminSetUserSuspended(userId, !suspended);
            if (!res.ok) {
              setError(res.error);
              return;
            }
            router.refresh();
          })
        }
      >
        {suspended ? "Unsuspend" : "Suspend"}
      </Button>
      <FieldError>{error}</FieldError>
    </div>
  );
}
