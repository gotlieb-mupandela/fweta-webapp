"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { markAllNotificationsReadAction } from "@/app/actions/notifications";
import { Button } from "@/components/ui/button";

export function MarkAllReadButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await markAllNotificationsReadAction();
          router.refresh();
        });
      }}
    >
      {pending ? "Marking…" : "Mark all read"}
    </Button>
  );
}
