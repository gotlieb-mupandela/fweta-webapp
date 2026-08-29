import { redirect } from "next/navigation";

import { listBrandBookings } from "@/app/actions/bookings";
import { BrandBookingActions } from "@/components/forms/brand-booking-actions";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { formatMoney } from "@/lib/utils";

export default async function BrandBookingsPage() {
  const session = await getSession();
  if (!session?.roles.includes("brand") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const [bookings, store] = await Promise.all([listBrandBookings(), readStore()]);

  return (
    <div>
      <PageHeader
        title="Bookings"
        description="Influencer collaborations and escrow payments."
      />

      {bookings.length === 0 ? (
        <EmptyState
          title="No bookings"
          description="Browse influencers to request a collaboration."
        />
      ) : (
        <ul className="space-y-3">
          {bookings.map((b) => {
            const profile = store.influencerProfiles.find((p) => p.id === b.influencerProfileId);
            const rate = store.rateCards.find((r) => r.id === b.rateCardItemId);
            return (
              <li
                key={b.id}
                className="rounded-2xl border border-border bg-white px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{profile?.displayName ?? "Influencer"}</p>
                    <p className="text-sm text-muted">{rate?.title ?? "Rate card item"}</p>
                    <p className="mt-1 text-sm">{formatMoney(b.amountCents)}</p>
                    {b.deliverableUrl ? (
                      <a
                        href={b.deliverableUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block text-sm text-gold hover:underline"
                      >
                        View deliverable
                      </a>
                    ) : null}
                  </div>
                  <Badge tone={b.status === "approved" ? "success" : "muted"}>{b.status}</Badge>
                </div>
                <div className="mt-3">
                  <BrandBookingActions bookingId={b.id} status={b.status} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
