import Link from "next/link";
import { notFound } from "next/navigation";

import { getCampaign } from "@/app/actions/campaigns";
import { Logo } from "@/components/brand/logo";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { formatMoney } from "@/lib/utils";

export default async function PublicCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign || campaign.status !== "active") notFound();

  const session = await getSession();

  return (
    <div className="bg-atmosphere min-h-screen">
      <header className="border-b border-border/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Logo href="/" />
          <Link href="/campaigns" className="text-sm text-muted">
            ← All campaigns
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10">
        <div className="flex flex-wrap gap-2">
          <Badge tone="gold">{campaign.type}</Badge>
          <Badge>{campaign.category}</Badge>
        </div>
        <h1 className="mt-4 font-display text-4xl tracking-tight">{campaign.title}</h1>
        <p className="mt-4 text-muted">{campaign.description}</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Card>
            <p className="text-sm text-muted">CPM</p>
            <p className="font-display text-2xl">{formatMoney(campaign.cpmCents)}</p>
          </Card>
          <Card>
            <p className="text-sm text-muted">Budget remaining</p>
            <p className="font-display text-2xl">
              {formatMoney(campaign.budgetTotalCents - campaign.budgetSpentCents)}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-muted">Max per video</p>
            <p className="font-display text-2xl">
              {formatMoney(campaign.maxPayoutPerSubmissionCents)}
            </p>
          </Card>
        </div>

        <Card className="mt-6">
          <h2 className="font-display text-xl">Platforms</h2>
          <p className="mt-2 text-sm">{campaign.platforms.join(", ")}</p>
        </Card>

        {campaign.requirements ? (
          <Card className="mt-4">
            <h2 className="font-display text-xl">Requirements</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{campaign.requirements}</p>
          </Card>
        ) : null}

        <div className="mt-10">
          <Link href={session ? "/dashboard/clipper/campaigns" : "/signup?role=clipper"}>
            <Button size="lg">
              {session ? "Submit a clip" : "Join as clipper"}
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
