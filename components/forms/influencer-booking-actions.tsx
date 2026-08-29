"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deliverBookingAction, respondBookingAction } from "@/app/actions/bookings";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

export function InfluencerBookingActions({
  bookingId,
  status,
}: {
  bookingId: string;
  status: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (status === "requested") {
    return (
      <div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="gold"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const res = await respondBookingAction(bookingId, true);
                if (!res.ok) setError(res.error);
                else router.refresh();
              });
            }}
          >
            Accept
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const res = await respondBookingAction(bookingId, false);
                if (!res.ok) setError(res.error);
                else router.refresh();
              });
            }}
          >
            Decline
          </Button>
        </div>
        <FieldError>{error}</FieldError>
      </div>
    );
  }

  if (status === "accepted" || status === "in_progress") {
    return (
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setError(null);
          startTransition(async () => {
            const res = await deliverBookingAction(bookingId, String(fd.get("url") || ""));
            if (!res.ok) setError(res.error);
            else router.refresh();
          });
        }}
      >
        <div className="min-w-[200px] flex-1">
          <Label htmlFor={`deliver-${bookingId}`}>Deliverable URL</Label>
          <Input id={`deliver-${bookingId}`} name="url" type="url" required placeholder="https://" />
        </div>
        <Button size="sm" type="submit" disabled={pending}>
          Mark delivered
        </Button>
        <FieldError>{error}</FieldError>
      </form>
    );
  }

  return null;
}
