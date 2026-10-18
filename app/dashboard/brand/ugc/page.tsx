import Link from "next/link";
import { redirect } from "next/navigation";

import { ContextHelp } from "@/components/onboarding/context-help";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { formatMoney } from "@/lib/utils";

export default async function BrandUgcPage() {
  const session = await getSession();
  if (!session?.roles.includes("brand") && !session?.roles.includes("admin")) redirect("/dashboard");
  const store = await readStore();
  const briefs = store.ugcBriefs
    .filter((brief) => brief.brandId === session.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="dash-stack">
      <PageHeader
        title="UGC briefs"
        description="Pay a fixed fee for videos the brand uses in ads, on the site, or in promos. Creators do not post these on their own feed."
        action={
          <Link href="/dashboard/brand/ugc/new">
            <Button size="sm">New brief</Button>
          </Link>
        }
      />
      <ContextHelp
        title="Budget is reserved from your wallet"
        body="Opening a brief reserves the fee times the number of videos. Each approval pays that fee to the creator and writes a license. Closing the brief returns whatever is still reserved. Pay-in and payout stay manual EFT."
        hint="Drafts do not reserve money until you open them."
      />
      {briefs.length === 0 ? (
        <EmptyState title="No UGC briefs yet" description="Create a brief when you need content for your own ads." />
      ) : (
        <ul className="space-y-2.5">
          {briefs.map((brief) => (
            <li key={brief.id}>
              <Link href={`/dashboard/brand/ugc/${brief.id}`} className="list-row text-sm">
                <div>
                  <p className="font-medium">{brief.title}</p>
                  <p className="text-xs text-muted">
                    {brief.videoCount} {brief.videoCount === 1 ? "video" : "videos"} · {formatMoney(brief.feePerAssetCents)} each · {brief.termMonths} months
                  </p>
                </div>
                <div className="text-right">
                  <Badge tone={brief.status === "open" ? "success" : "muted"}>{brief.status}</Badge>
                  <p className="mt-1 text-xs text-muted">Reserved {formatMoney(brief.budgetReservedCents)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
