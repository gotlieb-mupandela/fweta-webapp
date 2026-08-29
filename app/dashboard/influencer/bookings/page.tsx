import { redirect } from "next/navigation";

import { listInfluencerBookings } from "@/app/actions/bookings";
import { InfluencerBookingActions } from "@/components/forms/influencer-booking-actions";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { formatMoney } from "@/lib/utils";

export default async function InfluencerBookingsPage() {
  const session = await getSession();
  if (!session?.roles.includes("influencer") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const [bookings, store] = await Promise.all([listInfluencerBookings(), readStore()]);

  return (
    <div>
      <PageHeader title="Bookings" description="Accept requests and deliver content." />

      {bookings.length === 0 ? (
        <EmptyState title="No bookings" description="Publish your profile to receive requests." />
      ) : (
        <ul className="space-y-4">
          {bookings.map((b) => {
            const brand = store.profiles.find((p) => p.id === b.brandId);
            const rate = store.rateCards.find((r) => r.id === b.rateCardItemId);
            return (
              <li
                key={b.id}
                className="rounded-2xl border border-border bg-white px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{brand?.displayName ?? "Brand"}</p>
                    <p className="text-sm text-muted">{rate?.title}</p>
                    <p className="mt-1 text-sm">{formatMoney(b.amountCents)}</p>
                    <p className="mt-2 text-sm text-muted">{b.brief}</p>
                  </div>
                  <Badge tone={b.status === "approved" ? "success" : "muted"}>{b.status}</Badge>
                </div>
                <div className="mt-4 border-t border-border pt-4">
                  <InfluencerBookingActions bookingId={b.id} status={b.status} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
