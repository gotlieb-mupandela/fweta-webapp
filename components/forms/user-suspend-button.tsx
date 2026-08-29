"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { adminSetUserSuspended } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";

export function UserSuspendButton({
  userId,
  suspended,
}: {
  userId: string;
  suspended: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant={suspended ? "secondary" : "danger"}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await adminSetUserSuspended(userId, !suspended);
          router.refresh();
        })
      }
    >
      {suspended ? "Unsuspend" : "Suspend"}
    </Button>
  );
}
