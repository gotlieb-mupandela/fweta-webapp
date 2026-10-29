"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { adminRefundBookingAction } from "@/app/actions/bookings";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";

export function BookingAdminRefund({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await adminRefundBookingAction(bookingId);
            if (!res.ok) setError(res.error);
            else router.refresh();
          })
        }
      >
        {pending ? "Refunding…" : "Refund to brand"}
      </Button>
      <FieldError>{error}</FieldError>
    </div>
  );
}
