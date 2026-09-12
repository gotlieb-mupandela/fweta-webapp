import Link from "next/link";
import { redirect } from "next/navigation";

import { getMyInfluencerProfile, listMyRateCards } from "@/app/actions/influencer";
import { listInfluencerBookings } from "@/app/actions/bookings";
import { getMyWallet } from "@/app/actions/wallet";
import {
  EmptyState,
  PageHeader,
  SectionHeader,
  Stat,
  StatGrid,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { formatMoney } from "@/lib/utils";

export default async function InfluencerDashboardPage() {
  const session = await getSession();
  if (!session?.roles.includes("influencer") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const [profile, rates, bookings, wallet] = await Promise.all([
    getMyInfluencerProfile(),
    listMyRateCards(),
    listInfluencerBookings(),
    getMyWallet(),
  ]);

  const pendingBookings = bookings.filter((b) => b.status === "requested").length;
  const activeRates = rates.filter((r) => r.active).length;

  return (
    <div className="dash-stack">
      <PageHeader
        title="Influencer overview"
        description="Manage your rate card, bookings, and earnings."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/settings/withdraw">
              <Button variant="secondary">Withdraw</Button>
            </Link>
            <Link href="/dashboard/influencer/profile">
              <Button>Edit profile</Button>
            </Link>
          </div>
        }
      />

      <StatGrid>
        <Stat label="Wallet" value={formatMoney(wallet.availableCents)} />
        <Stat label="Active rates" value={String(activeRates)} />
        <Stat label="Pending bookings" value={String(pendingBookings)} />
        <Stat
          label="Profile"
          value={profile?.published ? "Published" : "Draft"}
          hint={profile?.slug ? `/influencers/${profile.slug}` : undefined}
        />
      </StatGrid>

      <section>
        <SectionHeader title="Recent bookings" href="/dashboard/influencer/bookings" />
        {bookings.length === 0 ? (
          <EmptyState
            title="Waiting on bookings"
            description="Publish your profile and rate card so brands can book you directly."
            action={
              <div className="flex flex-wrap gap-2">
                <Link href="/dashboard/influencer/rate-cards">
                  <Button size="sm">Set rates</Button>
                </Link>
                <Link href="/dashboard/influencer/profile">
                  <Button size="sm" variant="secondary">
                    Finish profile
                  </Button>
                </Link>
              </div>
            }
          />
        ) : (
          <ul className="space-y-2.5">
            {bookings.slice(0, 5).map((b) => (
              <li key={b.id} className="list-row">
                <div>
                  <p className="text-sm font-medium capitalize">{b.status.replace(/_/g, " ")}</p>
                  <p className="text-xs text-muted">{formatMoney(b.amountCents)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
