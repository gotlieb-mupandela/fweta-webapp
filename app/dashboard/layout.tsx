import Link from "next/link";
import { redirect } from "next/navigation";

import { logoutAction, switchPrimaryRoleAction } from "@/app/actions/auth";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { getSession, seedDemoAccounts } from "@/lib/auth/session";
import type { UserRole } from "@/types/enums";
import { cn } from "@/lib/utils";

const NAV: Record<UserRole, { href: string; label: string }[]> = {
  brand: [
    { href: "/dashboard/brand", label: "Overview" },
    { href: "/dashboard/brand/campaigns", label: "Campaigns" },
    { href: "/dashboard/brand/bookings", label: "Bookings" },
    { href: "/dashboard/brand/analytics", label: "Analytics" },
    { href: "/dashboard/brand/deposits", label: "Deposits" },
  ],
  clipper: [
    { href: "/dashboard/clipper", label: "Overview" },
    { href: "/dashboard/clipper/campaigns", label: "Campaigns" },
    { href: "/dashboard/clipper/submissions", label: "Submissions" },
    { href: "/dashboard/clipper/earnings", label: "Earnings" },
  ],
  influencer: [
    { href: "/dashboard/influencer", label: "Overview" },
    { href: "/dashboard/influencer/profile", label: "Profile" },
    { href: "/dashboard/influencer/rate-cards", label: "Rate cards" },
    { href: "/dashboard/influencer/bookings", label: "Bookings" },
    { href: "/dashboard/influencer/earnings", label: "Earnings" },
  ],
  admin: [
    { href: "/dashboard/admin", label: "Overview" },
    { href: "/dashboard/admin/withdrawals", label: "Withdrawals" },
    { href: "/dashboard/admin/users", label: "Users" },
    { href: "/dashboard/admin/fraud", label: "Fraud" },
    { href: "/dashboard/admin/stats", label: "Stats" },
  ],
};

const SETTINGS_LINKS = [
  { href: "/dashboard/settings", label: "Settings" },
  { href: "/dashboard/settings/wallet", label: "Wallet" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await seedDemoAccounts();
  const session = await getSession();
  if (!session) redirect("/login");

  const role = session.primaryRole;
  const links = NAV[role] || [];

  return (
    <div className="min-h-screen bg-atmosphere">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 md:px-8">
          <div className="flex items-center gap-8">
            <Logo href="/dashboard" />
            <nav className="hidden items-center gap-0.5 md:flex">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="rounded-xl px-3 py-2 text-[13px] font-medium text-muted transition hover:bg-surface-2 hover:text-foreground"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-border bg-surface-2/80 px-2.5 py-1 text-[11px] font-medium capitalize text-muted sm:inline">
              {role}
            </span>
            {session.roles.length > 1 ? (
              <form
                action={async (fd) => {
                  "use server";
                  const nextRole = String(fd.get("role")) as UserRole;
                  await switchPrimaryRoleAction(nextRole);
                  redirect(`/dashboard/${nextRole === "admin" ? "admin" : nextRole}`);
                }}
                className="hidden items-center gap-1 lg:flex"
              >
                <select
                  name="role"
                  defaultValue={role}
                  className="h-9 rounded-xl border border-border bg-white px-2.5 text-xs capitalize"
                >
                  {session.roles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <Button type="submit" size="sm" variant="ghost">
                  Switch
                </Button>
              </form>
            ) : null}
            <Link
              href="/dashboard/settings"
              className="hidden max-w-[140px] truncate text-sm font-medium text-foreground sm:inline"
            >
              {session.displayName}
            </Link>
            <form action={logoutAction}>
              <Button type="submit" size="sm" variant="secondary">
                Log out
              </Button>
            </form>
          </div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto px-5 pb-3 md:hidden">
          {[...links, ...SETTINGS_LINKS].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="shrink-0 rounded-full border border-border bg-white px-3.5 py-1.5 text-xs font-medium text-muted"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8 md:px-8 md:py-11">{children}</main>
    </div>
  );
}

export function navClass(active: boolean) {
  return cn(
    "rounded-xl px-3 py-2 text-sm",
    active ? "bg-foreground text-white" : "text-muted hover:bg-surface",
  );
}
