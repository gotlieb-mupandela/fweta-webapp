import Link from "next/link";
import { redirect } from "next/navigation";

import { getInfluencerForDeal, searchInfluencersForDeal } from "@/app/actions/bookings";
import { PrivateDealForm } from "@/components/forms/private-deal-form";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { getSession } from "@/lib/auth/session";

export default async function NewPrivateDealPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; influencer?: string }>;
}) {
  const session = await getSession();
  if (!session?.roles.includes("brand") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const selectedId = params.influencer?.trim() ?? "";

  // Both actions apply the private offer eligibility rules and drop user ids.
  const [matches, selectedAllowed] = await Promise.all([
    searchInfluencersForDeal(q || undefined),
    selectedId ? getInfluencerForDeal(selectedId) : Promise.resolve(null),
  ]);
  const selected = selectedAllowed;

  return (
    <div className="dash-stack">
      <PageHeader
        title="Private offer"
        description="Choose an influencer and send a price that is not on their rate card."
        action={
          <Link href="/dashboard/brand/bookings">
            <Button size="sm" variant="secondary">
              Back to bookings
            </Button>
          </Link>
        }
      />

      <Card className="panel-interactive">
        <h2 className="font-display text-xl tracking-tight">Find an influencer</h2>
        <form className="mt-4 flex flex-wrap items-end gap-3" action="/dashboard/brand/deals/new">
          <div className="min-w-[200px] flex-1">
            <Label htmlFor="q">Search by name</Label>
            <Input id="q" name="q" defaultValue={q} placeholder="Amara, Windhoek…" />
          </div>
          {selectedId ? <input type="hidden" name="influencer" value={selectedId} /> : null}
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
        </form>

        {matches.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              title="No influencers found"
              description="Try another name, or wait until a creator finishes their profile."
            />
          </div>
        ) : (
          <ul className="mt-5 space-y-2.5">
            {matches.slice(0, 20).map((p) => {
              const active = selected?.id === p.id;
              return (
                <li key={p.id}>
                  <Link
                    href={`/dashboard/brand/deals/new?influencer=${p.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                    className="list-row"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{p.displayName}</p>
                      <p className="text-xs text-muted">
                        {p.niche || "Creator"}
                        {p.location ? ` · ${p.location}` : ""}
                        {p.published ? "" : " · unpublished"}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted">
                      {active ? "Selected" : "Select"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {selectedAllowed ? (
        <Card className="panel-interactive">
          <h2 className="font-display text-xl tracking-tight">Offer for {selectedAllowed.displayName}</h2>
          <div className="mt-5">
            <PrivateDealForm
              influencerProfileId={selectedAllowed.id}
              influencerName={selectedAllowed.displayName}
              cancelHref="/dashboard/brand/deals/new"
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
