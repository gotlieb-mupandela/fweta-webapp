import Link from "next/link";
import { notFound } from "next/navigation";

import { getCampaign } from "@/app/actions/campaigns";
import { listClipperSubmissions } from "@/app/actions/submissions";
import { PublicSiteHeader } from "@/components/brand/public-site-header";
import { SubmitClipForm } from "@/components/forms/submit-clip-form";
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
  const canSubmit = Boolean(
    session && (session.roles.includes("clipper") || session.roles.includes("admin")),
  );
  const remaining = Math.max(0, campaign.budgetTotalCents - campaign.budgetSpentCents);
  const mySubs = canSubmit
    ? (await listClipperSubmissions()).filter((s) => s.campaignId === campaign.id)
    : [];

  return (
    <div className="bg-atmosphere min-h-screen">
      <PublicSiteHeader backHref="/campaigns" backLabel="← All campaigns" />

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
            <p className="font-display text-2xl">{formatMoney(remaining)}</p>
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
          {canSubmit ? (
            <Card>
              <h2 className="font-display text-xl">Submit a clip</h2>
              {mySubs.length > 0 ? (
                <p className="mt-2 text-sm text-muted">
                  You already have {mySubs.length} submission{mySubs.length === 1 ? "" : "s"} on this
                  campaign. You can add another unique link.
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  Paste the public post URL after you publish to an allowed platform.
                </p>
              )}
              <div className="mt-4">
                <SubmitClipForm
                  campaignId={campaign.id}
                  platforms={campaign.platforms}
                  remainingBudgetCents={remaining}
                />
              </div>
            </Card>
          ) : session ? (
            <p className="text-sm text-muted">
              Add the clipper role in{" "}
              <Link href="/dashboard/settings/roles" className="text-gold hover:underline">
                Settings → Roles
              </Link>{" "}
              to submit clips.
            </p>
          ) : (
            <Link href="/signup?role=clipper">
              <Button size="lg">Join as clipper</Button>
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
