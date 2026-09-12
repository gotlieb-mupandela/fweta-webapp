import Link from "next/link";
import { redirect } from "next/navigation";

import { getMyInfluencerProfile, listMyRateCards } from "@/app/actions/influencer";
import { listInfluencerBookings } from "@/app/actions/bookings";
import { getMyWallet } from "@/app/actions/wallet";
import { PageHeader, SectionHeader, Stat } from "@/components/ui/card";
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
    <div>
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Wallet" value={formatMoney(wallet.availableCents)} />
        <Stat label="Active rates" value={String(activeRates)} />
        <Stat label="Pending bookings" value={String(pendingBookings)} />
        <Stat
          label="Profile"
          value={profile?.published ? "Published" : "Draft"}
          hint={profile?.slug ? `/influencers/${profile.slug}` : undefined}
        />
      </div>

      <div className="mt-10">
        <SectionHeader title="Recent bookings" href="/dashboard/influencer/bookings" />
        <ul className="space-y-3">
          {bookings.slice(0, 5).map((b) => (
            <li key={b.id} className="list-row">
              <div>
                <p className="text-sm font-medium capitalize">{b.status.replace(/_/g, " ")}</p>
                <p className="text-xs text-muted">{formatMoney(b.amountCents)}</p>
              </div>
            </li>
          ))}
          {bookings.length === 0 ? (
            <p className="text-sm text-muted">No bookings yet.</p>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
