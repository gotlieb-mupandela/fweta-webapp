import { readStore } from "@/lib/db/store";
import type { AppNotification } from "@/lib/db/types";

export async function listNotificationsForUser(userId: string): Promise<AppNotification[]> {
  const store = await readStore();
  return (store.notifications ?? [])
    .filter((row) => row.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const store = await readStore();
  return (store.notifications ?? []).filter((row) => row.userId === userId && !row.readAt).length;
}
