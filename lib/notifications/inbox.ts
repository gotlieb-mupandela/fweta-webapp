import { newId, nowIso } from "@/lib/db/store";
import type { AppNotification, DatabaseStore } from "@/lib/db/types";

const MAX_PER_USER = 120;

export function ensureInbox(store: DatabaseStore) {
  if (!Array.isArray(store.notifications)) store.notifications = [];
  if (!Array.isArray(store.notificationDispatches)) store.notificationDispatches = [];
}

export function alreadyDispatched(store: DatabaseStore, dedupeKey: string): boolean {
  ensureInbox(store);
  return store.notificationDispatches.some((row) => row.dedupeKey === dedupeKey);
}

/** Returns false when this key was already claimed. */
export function claimDispatch(store: DatabaseStore, dedupeKey: string): boolean {
  ensureInbox(store);
  if (store.notificationDispatches.some((row) => row.dedupeKey === dedupeKey)) return false;
  store.notificationDispatches.push({
    id: newId(),
    dedupeKey,
    createdAt: nowIso(),
  });
  return true;
}

export function pushNotification(store: DatabaseStore, notification: AppNotification) {
  ensureInbox(store);
  store.notifications.push(notification);
  const mine = store.notifications.filter((row) => row.userId === notification.userId);
  if (mine.length <= MAX_PER_USER) return;
  mine.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const drop = new Set(mine.slice(0, mine.length - MAX_PER_USER).map((row) => row.id));
  store.notifications = store.notifications.filter((row) => !drop.has(row.id));
}
