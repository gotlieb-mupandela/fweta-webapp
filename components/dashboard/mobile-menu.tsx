"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { RoleSwitcher } from "@/components/dashboard/role-switcher";
import { WorkspaceSwitcher, type WorkspaceOption } from "@/components/onboarding/workspace-switcher";
import { ROLE_NAV, findActiveNav, navItemsFor } from "@/lib/dashboard/nav";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/enums";

export function MobileMenu({
  role,
  roles,
  workspaces = [],
  activeWorkspaceId = null,
}: {
  role: UserRole;
  roles: UserRole[];
  workspaces?: WorkspaceOption[];
  activeWorkspaceId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const config = ROLE_NAV[role] ?? ROLE_NAV.clipper;
  const active = findActiveNav(pathname, navItemsFor(role));

  return (
    <>
      <button
        type="button"
        className="tab-press flex size-11 items-center justify-center rounded-xl text-foreground active:bg-surface-2 md:hidden"
        aria-expanded={open}
        aria-controls="mobile-dashboard-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-foreground/40"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <nav
            id="mobile-dashboard-nav"
            aria-label="Dashboard"
            className="absolute inset-y-0 left-0 flex w-[min(100%,20rem)] flex-col overflow-y-auto bg-white px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))] shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <Logo href="/dashboard" size="sm" />
              <button type="button" className="rounded-lg p-2" aria-label="Close menu" onClick={() => setOpen(false)}>
                <X className="size-5" />
              </button>
            </div>
            <div className="mb-4 space-y-2">
              <RoleSwitcher roles={roles} current={role} id="role-switcher-mobile" />
              {role === "brand" ? (
                <WorkspaceSwitcher workspaces={workspaces} activeId={activeWorkspaceId} />
              ) : null}
            </div>
            {config.groups.map((group) => (
              <div key={group.label} className="mb-4">
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                  {group.label}
                </p>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const on = active?.href === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={on ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                        on ? "bg-foreground text-white" : "text-foreground",
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>
      ) : null}
    </>
  );
}
