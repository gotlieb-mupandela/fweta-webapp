"use client";

import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { markNotificationReadAction } from "@/app/actions/notifications";
import { NOTIFICATION_LABEL } from "@/lib/notifications/labels";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/lib/db/types";

export function NotificationList({ items }: { items: AppNotification[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <ul className="space-y-2.5">
      {items.map((item) => {
        const unread = !item.readAt;
        const when = formatDistanceToNow(new Date(item.createdAt), { addSuffix: true });
        return (
          <li key={item.id}>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  if (unread) await markNotificationReadAction(item.id);
                  if (item.href) router.push(item.href);
                  router.refresh();
                });
              }}
              className={cn(
                "list-row w-full text-left",
                unread && "border-gold/40 bg-gold-soft/40",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-deep">
                    {NOTIFICATION_LABEL[item.kind]}
                  </span>
                  {unread ? (
                    <span className="size-1.5 rounded-full bg-gold" aria-hidden />
                  ) : null}
                  <span className="text-xs text-muted">{when}</span>
                </div>
                <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                <p className="mt-0.5 line-clamp-2 text-sm text-muted">{item.body}</p>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
