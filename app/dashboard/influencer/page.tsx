import Link from "next/link";
import { redirect } from "next/navigation";

import { getMyInfluencerProfile, listMyRateCards } from "@/app/actions/influencer";
import { listInfluencerBookings } from "@/app/actions/bookings";
import { listClipperSubmissions } from "@/app/actions/submissions";
import { getMyWallet } from "@/app/actions/wallet";
import { PageHeader, Stat, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { canUseInfluencerWorkspace } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { bookingBadgeTone } from "@/lib/dashboard/status";
import { readStore } from "@/lib/db/store";
import { formatMoney } from "@/lib/utils";

export default async function InfluencerDashboardPage() {
  const session = await getSession();
  if (!canUseInfluencerWorkspace(session?.roles)) {
    redirect("/dashboard");
  }

  const [profile, rates, bookings, wallet, submissions, store] = await Promise.all([
    getMyInfluencerProfile(),
    listMyRateCards(),
    listInfluencerBookings(),
    getMyWallet(),
    listClipperSubmissions(),
    readStore(),
  ]);

  const pendingBookings = bookings.filter((b) => b.status === "requested").length;
  const activeRates = rates.filter((r) => r.active).length;
  const activeCampaigns = store.campaigns.filter((c) => c.status === "active").length;
  const pendingClips = submissions.filter((s) => s.status === "pending").length;

  return (
    <div>
      <PageHeader
        title="Influencer overview"
        description="Manage your rate card, bookings, campaigns, and earnings."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/settings/withdraw">
              <Button variant="secondary">Withdraw</Button>
            </Link>
            {profile?.published && profile.slug ? (
              <Link href={`/influencers/${profile.slug}`}>
                <Button variant="secondary">View public profile</Button>
              </Link>
            ) : (
              <Link href="/dashboard/influencer/profile">
                <Button>Complete profile</Button>
              </Link>
            )}
          </div>
        }
      />

      {!profile ? (
        <div className="mb-8 rounded-2xl border border-gold/40 bg-gold-soft px-4 py-4 text-sm">
          <p className="font-medium">Set up your public profile</p>
          <p className="mt-1 text-muted">
            Brands can only book you after you publish a profile and add at least one rate.
          </p>
          <Link href="/dashboard/influencer/profile" className="mt-2 inline-block text-gold hover:underline">
            Create profile →
          </Link>
        </div>
      ) : !profile.published ? (
        <div className="mb-8 rounded-2xl border border-border bg-white px-4 py-4 text-sm">
          <p className="font-medium">Your profile is still a draft</p>
          <p className="mt-1 text-muted">Publish it so brands can find you on the marketplace.</p>
          <Link href="/dashboard/influencer/profile" className="mt-2 inline-block text-gold hover:underline">
            Publish profile →
          </Link>
        </div>
      ) : null}

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

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/dashboard/influencer/campaigns"
          className="rounded-2xl border border-border bg-white px-4 py-4 hover:border-foreground/20"
        >
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Open campaigns</p>
          <p className="mt-2 font-display text-2xl">{activeCampaigns}</p>
          <p className="mt-1 text-sm text-muted">
            {pendingClips ? `${pendingClips} clip${pendingClips === 1 ? "" : "s"} awaiting review` : "Submit clips and earn per view"}
          </p>
        </Link>
        <Link
          href="/dashboard/influencer/rate-cards"
          className="rounded-2xl border border-border bg-white px-4 py-4 hover:border-foreground/20"
        >
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Rate cards</p>
          <p className="mt-2 font-display text-2xl">{rates.length}</p>
          <p className="mt-1 text-sm text-muted">
            {activeRates ? `${activeRates} live for brand bookings` : "Add a rate so brands can book you"}
          </p>
        </Link>
      </div>

      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl">Recent bookings</h2>
          <Link href="/dashboard/influencer/bookings" className="text-sm text-muted">
            View all →
          </Link>
        </div>
        <ul className="space-y-3">
          {bookings.slice(0, 5).map((b) => {
            const brand = store.profiles.find((p) => p.id === b.brandId);
            const rate = store.rateCards.find((r) => r.id === b.rateCardItemId);
            return (
              <li
                key={b.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{brand?.displayName ?? "Brand"}</p>
                  <p className="truncate text-xs text-muted">
                    {rate?.title ?? "Rate"} · {formatMoney(b.amountCents)}
                  </p>
                </div>
                <Badge tone={bookingBadgeTone(b.status)}>{b.status}</Badge>
              </li>
            );
          })}
          {bookings.length === 0 ? (
            <p className="text-sm text-muted">No bookings yet. Publish your profile to receive requests.</p>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
