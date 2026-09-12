import Link from "next/link";
import { redirect } from "next/navigation";

import { listInfluencerBookings } from "@/app/actions/bookings";
import { InfluencerBookingActions } from "@/components/forms/influencer-booking-actions";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
    <div className="dash-stack">
      <PageHeader
        title="Bookings"
        description="Accept requests and deliver content."
        action={
          <Link href="/dashboard/influencer/rate-cards">
            <Button size="sm" variant="secondary">
              Manage rates
            </Button>
          </Link>
        }
      />

      {bookings.length === 0 ? (
        <EmptyState
          title="No bookings"
          description="Publish your profile and rate card so brands can book you."
          action={
            <Link href="/dashboard/influencer/profile">
              <Button size="sm">Finish profile</Button>
            </Link>
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {bookings.map((b) => {
            const brand = store.profiles.find((p) => p.id === b.brandId);
            const rate = store.rateCards.find((r) => r.id === b.rateCardItemId);
            return (
              <li key={b.id} className="list-row items-start">
                <div className="w-full space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{brand?.displayName ?? "Brand"}</p>
                      <p className="text-sm text-muted">{rate?.title}</p>
                      <p className="mt-1 text-sm">{formatMoney(b.amountCents)}</p>
                      <p className="mt-2 text-sm text-muted">{b.brief}</p>
                    </div>
                    <Badge tone={b.status === "approved" ? "success" : "muted"}>{b.status}</Badge>
                  </div>
                  <div className="border-t border-border/80 pt-3">
                    <InfluencerBookingActions bookingId={b.id} status={b.status} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
