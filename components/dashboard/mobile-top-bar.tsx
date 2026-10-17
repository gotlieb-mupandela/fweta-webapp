"use client";

import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { MobileMenu } from "@/components/dashboard/mobile-menu";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import type { WorkspaceOption } from "@/components/onboarding/workspace-switcher";
import { getBackHref, getScreenTitle } from "@/lib/dashboard/nav";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/enums";

export function MobileTopBar({
  displayName,
  unreadCount,
  role,
  roles,
  workspaces = [],
  activeWorkspaceId = null,
}: {
  displayName: string;
  unreadCount: number;
  role: UserRole;
  roles: UserRole[];
  workspaces?: WorkspaceOption[];
  activeWorkspaceId?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const backHref = getBackHref(pathname);
  const title = getScreenTitle(pathname);

  return (
    <header className="public-header sticky top-0 z-40 md:hidden">
      <div
        className="flex h-12 items-center gap-2 px-3"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <MobileMenu
          role={role}
          roles={roles}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
        />
        {backHref ? (
          <button
            type="button"
            onClick={() => router.push(backHref)}
            className="tab-press -ml-1 flex size-11 items-center justify-center rounded-xl text-foreground active:bg-surface-2"
            aria-label="Go back"
          >
            <ChevronLeft className="size-6" strokeWidth={1.75} />
          </button>
        ) : null}

        <span className="sr-only">{displayName}</span>
        <h1
          className={cn(
            "min-w-0 flex-1 truncate font-display text-[1.35rem] leading-none tracking-tight text-foreground",
            backHref ? "text-center" : "text-left",
          )}
        >
          {title}
        </h1>

        <NotificationBell count={unreadCount} className="md:hidden" />
      </div>
    </header>
  );
}
