"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";

import { logoutAction } from "@/app/actions/auth";
import { Logo } from "@/components/brand/logo";
import { RoleSwitcher } from "@/components/dashboard/role-switcher";
import { WorkspaceSwitcher, type WorkspaceOption } from "@/components/onboarding/workspace-switcher";
import { Button } from "@/components/ui/button";
import { ROLE_NAV, findActiveNav, navItemsFor, type NavItem } from "@/lib/dashboard/nav";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/enums";

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition duration-150",
        active
          ? "bg-foreground text-white"
          : "text-foreground/80 hover:bg-surface-2 hover:text-foreground",
      )}
    >
      <Icon
        className={cn("size-4 shrink-0", active ? "text-gold-soft" : "text-muted")}
        strokeWidth={1.85}
        aria-hidden
      />
      {item.label}
    </Link>
  );
}

export function DashboardSidebar({
  role,
  roles,
  displayName,
  workspaces = [],
  activeWorkspaceId = null,
}: {
  role: UserRole;
  roles: UserRole[];
  displayName: string;
  workspaces?: WorkspaceOption[];
  activeWorkspaceId?: string | null;
}) {
  const pathname = usePathname();
  const config = ROLE_NAV[role] ?? ROLE_NAV.clipper;
  const active = findActiveNav(pathname, navItemsFor(role));

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-hidden border-r border-border bg-white md:flex">
      <div className="flex h-16 items-center px-5">
        <Logo href="/dashboard" size="sm" />
      </div>

      <div className="space-y-2 px-4 pb-4">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Role</p>
        <RoleSwitcher roles={roles} current={role} />
        {role === "brand" ? (
          <WorkspaceSwitcher workspaces={workspaces} activeId={activeWorkspaceId} />
        ) : null}
      </div>

      <nav aria-label="Dashboard" className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 pb-4">
        {config.groups.map((group) => (
          <div key={group.label} className="space-y-0.5">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              {group.label}
            </p>
            {group.items.map((item) => (
              <SidebarLink key={item.href} item={item} active={active?.href === item.href} />
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-4">
        <p className="truncate px-1 text-sm font-medium text-foreground">{displayName}</p>
        <form action={logoutAction} className="mt-2">
          <Button type="submit" variant="ghost" size="sm" className="w-full justify-start gap-2">
            <LogOut className="size-3.5" aria-hidden />
            Log out
          </Button>
        </form>
      </div>
    </aside>
  );
}
