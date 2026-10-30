import { redirect } from "next/navigation";

import { listClipperSubmissions } from "@/app/actions/submissions";
import { getMyLedger, getMyWallet } from "@/app/actions/wallet";
import { ContextHelp } from "@/components/onboarding/context-help";
import { EmptyState, PageHeader, SectionHeader, Stat, StatGrid } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { splitCreatorIncome } from "@/lib/licensing/hub";
import { formatMoney, formatNumber } from "@/lib/utils";

export default async function ClipperEarningsPage() {
  const session = await getSession();
  if (
    !session?.roles.includes("clipper") &&
    !session?.roles.includes("influencer") &&
    !session?.roles.includes("admin")
  ) {
    redirect("/dashboard");
  }

  const [wallet, ledger, submissions, store] = await Promise.all([
    getMyWallet(),
    getMyLedger(),
    listClipperSubmissions(),
    readStore(),
  ]);
  const setAside = submissions.reduce((sum, submission) => sum + submission.reservedCents, 0);
  const views = submissions.reduce((sum, submission) => sum + submission.views, 0);
  const approved = submissions.filter((submission) => submission.status === "approved");

  const byCampaign = new Map<string, { title: string; views: number; earningsCents: number; clips: number }>();
  for (const submission of submissions) {
    const current = byCampaign.get(submission.campaignId) ?? {
      title: store.campaigns.find((c) => c.id === submission.campaignId)?.title ?? "Campaign",
      views: 0,
      earningsCents: 0,
      clips: 0,
    };
    current.views += submission.views;
    current.earningsCents += submission.earningsCents;
    current.clips += 1;
    byCampaign.set(submission.campaignId, current);
  }
  const breakdown = [...byCampaign.values()].sort((a, b) => b.earningsCents - a.earningsCents);
  const income = splitCreatorIncome(ledger);

  return (
    <div className="dash-stack">
      <PageHeader
        title="Earnings"
        description="View earnings and UGC license fees are listed separately. Both sit in this wallet. Bank transfer is a manual Namibian EFT from N$100."
      />
      <ContextHelp
        title="Earnings follow a view check"
        body="Approved clips earn after an admin records qualified views. The amount is the rate per 1,000 views, capped by the per‑clip maximum and the budget still left."
        hint="A rejection does not earn. The note on the submission explains why."
      />

      <StatGrid>
        <Stat
          label="Available"
          value={formatMoney(wallet.availableCents)}
          hint={`View earnings ${formatMoney(income.viewCents)} · UGC fees ${formatMoney(income.ugcCents)}`}
        />
        <Stat label="Set aside" value={formatMoney(setAside || wallet.pendingCents)} hint="Released when the hold ends" />
        <Stat label="Verified views" value={formatNumber(views)} hint={`${approved.length} approved clips`} />
      </StatGrid>

      <section>
        <SectionHeader title="By campaign" />
        {breakdown.length === 0 ? (
          <EmptyState title="No clips yet" description="Submit a post link on an open campaign." />
        ) : (
          <ul className="space-y-2.5">
            {breakdown.map((row) => (
              <li key={row.title} className="list-row text-sm">
                <div>
                  <p className="font-medium">{row.title}</p>
                  <p className="text-xs text-muted">
                    {row.clips} {row.clips === 1 ? "clip" : "clips"} · {formatNumber(row.views)} views
                  </p>
                </div>
                <p className="font-medium">{formatMoney(row.earningsCents)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHeader title="Ledger" />
        {ledger.length === 0 ? (
          <EmptyState
            title="No earnings yet"
            description="Earnings appear after a clip is approved and an admin records its views."
          />
        ) : (
          <ul className="space-y-2.5">
            {ledger.map((entry) => (
              <li key={entry.id} className="list-row text-sm">
                <div>
                  <p className="font-medium">{entry.reason}</p>
                  <p className="text-xs text-muted">{new Date(entry.createdAt).toLocaleString()}</p>
                </div>
                <p className={entry.type === "credit" ? "text-success" : "text-foreground"}>
                  {entry.type === "credit" ? "+" : "−"}
                  {formatMoney(entry.amountCents)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
