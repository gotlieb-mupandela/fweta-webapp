import Link from "next/link";
import { redirect } from "next/navigation";

import { listBrandCampaigns } from "@/app/actions/campaigns";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { formatMoney } from "@/lib/utils";

export default async function BrandCampaignsPage() {
  const session = await getSession();
  if (!session?.roles.includes("brand") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const campaigns = await listBrandCampaigns();

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Manage content rewards campaigns and budgets."
        action={
          <Link href="/dashboard/brand/campaigns/new">
            <Button>New campaign</Button>
          </Link>
        }
      />

      {campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Create your first campaign to start receiving clip submissions."
          action={
            <Link href="/dashboard/brand/campaigns/new">
              <Button size="sm">Create campaign</Button>
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link
                href={`/dashboard/brand/campaigns/${c.id}`}
                className="flex items-center justify-between rounded-2xl border border-border bg-white px-4 py-4 hover:border-foreground/20"
              >
                <div>
                  <p className="font-medium">{c.title}</p>
                  <p className="mt-1 text-sm text-muted">
                    {c.type} · {c.category} · {formatMoney(c.budgetSpentCents)} / {formatMoney(c.budgetTotalCents)}
                  </p>
                </div>
                <Badge tone={c.status === "active" ? "gold" : "muted"}>{c.status}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
