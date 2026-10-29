import Link from "next/link";
import { redirect } from "next/navigation";

import { listInfluencerBookings } from "@/app/actions/bookings";
import { getMyInfluencerProfile } from "@/app/actions/influencer";
import { InfluencerBookingActions } from "@/components/forms/influencer-booking-actions";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { bookingKind } from "@/lib/bookings/kind";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { formatMoney } from "@/lib/utils";

export default async function InfluencerBookingsPage() {
  const session = await getSession();
  if (!session?.roles.includes("influencer") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const [bookings, store, influencer] = await Promise.all([
    listInfluencerBookings(),
    readStore(),
    getMyInfluencerProfile(),
  ]);
  const profileReady = Boolean(influencer?.published && influencer.headline && influencer.bio);

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
        profileReady ? (
          <EmptyState
            title="No bookings yet"
            description="When a brand requests you from your public profile, it shows up here."
            action={
              <Link href={`/influencers/${influencer!.slug}`}>
                <Button size="sm" variant="secondary">
                  View public profile
                </Button>
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="No bookings"
            description="Publish your profile and rate card so brands can book you."
            action={
              <Link href="/dashboard/influencer/profile">
                <Button size="sm">Finish profile</Button>
              </Link>
            }
          />
        )
      ) : (
        <ul className="space-y-2.5">
          {bookings.map((b) => {
            const brand = store.profiles.find((p) => p.id === b.brandId);
            const isPrivate = bookingKind(b) === "private";
            const rate = b.rateCardItemId
              ? store.rateCards.find((r) => r.id === b.rateCardItemId)
              : undefined;
            return (
              <li key={b.id} className="list-row items-start">
                <div className="w-full space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{brand?.displayName ?? "Brand"}</p>
                      <p className="text-sm text-muted">
                        {isPrivate ? "Private offer" : (rate?.title ?? "Booking")}
                      </p>
                      <p className="mt-1 text-sm">{formatMoney(b.amountCents)}</p>
                      <p className="mt-2 text-sm text-muted">{b.brief}</p>
                      {b.status === "in_progress" && b.revisionNote ? (
                        <p className="mt-2 text-sm">
                          <span className="font-medium">The brand asked for changes:</span>{" "}
                          {b.revisionNote}
                        </p>
                      ) : null}
                      {b.status === "in_progress" && b.deliverableUrl ? (
                        <a
                          href={b.deliverableUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 block text-sm text-gold-deep hover:underline"
                        >
                          Previous delivery
                        </a>
                      ) : null}
                    </div>
                    <StatusBadge status={b.status} />
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
