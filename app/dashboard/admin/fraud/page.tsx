import { redirect } from "next/navigation";

import { listFraudFlags } from "@/app/actions/settings";
import { FraudFlagActions } from "@/components/forms/fraud-flag-actions";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";

export default async function AdminFraudPage() {
  const session = await getSession();
  if (!session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const [flags, store] = await Promise.all([listFraudFlags(), readStore()]);

  return (
    <div>
      <PageHeader title="Fraud review" description="Flagged submissions and resolution queue." />

      {flags.length === 0 ? (
        <EmptyState title="No fraud flags" description="Flagged submissions will appear here." />
      ) : (
        <ul className="space-y-4">
          {flags.map((f) => {
            const submission = store.submissions.find((s) => s.id === f.submissionId);
            const campaign = submission
              ? store.campaigns.find((c) => c.id === submission.campaignId)
              : null;
            return (
              <li
                key={f.id}
                className="rounded-2xl border border-border bg-white px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{f.reason}</p>
                    <p className="text-sm text-muted">
                      {campaign?.title ?? "Unknown campaign"}
                      {submission ? ` · ${submission.postUrl}` : ""}
                    </p>
                    <p className="text-xs text-muted">{new Date(f.createdAt).toLocaleString()}</p>
                  </div>
                  <Badge tone={f.status === "open" ? "gold" : "muted"}>{f.status}</Badge>
                </div>
                {f.status === "open" ? (
                  <div className="mt-4 border-t border-border pt-4">
                    <FraudFlagActions flagId={f.id} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
