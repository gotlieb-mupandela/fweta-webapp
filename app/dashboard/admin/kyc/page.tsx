import { redirect } from "next/navigation";

import { KycReviewButtons } from "@/components/forms/kyc-review-buttons";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";

export default async function AdminKycPage() {
  const session = await getSession();
  if (!session?.roles.includes("admin")) redirect("/dashboard");
  const store = await readStore();
  const rows = store.profiles
    .filter((profile) => profile.kyc)
    .sort((a, b) => (b.kyc?.submittedAt ?? "").localeCompare(a.kyc?.submittedAt ?? ""));

  return (
    <div className="dash-stack">
      <PageHeader
        title="Identity checks"
        description="The first payout stays blocked until you verify the ID photo. The minimum payout is N$100."
      />
      {rows.length === 0 ? (
        <EmptyState title="No identity files" description="Creators add an ID when they request the first payout." />
      ) : (
        <ul className="space-y-3">
          {rows.map((profile) => {
            const status = profile.kyc?.status ?? "verified";
            return (
              <li key={profile.id} className="panel space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{profile.kyc?.legalName}</p>
                    <p className="text-sm text-muted">
                      {profile.displayName} · {profile.email} · {profile.kyc?.country}
                    </p>
                    {profile.kyc?.reviewNote ? <p className="mt-1 text-xs text-muted">{profile.kyc.reviewNote}</p> : null}
                  </div>
                  <Badge tone={status === "verified" ? "success" : status === "rejected" ? "danger" : "gold"}>
                    {status}
                  </Badge>
                </div>
                {profile.kyc?.documentPath ? (
                  <a href={`/api/kyc/${profile.kyc.documentPath}`} className="text-sm text-gold-deep hover:underline">
                    View ID photo
                  </a>
                ) : (
                  <p className="text-xs text-muted">No photo uploaded yet.</p>
                )}
                {status === "pending" ? <KycReviewButtons userId={profile.id} /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
