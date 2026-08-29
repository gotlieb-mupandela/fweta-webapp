import { redirect } from "next/navigation";

import { listClipperSubmissions } from "@/app/actions/submissions";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { formatMoney, formatNumber } from "@/lib/utils";

export default async function ClipperSubmissionsPage() {
  const session = await getSession();
  if (!session?.roles.includes("clipper") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const [submissions, store] = await Promise.all([
    listClipperSubmissions(),
    readStore(),
  ]);

  return (
    <div>
      <PageHeader title="My submissions" description="Track review status and earnings." />

      {submissions.length === 0 ? (
        <EmptyState title="No submissions" description="Browse campaigns to submit your first clip." />
      ) : (
        <ul className="space-y-3">
          {submissions.map((s) => {
            const campaign = store.campaigns.find((c) => c.id === s.campaignId);
            return (
              <li
                key={s.id}
                className="rounded-2xl border border-border bg-white px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{campaign?.title ?? "Campaign"}</p>
                    <a
                      href={s.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block text-sm text-gold hover:underline"
                    >
                      {s.postUrl}
                    </a>
                    <p className="mt-1 text-xs text-muted">
                      {s.platform} · {formatNumber(s.views)} views · {formatMoney(s.earningsCents)}
                    </p>
                  </div>
                  <Badge
                    tone={
                      s.status === "approved"
                        ? "success"
                        : s.status === "rejected"
                          ? "danger"
                          : "muted"
                    }
                  >
                    {s.status}
                  </Badge>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
