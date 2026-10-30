"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";

import { logoutAction } from "@/app/actions/auth";
import { Logo } from "@/components/brand/logo";
import { RoleSwitcher } from "@/components/dashboard/role-switcher";
import { AvatarCircle } from "@/components/ui/avatar-circle";
import { WorkspaceSwitcher, type WorkspaceOption } from "@/components/onboarding/workspace-switcher";
import { Button } from "@/components/ui/button";
import { ROLE_NAV, findActiveNav, navItemsFor, type NavItem } from "@/lib/dashboard/nav";
import { cleanDisplayName } from "@/lib/text/display-name";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/enums";

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition duration-150",
        active
          ? "bg-gold-soft text-foreground"
          : "text-muted hover:bg-surface-2 hover:text-foreground",
      )}
    >
      <Icon
        className={cn("size-4 shrink-0", active ? "text-gold-deep" : "text-muted")}
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
  avatarUrl = null,
  workspaces = [],
  activeWorkspaceId = null,
}: {
  role: UserRole;
  roles: UserRole[];
  displayName: string;
  avatarUrl?: string | null;
  workspaces?: WorkspaceOption[];
  activeWorkspaceId?: string | null;
}) {
  const pathname = usePathname();
  const config = ROLE_NAV[role] ?? ROLE_NAV.clipper;
  const active = findActiveNav(pathname, navItemsFor(role));
  const safeName = cleanDisplayName(displayName) || "Account";

  return (
    <aside className="hidden w-64 shrink-0 bg-white shadow-[1px_0_0_0_color-mix(in_srgb,var(--border)_70%,transparent)] md:block">
      <div className="sticky top-0 flex h-dvh flex-col overflow-hidden">
      <div className="flex h-16 items-center px-5">
        <Logo href="/dashboard" size="sm" />
      </div>

      <div className="space-y-2 px-4 pb-5">
        <p className="eyebrow px-1">Role</p>
        <RoleSwitcher roles={roles} current={role} />
        {role === "brand" ? (
          <WorkspaceSwitcher workspaces={workspaces} activeId={activeWorkspaceId} />
        ) : null}
      </div>

      <nav aria-label="Dashboard" className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 pb-4">
        {config.groups.map((group) => (
          <div key={group.label} className="space-y-0.5">
            <p className="eyebrow px-3 pb-1.5">
              {group.label}
            </p>
            {group.items.map((item) => (
              <SidebarLink key={item.href} item={item} active={active?.href === item.href} />
            ))}
          </div>
        ))}
      </nav>

      <div className="p-3">
        <div className="rounded-2xl bg-surface-2/70 p-3">
        <div className="flex min-w-0 items-center gap-3 px-1">
          <AvatarCircle src={avatarUrl} name={safeName} size="sm" />
          <p className="min-w-0 max-w-full truncate text-sm font-medium text-foreground" title={safeName}>
            {safeName}
          </p>
        </div>
        <form action={logoutAction} className="mt-2">
          <Button type="submit" variant="ghost" size="sm" className="w-full justify-start gap-2">
            <LogOut className="size-3.5" aria-hidden />
            Log out
          </Button>
        </form>
        </div>
      </div>
      </div>
    </aside>
  );
}
