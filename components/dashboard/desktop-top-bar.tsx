"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NotificationBell } from "@/components/dashboard/notification-bell";
import { AvatarCircle } from "@/components/ui/avatar-circle";
import { getScreenTitle } from "@/lib/dashboard/nav";

export function DesktopTopBar({
  unreadCount,
  displayName,
  avatarUrl = null,
}: {
  unreadCount: number;
  displayName: string;
  avatarUrl?: string | null;
}) {
  const pathname = usePathname();
  const title = getScreenTitle(pathname);

  return (
    <header className="sticky top-0 z-30 hidden h-[4.5rem] items-center justify-between bg-background/85 px-8 backdrop-blur-md md:flex lg:px-10">
      <h1 className="font-display text-[1.75rem] tracking-tight text-foreground">{title}</h1>
      <div className="flex items-center gap-3">
        <Link href="/dashboard/settings/profile" aria-label="Profile photo" className="rounded-full">
          <AvatarCircle src={avatarUrl} name={displayName} size="sm" />
        </Link>
        <NotificationBell count={unreadCount} />
      </div>
    </header>
  );
}
