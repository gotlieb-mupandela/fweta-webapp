import Link from "next/link";
import { redirect } from "next/navigation";

import { VerificationReviewButtons } from "@/components/forms/verification-review-buttons";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";

export default async function AdminVerificationPage() {
  const session = await getSession();
  if (!session?.roles.includes("admin")) redirect("/dashboard");

  const store = await readStore();
  const pending = store.profiles.filter((profile) => profile.verification?.status === "pending");

  return (
    <div className="dash-stack">
      <PageHeader
        title="Bio code queue"
        description="Confirm the code is visible on the creator's public social bio, then mark the account verified."
      />
      {pending.length === 0 ? (
        <EmptyState
          title="No codes waiting"
          description="Creators request a code from Settings, then paste it into a social bio."
        />
      ) : (
        <ul className="space-y-2.5">
          {pending.map((profile) => (
            <li key={profile.id} className="list-row flex-wrap items-start">
              <div className="min-w-0">
                <p className="font-medium">{profile.displayName}</p>
                <p className="text-sm text-muted">{profile.email}</p>
                <p className="mt-2 font-display text-2xl tracking-tight">{profile.verification?.code}</p>
                <Link href={`/dashboard/admin/users/${profile.id}`} className="section-link mt-2 inline-block">
                  Open profile
                </Link>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge tone="gold">Pending</Badge>
                <VerificationReviewButtons userId={profile.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
