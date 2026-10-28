"use client";

import { useState } from "react";

import { updateNotificationsAction } from "@/app/actions/settings";
import { useTimedSave } from "@/components/forms/use-timed-save";
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
  const save = useTimedSave();
  const [email, setEmail] = useState(notifyEmail);
  const [withdrawals, setWithdrawals] = useState(notifyWithdrawals);
  const [bookings, setBookings] = useState(notifyBookings);

  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const prefs = {
          notifyEmail: email,
          notifyWithdrawals: withdrawals,
          notifyBookings: bookings,
        };
        void (async () => {
          const outcome = await save.run(() => updateNotificationsAction(prefs));
          if (outcome.status !== "ok") return;
          if (!outcome.result.ok) {
            save.fail(outcome.result.error);
            return;
          }
          setEmail(outcome.result.prefs.notifyEmail);
          setWithdrawals(outcome.result.prefs.notifyWithdrawals);
          setBookings(outcome.result.prefs.notifyBookings);
          save.succeed("Preferences saved.");
          save.refresh();
        })();
      }}
    >
      <p className="text-sm leading-relaxed text-muted">
        These switches control email only. Alerts still appear in the bell. Email notifications is
        the master switch. Booking and withdrawal switches apply when that is on.
      </p>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="notifyEmail"
          checked={email}
          onChange={(event) => setEmail(event.target.checked)}
          className="mt-1"
        />
        <span>
          <span className="font-medium">Email notifications</span>
          <span className="mt-0.5 block text-xs text-muted">
            Campaigns, submissions, deposits, and budget alerts.
          </span>
        </span>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="notifyWithdrawals"
          checked={withdrawals}
          onChange={(event) => setWithdrawals(event.target.checked)}
          className="mt-1"
        />
        <span>
          <span className="font-medium">Withdrawal updates</span>
          <span className="mt-0.5 block text-xs text-muted">
            When a payout is requested, returned, or paid.
          </span>
        </span>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="notifyBookings"
          checked={bookings}
          onChange={(event) => setBookings(event.target.checked)}
          className="mt-1"
        />
        <span>
          <span className="font-medium">Booking updates</span>
          <span className="mt-0.5 block text-xs text-muted">
            Requests, acceptances, declines, and completed work.
          </span>
        </span>
      </label>
      <FieldError>{save.error}</FieldError>
      <FieldSuccess>{save.success}</FieldSuccess>
      <Button type="submit" disabled={save.pending}>
        {save.pending ? "Saving..." : "Save preferences"}
      </Button>
    </form>
  );
}
