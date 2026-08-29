"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { approveBookingAction } from "@/app/actions/bookings";
import { Button } from "@/components/ui/button";

export function BrandBookingActions({
  bookingId,
  status,
}: {
  bookingId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (status !== "delivered") return null;

  return (
    <Button
      size="sm"
      variant="gold"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await approveBookingAction(bookingId);
          router.refresh();
        })
      }
    >
      {pending ? "Approving…" : "Approve & release payment"}
    </Button>
  );
}
