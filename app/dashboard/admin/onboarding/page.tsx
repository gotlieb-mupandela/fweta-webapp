import Link from "next/link";
import { redirect } from "next/navigation";

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
