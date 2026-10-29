import Link from "next/link";
import { redirect } from "next/navigation";

import { getMyInfluencerProfile, listMyRateCards } from "@/app/actions/influencer";
import { RateCardForm } from "@/components/forms/rate-card-form";
import { RateCardList } from "@/components/forms/rate-card-list";
import { Card, EmptyState, PageHeader, SectionHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";

export default async function RateCardsPage() {
  const session = await getSession();
  if (!session?.roles.includes("influencer") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const [rates, profile] = await Promise.all([listMyRateCards(), getMyInfluencerProfile()]);

  return (
    <div className="dash-stack">
      <PageHeader
        title="Rate card"
        description="Set your pricing for brand bookings."
        action={
          profile ? (
            <Link href={`/influencers/${profile.slug}`} target="_blank">
              <Button size="sm" variant="secondary">
                View public profile
              </Button>
            </Link>
          ) : undefined
        }
      />

      {!profile ? (
        <Card className="panel-interactive">
          <p className="text-sm text-muted">
            Create your public profile before adding rate cards.
          </p>
          <div className="mt-3">
            <Link href="/dashboard/influencer/profile">
              <Button size="sm">Create profile</Button>
            </Link>
          </div>
        </Card>
      ) : null}

      <section>
        <SectionHeader title="Add a rate" />
        <RateCardForm />
      </section>

      <section>
        <SectionHeader title="Your rates" />
        {rates.length === 0 ? (
          <EmptyState title="No rate cards" description="Add your first offering above." />
        ) : (
          <RateCardList rates={rates} />
        )}
      </section>
    </div>
  );
}
