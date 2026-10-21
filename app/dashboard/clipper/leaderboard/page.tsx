import { redirect } from "next/navigation";

import { ensureReferralCodeAction } from "@/app/actions/growth";
import { AwardPrizesButton } from "@/components/forms/award-prizes-button";
import { Card, EmptyState, PageHeader, SectionHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import {
  REFERRAL_BONUS_CENTS,
  WEEKLY_PRIZES_CENTS,
  creatorBadges,
  creatorLevel,
  thisWeekLeaderboard,
  verifiedViewsFor,
  weekKey,
} from "@/lib/marketplace/growth";
import { publicHandle } from "@/lib/rewards/content-rewards";
import { formatMoney, formatNumber } from "@/lib/utils";

export default async function ClipperLeaderboardPage() {
  const session = await getSession();
  if (!session?.roles.includes("clipper") && !session?.roles.includes("influencer") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const store = await readStore();
  const code = await ensureReferralCodeAction();
  const level = creatorLevel(verifiedViewsFor(store.submissions, session.id));
  const badges = creatorBadges(store, session.id);
  const week = weekKey();
  const weekly = thisWeekLeaderboard(store, (userId) => publicHandle(store.linkedAccounts, userId));
  const awarded = store.prizeAwards.some((item) => item.weekKey === week);
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
        description="Approved clips, ranked by verified views. Weekly prizes are fixed amounts."
      />
      <Card>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Your level</p>
        <p className="mt-2 font-display text-3xl tracking-tight">{level.name}</p>
        {level.next ? <p className="mt-1 text-sm text-muted">{level.next}</p> : null}
        <p className="mt-3 text-sm">
          {badges.length > 0 ? badges.map((badge) => badge.label).join(" · ") : "Badges appear after an approved clip, a payout, or a referral."}
        </p>
        <p className="mt-3 text-sm text-muted">
          Referral code <span className="font-medium text-foreground">{code}</span>. A referred creator&apos;s first approved clip pays you {formatMoney(REFERRAL_BONUS_CENTS)}.
        </p>
      </Card>
      <section>
        <SectionHeader title={`This week · ${week}`} />
        <p className="mb-3 text-sm text-muted">
          Ranked from view checks recorded this week. Prizes: {WEEKLY_PRIZES_CENTS.map((cents, index) => `${index + 1} ${formatMoney(cents)}`).join(", ")}. Not a draw.
        </p>
        {session.roles.includes("admin") ? <AwardPrizesButton awarded={awarded} /> : null}
        {weekly.length === 0 ? (
          <EmptyState title="No checks this week" description="Confirmed view counts from this week rank here." />
        ) : (
          <div className="panel mt-3 overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Place</th>
                  <th scope="col">Creator</th>
                  <th scope="col">Views checked</th>
                  <th scope="col">Prize</th>
                </tr>
              </thead>
              <tbody>
                {weekly.map((row, index) => (
                  <tr key={row.userId}>
                    <td>{index + 1}</td>
                    <td>{row.name}</td>
                    <td>{formatNumber(row.views)}</td>
                    <td>{row.prizeCents > 0 ? formatMoney(row.prizeCents) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <SectionHeader title="All time" />
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
