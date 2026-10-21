import Link from "next/link";
import { redirect } from "next/navigation";

import { listClipperSubmissions } from "@/app/actions/submissions";
import { getMyWallet } from "@/app/actions/wallet";
import { PlatformPicker } from "@/components/platforms/platform-picker";
import { PlatformChip } from "@/components/platforms/platform-chip";
import { GuidedEmpty } from "@/components/onboarding/guided-empty";
import { Button } from "@/components/ui/button";
import { Badge, PageHeader, SectionHeader, Stat, StatGrid } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { formatMoney, formatNumber } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  flagged: "Flagged",
};

export default async function ClipperDashboardPage() {
  const session = await getSession();
  if (
    !session?.roles.includes("clipper") &&
    !session?.roles.includes("influencer") &&
    !session?.roles.includes("admin")
  ) {
    redirect("/dashboard");
  }

  const [submissions, wallet, store] = await Promise.all([
    listClipperSubmissions(),
    getMyWallet(),
    readStore(),
  ]);

  const profile = store.profiles.find((item) => item.id === session.id) ?? null;
  const hasPayout = store.payoutMethods.some((method) => method.userId === session.id);
  const counts = {
    pending: submissions.filter((item) => item.status === "pending").length,
    approved: submissions.filter((item) => item.status === "approved").length,
    rejected: submissions.filter((item) => item.status === "rejected").length,
    flagged: submissions.filter((item) => item.status === "flagged").length,
  };
  const views = submissions.reduce((sum, item) => sum + item.views, 0);

  const actions: { href: string; label: string; detail: string }[] = [];
  if (submissions.length === 0) {
    actions.push({
      href: "/dashboard/clipper/campaigns",
      label: "Find a campaign",
      detail: "Open campaigns are ready for a clip.",
    });
  }
  if (counts.pending > 0) {
    actions.push({
      href: "/dashboard/clipper/submissions",
      label: "Clips waiting on review",
      detail: `${counts.pending} still in the queue.`,
    });
  }
  if (!hasPayout) {
    actions.push({
      href: "/dashboard/settings/payout",
      label: "Add a payout method",
      detail: "Bank details are required before a withdrawal.",
    });
  } else if (wallet.availableCents >= 10000) {
    actions.push({
      href: "/dashboard/settings/withdraw",
      label: "Request a payout",
      detail: `${formatMoney(wallet.availableCents)} is available.`,
    });
  }
  if (!store.socialAccounts.some((account) => account.userId === session.id && account.status === "verified")) {
    actions.push({
      href: "/dashboard/settings/accounts",
      label: "Connect an account",
      detail: "Add a bio code. The account stays pending until an admin confirms it.",
    });
  }

  return (
    <div className="dash-stack">
      <PageHeader
        title="Overview"
        description="The rate on a campaign card is what you receive. Pick the network you already post on."
        action={
          <Link href="/dashboard/clipper/campaigns">
            <Button>Discover campaigns</Button>
          </Link>
        }
      />

      <section>
        <SectionHeader title="Where to post" href="/dashboard/clipper/campaigns" linkLabel="All campaigns" />
        <PlatformPicker basePath="/dashboard/clipper/campaigns" params={{ platform: "none" }} />
      </section>

      <StatGrid>
        <Stat label="Available" value={formatMoney(wallet.availableCents)} hint="Ready to pay out" />
        <Stat label="Pending" value={formatMoney(wallet.pendingCents)} hint="Set aside until the hold ends" />
        <Stat label="Verified views" value={formatNumber(views)} hint="Across your clips" />
        <Stat label="Clips" value={String(submissions.length)} hint="All statuses" />
      </StatGrid>

      <section>
        <SectionHeader title="Clips by status" href="/dashboard/clipper/submissions" linkLabel="Open clips" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["pending", "approved", "rejected", "flagged"] as const).map((status) => (
            <div key={status} className="panel px-4 py-3">
              <p className="text-xs font-medium text-muted">{STATUS_LABEL[status]}</p>
              <p className="mt-1 font-display text-3xl tracking-tight">{counts[status]}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="dash-split">
        <section>
          <SectionHeader title="Next actions" />
          {actions.length === 0 ? (
            <p className="text-sm text-muted">You are caught up. New campaigns show up on Discover.</p>
          ) : (
            <ul className="space-y-2.5">
              {actions.map((action) => (
                <li key={action.href}>
                  <Link href={action.href} className="list-row">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{action.label}</p>
                      <p className="text-xs text-muted">{action.detail}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionHeader title="Recent clips" href="/dashboard/clipper/submissions" linkLabel="All clips" />
          {submissions.length === 0 ? (
            <GuidedEmpty
              kind="clipper-submissions"
              profile={profile}
              hasPayout={hasPayout}
              fallback={{
                title: "No clips yet",
                description: "Browse an open campaign, post your cut, and submit the link.",
                href: "/dashboard/clipper/campaigns",
                cta: "Browse campaigns",
              }}
            />
          ) : (
            <ul className="space-y-2.5">
              {submissions.slice(0, 5).map((submission) => {
                const campaign = store.campaigns.find((item) => item.id === submission.campaignId);
                return (
                  <li key={submission.id} className="list-row">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{campaign?.title ?? "Campaign"}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <PlatformChip platform={submission.platform} />
                        <p className="text-xs text-muted">{formatMoney(submission.earningsCents)}</p>
                      </div>
                    </div>
                    <Badge tone={submission.status === "approved" ? "success" : submission.status === "rejected" ? "danger" : "muted"}>
                      {STATUS_LABEL[submission.status] ?? submission.status}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
