import Link from "next/link";
import { redirect } from "next/navigation";

import { ContextHelp } from "@/components/onboarding/context-help";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { PLATFORM_LABEL, summarizeOnboarding, type OnboardingGate } from "@/lib/onboarding/model";

const TONE: Record<OnboardingGate, "neutral" | "gold" | "success" | "muted"> = {
  legacy: "muted",
  not_started: "muted",
  in_progress: "gold",
  exited: "gold",
  complete: "success",
};

export default async function AdminOnboardingPage() {
  const session = await getSession();
  if (!session?.roles.includes("admin")) redirect("/dashboard");

  const store = await readStore();
  const rows = store.profiles
    .map((profile) =>
      summarizeOnboarding(profile, {
        hasPayout: store.payoutMethods.some((method) => method.userId === profile.id),
      }),
    )
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return (
    <div className="dash-stack">
      <PageHeader
        title="Onboarding"
        description="See who finished setup, who left early, and which steps are still open."
      />
      <ContextHelp
        title="Your first admin checks"
        body="Confirm a brand pay-in before their campaign can go live, then record views on approved clips so earnings calculate automatically. Teams, extra brands, and social accounts are listed in the admin menu."
        hint="This page is the setup status for every account. Pay-ins and view checks are the actions only an admin can take."
      />
      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/admin/payins" className="list-row inline-flex">
          <span className="text-sm font-medium">Open pay-ins</span>
        </Link>
        <Link href="/dashboard/admin/views" className="list-row inline-flex">
          <span className="text-sm font-medium">Open view checks</span>
        </Link>
        <Link href="/help" className="list-row inline-flex">
          <span className="text-sm font-medium">Help center</span>
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No accounts yet" description="Signup progress will show up here." />
      ) : (
        <ul className="space-y-2.5">
          {rows.map((row) => (
            <li key={row.userId}>
              <Link href={`/dashboard/admin/users/${row.userId}`} className="list-row flex-wrap sm:flex-nowrap">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{row.displayName}</p>
                    <Badge tone={TONE[row.gate]}>{row.label}</Badge>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted">{row.email}</p>
                  <p className="mt-1 text-xs text-muted">
                    {row.primaryRole}
                    {row.gate === "legacy"
                      ? ""
                      : ` · ${row.completedCount} of ${row.totalCount} steps`}
                    {row.currentStep ? ` · Next: ${row.currentStep}` : ""}
                  </p>
                  {row.verifiedPlatforms.length > 0 ? (
                    <p className="mt-1 text-xs text-muted">
                      Verified: {row.verifiedPlatforms.map((platform) => PLATFORM_LABEL[platform]).join(", ")}
                    </p>
                  ) : null}
                  {row.skipped.length > 0 ? (
                    <p className="mt-1 text-xs text-muted">Skipped: {row.skipped.join(", ")}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted">
                    {(store.socialAccounts ?? []).filter((account) => account.userId === row.userId).length} social accounts
                    {" · "}
                    {(store.workspaceMembers ?? []).filter((member) => member.userId === row.userId).length} brand memberships
                  </p>
                </div>
                <div className="w-full sm:w-36">
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-surface-2"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={row.percent}
                    aria-label={`${row.displayName} setup completion`}
                  >
                    <div className="h-full rounded-full bg-gold" style={{ width: `${row.percent}%` }} />
                  </div>
                  <p className="mt-1 text-right text-xs text-muted">{row.percent}%</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
