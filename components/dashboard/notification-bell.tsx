import Link from "next/link";
import { Bell } from "lucide-react";

import { cn } from "@/lib/utils";

export function NotificationBell({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  const label = count > 0 ? `Notifications, ${count} unread` : "Notifications";
  return (
    <Link
      href="/dashboard/notifications"
      aria-label={label}
      className={cn(
        "tab-press relative flex size-11 items-center justify-center rounded-xl text-foreground active:bg-surface-2 md:size-10 md:hover:bg-surface-2",
        className,
      )}
    >
      <Bell className="size-5" strokeWidth={1.75} aria-hidden />
      {count > 0 ? (
        <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gold px-1 text-[10px] font-semibold leading-none text-foreground">
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </Link>
  );
}
