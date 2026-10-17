import { redirect } from "next/navigation";

import { EmptyState, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { publicHandle } from "@/lib/rewards/content-rewards";
import { formatMoney, formatNumber } from "@/lib/utils";

export default async function ClipperLeaderboardPage() {
  const session = await getSession();
  if (!session?.roles.includes("clipper") && !session?.roles.includes("influencer") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const store = await readStore();
  const rows = new Map<string, { name: string; handle: string | null; views: number; earningsCents: number; clips: number }>();
  for (const submission of store.submissions) {
    if (submission.status !== "approved") continue;
    const profile = store.profiles.find((item) => item.id === submission.clipperId);
    const current = rows.get(submission.clipperId) ?? {
      name: profile?.displayName || "Creator",
      handle: publicHandle(store.linkedAccounts, submission.clipperId),
      views: 0,
      earningsCents: 0,
      clips: 0,
    };
    current.views += submission.views;
    current.earningsCents += submission.earningsCents;
    current.clips += 1;
    rows.set(submission.clipperId, current);
  }
  const ranked = [...rows.entries()].sort((a, b) => b[1].views - a[1].views);

  return (
    <div className="dash-stack">
      <PageHeader
        title="Leaderboard"
        description="Approved clips, ranked by verified views."
      />
      {ranked.length === 0 ? (
        <EmptyState title="No ranked clips yet" description="Approved clips with a view count show up here." />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Creator</th>
                <th scope="col">Clips</th>
                <th scope="col">Views</th>
                <th scope="col">Earnings</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map(([id, row], index) => (
                <tr key={id} className={id === session.id ? "bg-gold-soft/60" : undefined}>
                  <td>{index + 1}</td>
                  <td>
                    <span className="font-medium">{row.name}</span>
                    {row.handle ? <span className="ml-2 text-muted">{row.handle}</span> : null}
                  </td>
                  <td>{row.clips}</td>
                  <td>{formatNumber(row.views)}</td>
                  <td>{formatMoney(row.earningsCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
