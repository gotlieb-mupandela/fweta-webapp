import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Film, SlidersHorizontal } from "lucide-react";

import { SubmissionReviewForm } from "@/components/forms/submission-review-form";
import { AvatarCircle } from "@/components/ui/avatar-circle";
import { Card, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Campaign, LedgerEntry, Profile, Submission } from "@/lib/db/types";
import { clipEarnedCents } from "@/lib/rewards/paid";
import { applySubmissionFilters, type SubmissionFilters } from "@/lib/submissions/filter";
import { cn, formatMoney, formatNumber } from "@/lib/utils";

const PLATFORM_LABEL: Record<string, string> = {
  tiktok: "TikTok",
  youtube: "YouTube",
  instagram: "Instagram",
  x: "X",
};

const STATUS_TABS: { value: SubmissionFilters["status"]; label: string }[] = [
  { value: "pending", label: "To review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "flagged", label: "Flagged" },
  { value: "all", label: "All" },
];

function hrefWith(action: string, filters: SubmissionFilters, status: string, lockCampaignId?: string) {
  const params = new URLSearchParams();
  params.set("status", status);
  if (filters.q) params.set("q", filters.q);
  if (filters.campaignId && filters.campaignId !== lockCampaignId) params.set("campaign", filters.campaignId);
  if (filters.clipperId) params.set("creator", filters.clipperId);
  if (filters.platform !== "all") params.set("platform", filters.platform);
  if (filters.sort !== "newest") params.set("sort", filters.sort);
  return `${action}?${params.toString()}`;
}

export function BrandSubmissionQueue({
  submissions: allSubmissions,
  campaigns,
  profiles,
  ledgerEntries,
  filters,
  action,
  lockCampaignId,
}: {
  submissions: Submission[];
  campaigns: Campaign[];
  profiles: Profile[];
  ledgerEntries: readonly LedgerEntry[];
  filters: SubmissionFilters;
  action: string;
  lockCampaignId?: string;
}) {
  const submissions = lockCampaignId
    ? allSubmissions.filter((s) => s.campaignId === lockCampaignId)
    : allSubmissions;

  if (submissions.length === 0) {
    return (
      <EmptyState
        icon={Film}
        title="No clips yet"
        description={
          campaigns.some((c) => c.status === "active")
            ? "Creators haven't submitted to your campaigns yet. New clips appear here for approval."
            : "Activate a campaign so creators can start submitting clips."
        }
        action={
          <Link href="/dashboard/brand/campaigns">
            <Button size="sm" variant="secondary">
              Go to campaigns
            </Button>
          </Link>
        }
      />
    );
  }

  const visible = applySubmissionFilters(submissions, filters, profiles, campaigns);
  const creators = profiles
    .filter((p) => submissions.some((s) => s.clipperId === p.id))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const countFor = (status: SubmissionFilters["status"]) =>
    applySubmissionFilters(submissions, { ...filters, status }, profiles, campaigns).length;
  const extraFilters =
    (!lockCampaignId && filters.campaignId ? 1 : 0) +
    (filters.clipperId ? 1 : 0) +
    (filters.platform !== "all" ? 1 : 0) +
    (filters.sort !== "newest" ? 1 : 0);

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2" aria-label="Clip status">
        {STATUS_TABS.map((tab) => {
          const active = filters.status === tab.value;
          const count = countFor(tab.value);
          return (
            <Link
              key={tab.value}
              href={hrefWith(action, filters, tab.value, lockCampaignId)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm transition md:min-h-9",
                active
                  ? "border-foreground bg-foreground text-white"
                  : "border-border bg-white text-muted hover:text-foreground",
              )}
            >
              {tab.label}
              <span className={cn("text-xs", active ? "text-white/70" : "text-muted-light")}>{count}</span>
            </Link>
          );
        })}
      </nav>

      <form action={action} className="space-y-2">
        <input type="hidden" name="status" value={filters.status} />
        {lockCampaignId ? <input type="hidden" name="campaign" value={lockCampaignId} /> : null}
        <div className="flex gap-2">
          <Input
            name="q"
            defaultValue={filters.q}
            placeholder="Search creator, campaign, or link"
            aria-label="Search clips"
            className="flex-1"
          />
          <Button type="submit" size="sm" className="h-auto shrink-0">
            Search
          </Button>
        </div>
        <details className="group" open={extraFilters > 0}>
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm text-muted hover:text-foreground">
            <SlidersHorizontal className="size-3.5" aria-hidden />
            More filters{extraFilters ? ` (${extraFilters})` : ""}
          </summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {lockCampaignId ? null : (
              <Select name="campaign" defaultValue={filters.campaignId} aria-label="Campaign">
                <option value="">All campaigns</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </Select>
            )}
            <Select name="creator" defaultValue={filters.clipperId} aria-label="Creator">
              <option value="">All creators</option>
              {creators.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </Select>
            <Select name="platform" defaultValue={filters.platform} aria-label="Platform">
              <option value="all">All platforms</option>
              <option value="tiktok">TikTok</option>
              <option value="youtube">YouTube</option>
              <option value="instagram">Instagram</option>
              <option value="x">X</option>
            </Select>
            <Select name="sort" defaultValue={filters.sort} aria-label="Sort">
              <option value="newest">Newest first</option>
              <option value="earnings">Highest paid</option>
              <option value="views">Most views</option>
            </Select>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <Button type="submit" size="sm" variant="secondary">
              Apply
            </Button>
            <Link href={action} className="text-sm text-muted hover:text-foreground">
              Reset
            </Link>
          </div>
        </details>
      </form>

      {visible.length === 0 ? (
        <EmptyState
          icon={Film}
          title={filters.status === "pending" ? "All caught up" : "No clips match"}
          description={
            filters.status === "pending"
              ? "There's nothing waiting for your review right now."
              : "Try another status or clear your filters."
          }
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((s) => {
            const clipper = profiles.find((p) => p.id === s.clipperId);
            const campaign = campaigns.find((c) => c.id === s.campaignId);
            const creatorName = clipper?.displayName ?? "Unknown creator";
            const earned = clipEarnedCents(ledgerEntries, s);
            const paidOnCampaignToCreator = allSubmissions
              .filter((x) => x.campaignId === s.campaignId && x.clipperId === s.clipperId)
              .reduce((sum, x) => sum + clipEarnedCents(ledgerEntries, x), 0);

            return (
              <li key={s.id}>
                <Card className="panel-interactive">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <AvatarCircle src={clipper?.avatarUrl} name={creatorName} size="sm" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-foreground">{creatorName}</p>
                          <StatusBadge status={s.status} />
                        </div>
                        <p className="mt-0.5 text-xs text-muted">
                          {campaign && !lockCampaignId ? `${campaign.title} · ` : ""}
                          {PLATFORM_LABEL[s.platform] ?? s.platform} ·{" "}
                          {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <a href={s.postUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      <Button size="sm" variant="secondary">
                        Watch ↗
                      </Button>
                    </a>
                  </div>

                  <dl className="mt-4 grid grid-cols-3 divide-x divide-border rounded-xl bg-surface-2 py-2.5 text-center">
                    <div className="px-2">
                      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                        Views
                      </dt>
                      <dd className="mt-0.5 text-sm font-semibold tabular-nums">{formatNumber(s.views)}</dd>
                    </div>
                    <div className="px-2">
                      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                        Earned
                      </dt>
                      <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                        {formatMoney(earned)}
                      </dd>
                    </div>
                    <div className="px-2" title="Everything this creator earned on this campaign">
                      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                        Creator total
                      </dt>
                      <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                        {formatMoney(paidOnCampaignToCreator)}
                      </dd>
                    </div>
                  </dl>

                  {s.reviewNote ? (
                    <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">
                      <span className="font-medium text-foreground">Your note:</span> {s.reviewNote}
                    </p>
                  ) : null}

                  {s.status === "pending" ? (
                    <div className="mt-4 border-t border-border/80 pt-4">
                      <SubmissionReviewForm submissionId={s.id} />
                    </div>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
