import Link from "next/link";
import { redirect } from "next/navigation";

import { getMyInfluencerProfile, listMyRateCards } from "@/app/actions/influencer";
import { RateCardForm } from "@/components/forms/rate-card-form";
import { Badge, Card, EmptyState, PageHeader, SectionHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { formatMoney } from "@/lib/utils";

export default async function RateCardsPage() {
  const session = await getSession();
  if (!session?.roles.includes("influencer") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const [rates, profile] = await Promise.all([listMyRateCards(), getMyInfluencerProfile()]);

  return (
    <div className="dash-stack">
      <PageHeader
        title="Rate cards"
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
          <ul className="space-y-2.5">
            {rates.map((r) => (
              <li key={r.id} className="list-row">
                <div>
                  <p className="font-medium">{r.title}</p>
                  <p className="text-sm text-muted">
                    {r.type} · {r.platform} · {formatMoney(r.priceCents)}
                  </p>
                </div>
                <Badge tone={r.active ? "success" : "muted"}>
                  {r.active ? "Active" : "Inactive"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
