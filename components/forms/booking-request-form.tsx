"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { requestBookingAction } from "@/app/actions/bookings";
import { Button } from "@/components/ui/button";
import { FieldError, Label, Select, Textarea } from "@/components/ui/input";
import type { RateCardItem } from "@/lib/db/types";

export function BookingRequestForm({
  influencerProfileId,
  rates,
}: {
  influencerProfileId: string;
  rates: RateCardItem[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (rates.length === 0) {
    return <p className="text-sm text-muted">No active rate cards available.</p>;
  }

  return (
    <form
      className="max-w-lg space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
          const res = await requestBookingAction({
            influencerProfileId,
            rateCardItemId: String(fd.get("rateCardItemId") || ""),
            brief: String(fd.get("brief") || ""),
          });
          if (!res.ok) setError(res.error);
          else router.push("/dashboard/brand/bookings");
        });
      }}
    >
      <div>
        <Label htmlFor="rateCardItemId">Rate card item</Label>
        <Select id="rateCardItemId" name="rateCardItemId" required defaultValue={rates[0]?.id}>
          {rates.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title} — N${(r.priceCents / 100).toFixed(2)}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="brief">Brief</Label>
        <Textarea id="brief" name="brief" required placeholder="Describe what you need delivered…" />
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Request booking"}
      </Button>
    </form>
  );
}
