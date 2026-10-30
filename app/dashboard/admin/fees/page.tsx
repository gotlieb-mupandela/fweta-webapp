import { formatAppDateTime } from "@/lib/format/time";
import { redirect } from "next/navigation";

import { FeeForm } from "@/components/forms/fee-form";
import { Card, EmptyState, PageHeader, SectionHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { feeBpsFromStore } from "@/lib/rewards/content-rewards";

export default async function AdminFeesPage() {
  const session = await getSession();
  if (!session?.roles.includes("admin")) redirect("/dashboard");
  const store = await readStore();
  const feeBps = feeBpsFromStore(store);
  const log = [...store.auditLog].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 40);

  return (
    <div className="dash-stack">
      <PageHeader
        title="Platform fee"
        description="The fee is charged on the brand side of delivered spend. A change applies the next time a campaign reserves budget."
      />
      <Card>
        <FeeForm feeBps={feeBps} />
        <p className="mt-3 text-xs text-muted">Current rate {(feeBps / 100).toFixed(2)}%. Clipper rates on the card do not change.</p>
      </Card>
      <section>
        <SectionHeader title="Admin audit log" />
        {log.length === 0 ? (
          <EmptyState title="No admin actions yet" description="Pay-ins, view checks, payouts, identity reviews, and fee changes are listed here." />
        ) : (
          <ul className="space-y-2">
            {log.map((entry) => {
              const actor = store.profiles.find((item) => item.id === entry.actorId);
              return (
                <li key={entry.id} className="list-row items-start">
                  <div>
                    <p className="text-sm font-medium">{entry.summary}</p>
                    <p className="text-xs text-muted">
                      {entry.action} · {actor?.displayName || "Admin"} · {formatAppDateTime(entry.createdAt)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
