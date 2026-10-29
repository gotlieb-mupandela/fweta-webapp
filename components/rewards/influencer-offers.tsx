import Link from "next/link";

import { listPublicInfluencers } from "@/lib/influencers/public";
import { readStore } from "@/lib/db/store";
import { formatMoney } from "@/lib/utils";

export async function InfluencerOffers() {
  const [people, store] = await Promise.all([listPublicInfluencers(), readStore()]);
  const rows = people
    .map((profile) => {
      const rates = store.rateCards.filter((item) => item.influencerProfileId === profile.id && item.active);
      const lowest = rates.reduce((min, item) => Math.min(min, item.priceCents), Number.POSITIVE_INFINITY);
      return { profile, rateCount: rates.length, lowest: Number.isFinite(lowest) ? lowest : null };
    })
    .filter((row) => row.rateCount > 0)
    .slice(0, 4);

  if (rows.length === 0) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-2xl tracking-tight">Book a creator directly</h2>
        <p className="mt-1 text-sm text-muted">
          Open campaigns pay per view. A direct offer is a fixed rate: you send the brief, they accept or decline, then you pay by hand after delivery.
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <li key={row.profile.id} className="panel p-4">
            <p className="font-medium">{row.profile.displayName}</p>
            <p className="mt-1 line-clamp-2 text-sm text-muted">{row.profile.headline || row.profile.niche}</p>
            <p className="mt-2 text-xs text-muted">
              From {row.lowest != null ? formatMoney(row.lowest) : "a listed rate"}
            </p>
            <Link href={`/influencers/${row.profile.slug}/book`} className="section-link mt-3 inline-block">
              Send an offer
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
