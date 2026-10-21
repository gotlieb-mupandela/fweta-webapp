import Link from "next/link";
import { notFound } from "next/navigation";

import { getCampaign } from "@/app/actions/campaigns";
import { listClipperSubmissions } from "@/app/actions/submissions";
import { PlatformChip } from "@/components/platforms/platform-chip";
import { PostingGuide } from "@/components/platforms/posting-guide";
import { PublicChrome } from "@/components/public-chrome";
import { SubmitClipForm } from "@/components/forms/submit-clip-form";
import { BudgetBar } from "@/components/rewards/budget-bar";
import { Leaderboard } from "@/components/rewards/leaderboard";
import { SaveCampaignButton } from "@/components/rewards/save-campaign-button";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { accountsForUser } from "@/lib/onboarding/accounts";
import {
  ABUSE_RULES,
  audienceLabel,
  campaignIsDiscoverable,
  campaignLeaderboard,
  remainingBudgetCents,
} from "@/lib/rewards/content-rewards";
import { formatMoney } from "@/lib/utils";

export default async function PublicCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign || !campaignIsDiscoverable(campaign)) notFound();

  const session = await getSession();
  const store = await readStore();
  const accounts = session
    ? accountsForUser(store.socialAccounts, session.id)
        .filter((account) => account.status === "verified" && campaign.platforms.includes(account.platform))
        .map((account) => ({
          id: account.id,
          handle: account.handle,
          platform: account.platform,
          isDefault: account.isDefault,
        }))
    : [];
  const canSubmit = Boolean(
    session &&
      (session.roles.includes("clipper") ||
        session.roles.includes("influencer") ||
        session.roles.includes("admin")),
  );
  const remaining = remainingBudgetCents(campaign);
  const leaderboard = campaignLeaderboard(store, campaign.id);
  const mySubs = canSubmit
    ? (await listClipperSubmissions()).filter((s) => s.campaignId === campaign.id)
    : [];

  return (
    <PublicChrome>
      <div className="mx-auto max-w-3xl">
        <Link href="/campaigns" className="section-link">
          ← Discover
        </Link>

        <div className="mt-6 flex flex-wrap gap-2">
          <Badge tone="gold">{campaign.type === "clipping" ? "Clipping" : "UGC"}</Badge>
          <Badge>{campaign.category}</Badge>
          {campaign.platforms.map((platform) => (
            <PlatformChip key={platform} platform={platform} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <h1 className="font-display text-4xl tracking-tight md:text-5xl">{campaign.title}</h1>
          {session ? (
            <SaveCampaignButton
              campaignId={campaign.id}
              saved={store.savedCampaigns.some((item) => item.userId === session.id && item.campaignId === campaign.id)}
            />
          ) : null}
        </div>
        <p className="mt-4 text-[15px] leading-relaxed text-muted">{campaign.description}</p>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <Card>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              {campaign.payModel === "pool" ? "Pot" : "You receive / 1,000"}
            </p>
            <p className="mt-1 font-display text-3xl">
              {formatMoney(campaign.payModel === "pool" ? campaign.budgetTotalCents : campaign.cpmCents)}
            </p>
          </Card>
          <Card>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Left in budget</p>
            <p className="mt-1 font-display text-3xl">{formatMoney(remaining)}</p>
          </Card>
          <Card>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Max per post</p>
            <p className="mt-1 font-display text-3xl">
              {formatMoney(campaign.maxPayoutPerSubmissionCents)}
            </p>
          </Card>
        </div>

        <Card className="mt-4">
          <BudgetBar campaign={campaign} />
          <p className="mt-3 text-xs text-muted">
            {campaign.payModel === "pool"
              ? "Pool amounts are estimates until the campaign ends. Only approved clips that clear the view floor share the pot. If nobody qualifies, the pot returns to the brand."
              : "Views after you submit count for 7 days after approval, or until the campaign ends."}{" "}
            Then a 3-day fraud hold. Wallet release is automatic. Bank payout is a manual Namibian EFT from N$100. No crypto.
            {campaign.minViews > 0 ? ` View floor: ${campaign.minViews} qualified views.` : " No view floor."}
            {campaign.minPayoutCents > 0 ? ` Review starts at ${formatMoney(campaign.minPayoutCents)}.` : ""}
            {campaign.endDate ? ` Ends ${campaign.endDate.slice(0, 10)}.` : ""}
          </p>
        </Card>

        <Card className="mt-4">
          <h2 className="font-display text-xl">Who gets paid</h2>
          <p className="mt-2 text-sm text-muted">
            {audienceLabel(campaign.countries)}. The brand approves every clip. The rate above is yours. The platform fee sits on the brand side.
          </p>
        </Card>

        <div className="mt-4">
          <h2 className="font-display text-2xl tracking-tight">How to post</h2>
          <p className="mt-1 text-sm text-muted">
            Each network has its own frame, caption, and link. Use the one you publish on.
          </p>
          <div className="mt-3">
            <PostingGuide platforms={campaign.platforms} />
          </div>
        </div>

        {campaign.requirements ? (
          <Card className="mt-4">
            <h2 className="font-display text-xl">What to make</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">
              {campaign.requirements}
            </p>
          </Card>
        ) : null}

        {campaign.captionGuide ? (
          <Card className="mt-4">
            <h2 className="font-display text-xl">Suggested caption</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">{campaign.captionGuide}</p>
            {(campaign.hashtags ?? []).length > 0 ? (
              <p className="mt-2 text-sm text-foreground">{campaign.hashtags!.map((tag) => `#${tag}`).join(" ")}</p>
            ) : null}
          </Card>
        ) : null}

        {campaign.rules ? (
          <Card className="mt-4">
            <h2 className="font-display text-xl">Caption and disclosure</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">{campaign.rules}</p>
          </Card>
        ) : null}

        <Card className="mt-4">
          <h2 className="font-display text-xl">Abuse rules</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            {ABUSE_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </Card>

        {campaign.assets.length > 0 ? (
          <Card className="mt-4">
            <h2 className="font-display text-xl">References</h2>
            <ul className="mt-3 space-y-2">
              {campaign.assets.map((asset) => (
                <li key={asset.id}>
                  <a
                    href={asset.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-gold-deep hover:underline"
                  >
                    {asset.label}
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card className="mt-4">
          <h2 className="font-display text-xl">Leaderboard</h2>
          <p className="mt-1 text-sm text-muted">
            Ranked from confirmed view counts: handle, views, and clip count.
            {campaign.payModel === "pool" && !campaign.poolSettledAt
              ? " Money before the end is an estimate."
              : " Amounts match what is set aside or already in the wallet."}
          </p>
          <div className="mt-3">
            <Leaderboard rows={leaderboard} />
          </div>
        </Card>

        <div className="mt-8">
          {canSubmit ? (
            <Card>
              <h2 className="font-display text-xl">Submit a clip</h2>
              <p className="mt-2 text-sm text-muted">
                Only a verified account can be selected. Pending accounts stay locked until an admin confirms the bio code. Publish on an allowed platform, then paste the post link.
                Only views after you submit are paid.{" "}
                <Link href="/dashboard/settings/accounts" className="text-gold-deep hover:underline">
                  Connected accounts
                </Link>
                .
                {mySubs.length > 0
                  ? ` You already have ${mySubs.length} clip${mySubs.length === 1 ? "" : "s"} here.`
                  : ""}
              </p>
              <div className="mt-4">
                <SubmitClipForm
                  campaignId={campaign.id}
                  platforms={campaign.platforms}
                  remainingBudgetCents={remaining}
                  accounts={accounts}
                  requiredChecks={campaign.requiredChecks ?? []}
                  hashtags={campaign.hashtags ?? []}
                />
              </div>
            </Card>
          ) : session ? (
            <p className="text-sm text-muted">
              Add the clipper role in{" "}
              <Link href="/dashboard/settings/roles" className="section-link text-gold-deep">
                Settings → Roles
              </Link>{" "}
              to submit clips.
            </p>
          ) : (
            <Link href="/signup?role=clipper">
              <Button size="lg">Join as a clipper</Button>
            </Link>
          )}
        </div>
      </div>
    </PublicChrome>
  );
}
