import { redirect } from "next/navigation";

import { ResolveDisputeForm } from "@/components/forms/licensing-forms";
import { Badge, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";

export default async function AdminDisputesPage() {
  const session = await getSession();
  if (!session?.roles.includes("admin")) redirect("/dashboard");
  const store = await readStore();
  const disputes = [...store.licenseDisputes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="dash-stack">
      <PageHeader
        title="License disputes"
        description="A dispute does not move money by itself. Resolve it with a note both sides can read."
      />
      {disputes.length === 0 ? (
        <p className="text-sm text-muted">No disputes.</p>
      ) : (
        <ul className="space-y-4">
          {disputes.map((dispute) => {
            const license = store.contentLicenses.find((item) => item.id === dispute.licenseId);
            const opener = store.profiles.find((profile) => profile.id === dispute.openedBy);
            return (
              <li key={dispute.id} className="panel p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{license?.title ?? "License"}</p>
                  <Badge tone={dispute.status === "open" ? "gold" : "muted"}>{dispute.status}</Badge>
                </div>
                <p className="mt-1 text-muted">
                  Opened by {opener?.displayName ?? "User"} · {license?.brandName} and {license?.creatorName}
                </p>
                <p className="mt-2">{dispute.reason}</p>
                {dispute.resolution ? <p className="mt-2 text-muted">Note: {dispute.resolution}</p> : null}
                {dispute.status === "open" ? (
                  <div className="mt-3">
                    <ResolveDisputeForm disputeId={dispute.id} />
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
