"use client";

import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { MobileTabBar } from "@/components/dashboard/mobile-tab-bar";
import { MobileTopBar } from "@/components/dashboard/mobile-top-bar";
import type { UserRole } from "@/types/enums";

export function AppShell({
  role,
  roles,
  displayName,
  children,
}: {
  role: UserRole;
  roles: UserRole[];
  displayName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="app-canvas flex min-h-dvh">
      <DashboardSidebar role={role} roles={roles} displayName={displayName} />

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar displayName={displayName} />

        <main className="app-main mx-auto w-full max-w-5xl flex-1 px-4 py-5 md:px-8 md:py-8 lg:px-10">
          <div className="animate-fade-up">{children}</div>
        </main>

        <MobileTabBar role={role} />
      </div>
    </div>
  );
}
