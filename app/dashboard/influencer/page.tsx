import Link from "next/link";
import { redirect } from "next/navigation";

import { getMyInfluencerProfile, listMyRateCards } from "@/app/actions/influencer";
import { listInfluencerBookings } from "@/app/actions/bookings";
import { getMyWallet } from "@/app/actions/wallet";
import { PlatformChip } from "@/components/platforms/platform-chip";
import { GuidedEmpty } from "@/components/onboarding/guided-empty";
import {
  PageHeader,
  SectionHeader,
  Stat,
  StatGrid,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { formatMoney } from "@/lib/utils";
import type { SocialPlatform } from "@/types/enums";

export default async function InfluencerDashboardPage() {
  const session = await getSession();
  if (!session?.roles.includes("influencer") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const [profile, rates, bookings, wallet, store] = await Promise.all([
    getMyInfluencerProfile(),
    listMyRateCards(),
    listInfluencerBookings(),
    getMyWallet(),
    readStore(),
  ]);
  const account = store.profiles.find((item) => item.id === session.id) ?? null;
  const hasPayout = store.payoutMethods.some((method) => method.userId === session.id);

  const pendingBookings = bookings.filter((b) => b.status === "requested").length;
  const activeRates = rates.filter((r) => r.active).length;
  const listedPlatforms = (["tiktok", "instagram", "facebook", "youtube", "x"] as const).filter(
    (platform): platform is SocialPlatform => Boolean(profile?.socials?.[platform]),
  );

  return (
    <div className="dash-stack">
      <PageHeader
        title="Influencer overview"
        description="Brands book the rate you publish. Keep the profile, the prices, and the networks current."
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

      <section>
        <SectionHeader title="Your public offer" />
        <ul className="grid gap-3 sm:grid-cols-3">
          <li className="panel p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Profile</p>
            <p className="mt-2 font-display text-2xl tracking-tight">{profile?.published ? "Public" : "Draft"}</p>
            <Link href="/dashboard/influencer/profile" className="section-link mt-2 inline-block">
              Edit profile
            </Link>
          </li>
          <li className="panel p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Rate card</p>
            <p className="mt-2 font-display text-2xl tracking-tight">{activeRates} live</p>
            <Link href="/dashboard/influencer/rate-cards" className="section-link mt-2 inline-block">
              Set rates
            </Link>
          </li>
          <li className="panel p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Requests</p>
            <p className="mt-2 font-display text-2xl tracking-tight">{pendingBookings} waiting</p>
            <Link href="/dashboard/influencer/bookings" className="section-link mt-2 inline-block">
              Open bookings
            </Link>
          </li>
        </ul>
        {listedPlatforms.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {listedPlatforms.map((platform) => (
              <PlatformChip key={platform} platform={platform} />
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">Add TikTok, Instagram, YouTube, or X on your profile so brands know where you post.</p>
        )}
      </section>

      <StatGrid>
        <Stat label="Available" value={formatMoney(wallet.availableCents)} hint="Ready to withdraw" />
        <Stat label="Pending" value={formatMoney(wallet.pendingCents)} hint="Held until a booking clears" />
        <Stat label="Bookings waiting" value={String(pendingBookings)} />
        <Stat
          label="Active rates"
          value={String(activeRates)}
          hint={profile?.published ? "Profile is public" : "Profile is still a draft"}
        />
      </StatGrid>

      <section>
        <SectionHeader title="Recent bookings" href="/dashboard/influencer/bookings" />
        {bookings.length === 0 ? (
          <GuidedEmpty
            kind="influencer-bookings"
            profile={account}
            hasPayout={hasPayout}
            fallback={{
              title: "Waiting on bookings",
              description: "Publish your profile and rate card so brands can book you directly.",
              href: "/dashboard/influencer/rate-cards",
              cta: "Set rates",
            }}
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
