"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";

import { logoutAction } from "@/app/actions/auth";
import { Logo } from "@/components/brand/logo";
import { RoleSwitcher } from "@/components/dashboard/role-switcher";
import { Button } from "@/components/ui/button";
import {
  ROLE_NAV,
  isNavActive,
  type NavItem,
} from "@/lib/dashboard/nav";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/enums";

function SidebarLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isNavActive(pathname, item);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        "group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition duration-150",
        active
          ? "bg-foreground text-white shadow-sm"
          : "text-muted hover:bg-surface-2 hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "size-[18px] shrink-0 transition",
          active ? "text-gold" : "text-muted-light group-hover:text-foreground",
        )}
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
}: {
  role: UserRole;
  roles: UserRole[];
  displayName: string;
}) {
  const pathname = usePathname();
  const config = ROLE_NAV[role] ?? ROLE_NAV.clipper;
  const primary = config.tabs.filter((t) => !t.href.startsWith("/dashboard/settings"));
  const settingsTab = config.tabs.find((t) => t.href.startsWith("/dashboard/settings"));

  return (
    <aside className="sticky top-0 hidden h-dvh w-[260px] shrink-0 flex-col border-r border-border/80 bg-white/90 backdrop-blur-xl md:flex">
      <div className="flex h-16 items-center px-5">
        <Logo href="/dashboard" size="sm" />
      </div>

      <div className="px-4 pb-4">
        <RoleSwitcher roles={roles} current={role} />
      </div>

      <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 pb-4">
        <div className="space-y-0.5">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-light">
            Workspace
          </p>
          {primary.map((item) => (
            <SidebarLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>

        {config.sidebarExtra.length > 0 ? (
          <div className="space-y-0.5">
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-light">
              More
            </p>
            {config.sidebarExtra.map((item) => (
              <SidebarLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        ) : null}

        {settingsTab ? (
          <div className="mt-auto space-y-0.5 border-t border-border/70 pt-4">
            <SidebarLink item={settingsTab} pathname={pathname} />
          </div>
        ) : null}
      </nav>

      <div className="border-t border-border/70 p-4">
        <Link
          href="/dashboard/settings/profile"
          className="mb-3 block truncate rounded-2xl px-3 py-2 text-sm font-medium text-foreground transition hover:bg-surface-2"
        >
          {displayName}
        </Link>
        <form action={logoutAction}>
          <Button type="submit" variant="secondary" size="sm" className="w-full justify-start gap-2">
            <LogOut className="size-3.5" aria-hidden />
            Log out
          </Button>
        </form>
      </div>
    </aside>
  );
}
