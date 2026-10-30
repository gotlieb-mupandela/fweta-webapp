import Link from "next/link";
import { redirect } from "next/navigation";

import { UserSuspendButton } from "@/components/forms/user-suspend-button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import {
  USER_TABS,
  buildDirectory,
  filterDirectory,
  isUserTab,
  type UserTab,
} from "@/lib/admin/directory";
import { formatMoney, formatNumber } from "@/lib/utils";

function joinedLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso || "Unknown";
  return date.toLocaleDateString("en-NA", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Windhoek" });
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const session = await getSession();
  if (!session?.roles.includes("admin")) redirect("/dashboard");

  const params = await searchParams;
  const tab: UserTab = isUserTab(params.tab) ? params.tab : "all";
  const query = params.q?.trim() ?? "";
  const store = await readStore();
  const all = buildDirectory(store);
  const rows = filterDirectory(all, tab, query);
  const exportHref = `/dashboard/admin/users/export?tab=${tab}${query ? `&q=${encodeURIComponent(query)}` : ""}`;

  return (
    <div className="dash-stack">
      <PageHeader
        title="Users"
        description={`${all.length} accounts in the live store. Open a row for social links, clips, money, and payout details.`}
        action={
          <a href={exportHref}>
            <Button type="button" variant="secondary" size="sm">
              Export CSV
            </Button>
          </a>
        }
      />

      <div className="flex flex-col gap-3">
        <nav aria-label="User groups" className="flex flex-wrap gap-2">
          {USER_TABS.map((item) => {
            const count = filterDirectory(all, item.id, "").length;
            const href = item.id === "all" ? "/dashboard/admin/users" : `/dashboard/admin/users?tab=${item.id}`;
            return (
              <Link
                key={item.id}
                href={query ? `${href}${href.includes("?") ? "&" : "?"}q=${encodeURIComponent(query)}` : href}
                aria-current={tab === item.id ? "page" : undefined}
                className={
                  tab === item.id
                    ? "rounded-full bg-foreground px-3.5 py-1.5 text-sm text-white"
                    : "rounded-full border border-border bg-white px-3.5 py-1.5 text-sm text-foreground"
                }
              >
                {item.label}
                <span className={tab === item.id ? "text-white/70" : "text-muted"}> {count}</span>
              </Link>
            );
          })}
        </nav>
        <form className="flex flex-wrap gap-2" action="/dashboard/admin/users">
          {tab !== "all" ? <input type="hidden" name="tab" value={tab} /> : null}
          <label className="sr-only" htmlFor="user-q">
            Search users
          </label>
          <input
            id="user-q"
            name="q"
            defaultValue={query}
            placeholder="Search name, email, or phone"
            className="input-capsule h-11 min-w-[220px] flex-1"
          />
          <Button type="submit" size="sm">
            Search
          </Button>
        </form>
      </div>

      <p className="text-sm text-muted">
        Showing {rows.length} of {all.length}.
        {query ? ` Search: ${query}.` : ""}
      </p>

      {rows.length === 0 ? (
        <EmptyState
          title={all.length === 0 ? "No users" : "No users match"}
          description={
            all.length === 0
              ? "Accounts will appear here after signup."
              : "Try another group or clear the search."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-[1.35rem] border border-border bg-white">
          <table className="stack-table w-full text-left text-sm md:min-w-[900px]">
            <thead className="border-b border-border text-[11px] uppercase tracking-[0.12em] text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-3 py-3 font-semibold">Phone</th>
                <th className="px-3 py-3 font-semibold">Roles</th>
                <th className="px-3 py-3 font-semibold">Joined</th>
                <th className="px-3 py-3 font-semibold">Verification</th>
                <th className="px-3 py-3 font-semibold">Socials</th>
                <th className="px-3 py-3 font-semibold">Clips</th>
                <th className="px-3 py-3 font-semibold">Views</th>
                <th className="px-3 py-3 font-semibold">Wallet</th>
                <th className="px-3 py-3 font-semibold"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td data-label="Name" className="px-4 py-3">
                    <Link href={`/dashboard/admin/users/${row.id}`} className="font-medium hover:underline">
                      {row.displayName}
                    </Link>
                    <p className="whitespace-nowrap text-xs text-muted">{row.email}</p>
                    {row.suspended ? <Badge tone="danger">Suspended</Badge> : null}
                  </td>
                  <td data-label="Phone" className="px-3 py-3 text-muted max-md:hidden">{row.phone || "None"}</td>
                  <td data-label="Roles" className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {row.roles.map((role) => (
                        <Badge key={role} tone={role === row.primaryRole ? "gold" : "muted"}>
                          {role}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td data-label="Joined" className="px-3 py-3 whitespace-nowrap">{joinedLabel(row.joinedAt)}</td>
                  <td data-label="Verification" className="min-w-[10rem] px-3 py-3 text-xs text-muted">{row.verification}</td>
                  <td data-label="Socials" className="px-3 py-3 max-md:hidden">{row.socialCount}</td>
                  <td data-label="Clips" className="px-3 py-3">{row.clips}</td>
                  <td data-label="Views" className="px-3 py-3 max-md:hidden">{formatNumber(row.views)}</td>
                  <td data-label="Wallet" className="px-3 py-3">
                    <p>{formatMoney(row.availableCents)}</p>
                    <p className="text-xs text-muted">
                      {formatMoney(row.pendingCents)} pending · {formatMoney(row.earningsCents)} earned
                    </p>
                  </td>
                  <td data-label="" className="px-3 py-3">
                    <UserSuspendButton userId={row.id} suspended={row.suspended} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
