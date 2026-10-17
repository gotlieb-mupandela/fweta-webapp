import { redirect } from "next/navigation";

import { markAllNotificationsReadAction } from "@/app/actions/notifications";
import { NotificationList } from "@/components/notifications/notification-list";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { listNotificationsForUser } from "@/lib/notifications/queries";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const items = await listNotificationsForUser(session.id);
  const unread = items.filter((item) => !item.readAt).length;

  return (
    <div className="dash-stack">
      <PageHeader
        title="Notifications"
        description="Campaigns, bookings, payouts, and account updates. Email follows the switches in settings."
        action={
          unread > 0 ? (
            <form action={markAllNotificationsReadAction}>
              <Button type="submit" variant="secondary" size="sm">
                Mark all read
              </Button>
            </form>
          ) : null
        }
      />
      {items.length === 0 ? (
        <EmptyState
          title="Nothing yet"
          description="When a campaign goes live, a brand books you, or a payout moves, it will show up here."
        />
      ) : (
        <NotificationList items={items} />
      )}
    </div>
  );
}
