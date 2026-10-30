"use client";

import { DesktopTopBar } from "@/components/dashboard/desktop-top-bar";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { MobileTabBar } from "@/components/dashboard/mobile-tab-bar";
import { MobileTopBar } from "@/components/dashboard/mobile-top-bar";
import type { WorkspaceOption } from "@/components/onboarding/workspace-switcher";
import { cleanDisplayName } from "@/lib/text/display-name";
import type { UserRole } from "@/types/enums";

export function AppShell({
  role,
  roles,
  displayName,
  avatarUrl = null,
  unreadCount,
  workspaces = [],
  activeWorkspaceId = null,
  children,
}: {
  role: UserRole;
  roles: UserRole[];
  displayName: string;
  avatarUrl?: string | null;
  unreadCount: number;
  workspaces?: WorkspaceOption[];
  activeWorkspaceId?: string | null;
  children: React.ReactNode;
}) {
  const safeName = cleanDisplayName(displayName) || "Account";
  return (
    <div className="app-canvas flex min-h-dvh min-w-0">
      <DashboardSidebar
        role={role}
        roles={roles}
        displayName={safeName}
        avatarUrl={avatarUrl}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar
          displayName={safeName}
          avatarUrl={avatarUrl}
          unreadCount={unreadCount}
          role={role}
          roles={roles}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
        />
        <DesktopTopBar unreadCount={unreadCount} displayName={displayName} avatarUrl={avatarUrl} />

        <main id="main" className="app-main mx-auto w-full max-w-6xl flex-1 px-4 py-5 md:px-8 md:pb-10 md:pt-2 lg:px-10">
          <div className="animate-fade-up">{children}</div>
        </main>

        <MobileTabBar role={role} />
      </div>
    </div>
  );
}
