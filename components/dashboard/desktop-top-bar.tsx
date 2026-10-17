"use client";

import { usePathname } from "next/navigation";

import { NotificationBell } from "@/components/dashboard/notification-bell";
import { getScreenTitle } from "@/lib/dashboard/nav";

export function DesktopTopBar({ unreadCount }: { unreadCount: number }) {
  const pathname = usePathname();
  const title = getScreenTitle(pathname);

  return (
    <header className="sticky top-0 z-30 hidden h-16 items-center justify-between border-b border-border bg-white/90 px-8 backdrop-blur-md md:flex lg:px-10">
      <h1 className="font-display text-2xl tracking-tight text-foreground">{title}</h1>
      <NotificationBell count={unreadCount} />
    </header>
  );
}
