import { formatAppDateTime } from "@/lib/format/time";
import { redirect } from "next/navigation";

import { BookingAdminRefund } from "@/components/forms/booking-admin-refund";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { formatMoney } from "@/lib/utils";

export default async function AdminBookingsPage() {
  const session = await getSession();
  if (!session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const store = await readStore();
  const rows = store.bookings
    .filter((booking) => booking.status === "accepted" && !booking.deliverableUrl)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((booking) => ({
      booking,
      brand: store.profiles.find((profile) => profile.id === booking.brandId),
      influencer: store.profiles.find((profile) => profile.id === booking.influencerId),
    }));

  return (
    <div className="dash-stack">
      <PageHeader
        title="Accepted bookings"
        description="Refund an accepted booking that has no delivery. The escrow returns to the brand wallet."
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No undelivered bookings"
          description="Accepted bookings without a delivery link show up here."
        />
      ) : (
        <ul className="space-y-2.5">
          {rows.map(({ booking, brand, influencer }) => (
            <li key={booking.id} className="list-row items-start">
              <div className="w-full space-y-3">
                <div>
                  <p className="font-medium">{formatMoney(booking.amountCents)}</p>
                  <p className="mt-1 text-sm text-muted">
                    {brand?.displayName ?? "Brand"} to {influencer?.displayName ?? "Creator"}
                  </p>
                  <p className="text-xs text-muted">{formatAppDateTime(booking.createdAt)}</p>
                </div>
                <BookingAdminRefund bookingId={booking.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
