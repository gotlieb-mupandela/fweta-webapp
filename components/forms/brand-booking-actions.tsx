"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { approveBookingAction, cancelBookingAction } from "@/app/actions/bookings";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";

export function BrandBookingActions({
  bookingId,
  status,
}: {
  bookingId: string;
  status: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canCancel = status === "requested" || status === "accepted";
  const canApprove = status === "delivered";

  if (!canCancel && !canApprove) return null;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {canApprove ? (
          <Button
            size="sm"
            variant="gold"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const res = await approveBookingAction(bookingId);
                if (!res.ok) setError(res.error);
                else router.refresh();
              })
            }
          >
            {pending ? "Approving…" : "Approve & release payment"}
          </Button>
        ) : null}
        {canCancel ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("Cancel this booking and return escrow to your wallet?")) return;
              startTransition(async () => {
                setError(null);
                const res = await cancelBookingAction(bookingId);
                if (!res.ok) setError(res.error);
                else router.refresh();
              });
            }}
          >
            Cancel booking
          </Button>
        ) : null}
      </div>
      <FieldError>{error}</FieldError>
    </div>
  );
}
