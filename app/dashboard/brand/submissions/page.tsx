import { redirect } from "next/navigation";

import { listBrandCampaigns } from "@/app/actions/campaigns";
import { listBrandSubmissions } from "@/app/actions/submissions";
import { BrandSubmissionQueue } from "@/components/dashboard/brand-submission-queue";
import { PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { clipEarnedCents } from "@/lib/rewards/paid";
import { parseSubmissionFilters } from "@/lib/submissions/filter";
import { formatMoney } from "@/lib/utils";

export default async function BrandSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session?.roles.includes("brand") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const filters = parseSubmissionFilters(flat, { status: "pending" });

  const [submissions, campaigns, store] = await Promise.all([
    listBrandSubmissions(),
    listBrandCampaigns(),
    readStore(),
  ]);

  const paid = submissions.reduce((sum, s) => sum + clipEarnedCents(store.ledgerEntries, s), 0);

  return (
    <div className="dash-stack">
      <PageHeader
        title="Reviews"
        description={
          submissions.length
            ? `Approve or reject clips from creators. ${formatMoney(paid)} paid out so far.`
            : "Clips creators submit to your campaigns show up here for approval."
        }
      />

      <BrandSubmissionQueue
        submissions={submissions}
        campaigns={campaigns}
        profiles={store.profiles}
        ledgerEntries={store.ledgerEntries}
        filters={filters}
        action="/dashboard/brand/submissions"
      />
    </div>
  );
}
