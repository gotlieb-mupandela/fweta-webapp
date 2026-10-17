import type { LeaderRow } from "@/lib/rewards/content-rewards";
import { formatMoney, formatNumber } from "@/lib/utils";

export function Leaderboard({ rows }: { rows: LeaderRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted">
        Approved clips will rank here by verified views.
      </p>
    );
  }
  return (
    <ol className="space-y-2">
      {rows.map((row, index) => (
        <li key={row.clipperId} className="list-row">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gold-soft text-xs font-semibold text-gold-deep">
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{row.displayName}</p>
              <p className="text-xs text-muted">
                {row.handle ? `${row.handle} · ` : ""}
                {row.clips} {row.clips === 1 ? "clip" : "clips"} · {formatNumber(row.views)} views
              </p>
            </div>
          </div>
          <p className="shrink-0 text-sm font-medium">
            {row.estimate ? "Est. " : ""}
            {formatMoney(row.earningsCents)}
          </p>
        </li>
      ))}
    </ol>
  );
}
