import Link from "next/link";
import { redirect } from "next/navigation";

import { ContextHelp } from "@/components/onboarding/context-help";
import { Badge, EmptyState, PageHeader, SectionHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { splitCreatorIncome } from "@/lib/licensing/hub";
import { formatMoney } from "@/lib/utils";

export default async function CreatorUgcPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const creator = session.roles.includes("clipper") || session.roles.includes("influencer") || session.roles.includes("admin");
  if (!creator) redirect("/dashboard");
  const store = await readStore();
  const openBriefs = store.ugcBriefs.filter((brief) => brief.status === "open" && brief.brandId !== session.id);
  const mine = store.ugcApplications.filter((item) => item.creatorId === session.id);
  const income = splitCreatorIncome(store.ledgerEntries.filter((entry) => entry.userId === session.id));
  const portfolio = store.creatorPortfolios.find((item) => item.userId === session.id);

  return (
    <div className="dash-stack">
      <PageHeader
        title="UGC work"
        description="Fixed fees for videos a brand uses itself. This is separate from pay per 1,000 views."
        action={
          <Link href="/dashboard/ugc/portfolio">
            <Button size="sm" variant="secondary">
              Portfolio
            </Button>
          </Link>
        }
      />
      <ContextHelp
        title="Two ways to earn"
        body={`View earnings so far: ${formatMoney(income.viewCents)}. UGC license fees so far: ${formatMoney(income.ugcCents)}. Both land in the same wallet. Payout is still a manual EFT.`}
        hint="A UGC brief does not ask you to post the video on your feed."
      />

      <section>
        <SectionHeader title="Your applications" />
        {mine.length === 0 ? (
          <EmptyState title="No UGC applications yet" description="Apply to an open brief below, or wait for an invite." />
        ) : (
          <ul className="space-y-2.5">
            {mine.map((application) => {
              const brief = store.ugcBriefs.find((item) => item.id === application.briefId);
              return (
                <li key={application.id}>
                  <Link href={`/dashboard/ugc/${application.briefId}`} className="list-row text-sm">
                    <div>
                      <p className="font-medium">{brief?.title ?? "Brief"}</p>
                      <p className="text-xs text-muted">{application.status}</p>
                    </div>
                    <Badge tone="muted">{brief ? formatMoney(brief.feePerAssetCents) : ""}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <SectionHeader title="Open briefs" />
        {openBriefs.length === 0 ? (
          <p className="text-sm text-muted">No open briefs right now.</p>
        ) : (
          <ul className="space-y-2.5">
            {openBriefs.map((brief) => (
              <li key={brief.id}>
                <Link href={`/dashboard/ugc/${brief.id}`} className="list-row text-sm">
                  <div>
                    <p className="font-medium">{brief.title}</p>
                    <p className="text-xs text-muted">
                      {brief.territory} · {brief.termMonths} months · {brief.videoCount} {brief.videoCount === 1 ? "video" : "videos"}
                    </p>
                  </div>
                  <span className="font-medium">{formatMoney(brief.feePerAssetCents)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {portfolio?.published ? (
        <p className="text-sm">
          <Link href={`/creators/${session.id}`} className="text-gold-deep hover:underline">
            View your public UGC portfolio
          </Link>
        </p>
      ) : null}
    </div>
  );
}
