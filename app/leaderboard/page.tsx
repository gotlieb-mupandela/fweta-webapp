import Link from "next/link";

import { PublicChrome } from "@/components/public-chrome";
import { AvatarCircle } from "@/components/ui/avatar-circle";
import { EmptyState } from "@/components/ui/card";
import { readStore } from "@/lib/db/store";
import { formatMoney, formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const store = await readStore();
  const totals = new Map<string, { views: number; earningsCents: number }>();
  for (const submission of store.submissions) {
    if (submission.status !== "approved") continue;
    const current = totals.get(submission.clipperId) ?? { views: 0, earningsCents: 0 };
    current.views += submission.views;
    current.earningsCents += submission.earningsCents;
    totals.set(submission.clipperId, current);
  }

  const rows = store.profiles
    .filter((profile) => !profile.suspended && totals.has(profile.id))
    .map((profile) => ({
      profile,
      ...(totals.get(profile.id) as { views: number; earningsCents: number }),
    }))
    .sort((a, b) => b.views - a.views || b.earningsCents - a.earningsCents);

  return (
    <PublicChrome
      title="Leaderboard"
      description="Approved clips, ranked by checked views. Earnings follow the campaign CPM."
    >
      {rows.length === 0 ? (
        <EmptyState
          title="No ranked clips yet"
          description="Creators appear here after a brand approves a clip and records views."
        />
      ) : (
        <ol className="space-y-2.5">
          {rows.map((row, index) => (
            <li key={row.profile.id} className="list-row">
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-6 text-sm font-medium text-muted">{index + 1}</span>
                <AvatarCircle src={row.profile.avatarUrl} name={row.profile.displayName} size="sm" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.profile.displayName}</p>
                  <p className="text-sm text-muted">
                    {formatNumber(row.views)} views · {formatMoney(row.earningsCents)}
                  </p>
                </div>
              </div>
              <Link href="/campaigns" className="text-sm font-medium text-gold-deep hover:underline">
                Campaigns
              </Link>
            </li>
          ))}
        </ol>
      )}
    </PublicChrome>
  );
}
