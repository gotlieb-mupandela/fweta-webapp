"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateNotificationsAction } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess } from "@/components/ui/input";

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
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        setSuccess(false);
        startTransition(async () => {
          const res = await updateNotificationsAction({
            notifyEmail: fd.get("notifyEmail") === "on",
            notifyWithdrawals: fd.get("notifyWithdrawals") === "on",
            notifyBookings: fd.get("notifyBookings") === "on",
          });
          if (!res.ok) setError(res.error);
          else {
            setSuccess(true);
            router.refresh();
          }
        });
      }}
    >
      <p className="text-sm leading-relaxed text-muted">
        These switches control email only. Alerts still appear in the bell. Email notifications is
        the master switch. Booking and withdrawal switches apply when that is on.
      </p>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="notifyEmail" defaultChecked={notifyEmail} className="mt-1" />
        <span>
          <span className="font-medium">Email notifications</span>
          <span className="mt-0.5 block text-xs text-muted">
            Campaigns, submissions, deposits, and budget alerts.
          </span>
        </span>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="notifyWithdrawals" defaultChecked={notifyWithdrawals} className="mt-1" />
        <span>
          <span className="font-medium">Withdrawal updates</span>
          <span className="mt-0.5 block text-xs text-muted">
            When a payout is requested, returned, or paid.
          </span>
        </span>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="notifyBookings" defaultChecked={notifyBookings} className="mt-1" />
        <span>
          <span className="font-medium">Booking updates</span>
          <span className="mt-0.5 block text-xs text-muted">
            Requests, acceptances, declines, and completed work.
          </span>
        </span>
      </label>
      <FieldError>{error}</FieldError>
      <FieldSuccess>{success ? "Preferences saved." : null}</FieldSuccess>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save preferences"}
      </Button>
    </form>
  );
}
