import Link from "next/link";
import { redirect } from "next/navigation";

import { getMyInfluencerProfile, listMyRateCards } from "@/app/actions/influencer";
import { RateCardForm } from "@/components/forms/rate-card-form";
import { RateCardActions } from "@/components/forms/rate-card-actions";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { canUseInfluencerWorkspace } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { formatMoney } from "@/lib/utils";

export default async function RateCardsPage() {
  const session = await getSession();
  if (!canUseInfluencerWorkspace(session?.roles)) {
    redirect("/dashboard");
  }

  const [rates, profile] = await Promise.all([listMyRateCards(), getMyInfluencerProfile()]);

  return (
    <div>
      <PageHeader title="Rate cards" description="Set your pricing for brand bookings." />

      {!profile ? (
        <p className="mb-6 text-sm text-muted">
          <Link href="/dashboard/influencer/profile" className="text-gold hover:underline">
            Create your public profile
          </Link>{" "}
          before adding rate cards.
        </p>
      ) : null}

      <div className="mb-10">
        <RateCardForm disabled={!profile} />
      </div>

      <h2 className="mb-4 font-display text-2xl">Your rates</h2>
      {rates.length === 0 ? (
        <EmptyState title="No rate cards" description="Add your first offering above." />
      ) : (
        <ul className="space-y-3">
          {rates.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-white px-4 py-4"
            >
              <div>
                <p className="font-medium">{r.title}</p>
                <p className="text-sm text-muted">
                  {r.type} · {r.platform} · {formatMoney(r.priceCents)}
                </p>
                {r.description ? <p className="mt-1 text-xs text-muted">{r.description}</p> : null}
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={r.active ? "success" : "muted"}>{r.active ? "Active" : "Inactive"}</Badge>
                <RateCardActions id={r.id} active={r.active} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
