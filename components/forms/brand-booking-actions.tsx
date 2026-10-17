"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { approveBookingAction } from "@/app/actions/bookings";
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

  if (status !== "delivered") return null;

  return (
    <div>
      <Button
        size="sm"
        variant="gold"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await approveBookingAction(bookingId);
            if (!res.ok) {
              setError(res.error);
              return;
            }
            router.refresh();
          })
        }
      >
        {pending ? "Approving…" : "Approve & release payment"}
      </Button>
      <FieldError>{error}</FieldError>
    </div>
  );
}
