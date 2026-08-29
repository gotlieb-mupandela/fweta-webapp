"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateNotificationsAction } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { FieldError, Label } from "@/components/ui/input";

export function NotificationsForm({
  notifyEmail,
  notifyWithdrawals,
  notifyBookings,
}: {
  notifyEmail: boolean;
  notifyWithdrawals: boolean;
  notifyBookings: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
          const res = await updateNotificationsAction({
            notifyEmail: fd.get("notifyEmail") === "on",
            notifyWithdrawals: fd.get("notifyWithdrawals") === "on",
            notifyBookings: fd.get("notifyBookings") === "on",
          });
          if (!res.ok) setError(res.error);
          else router.refresh();
        });
      }}
    >
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="notifyEmail" defaultChecked={notifyEmail} />
        Email notifications
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="notifyWithdrawals" defaultChecked={notifyWithdrawals} />
        Withdrawal updates
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="notifyBookings" defaultChecked={notifyBookings} />
        Booking updates
      </label>
      <FieldError>{error}</FieldError>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save preferences"}
      </Button>
    </form>
  );
}
