"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { nowIso, updateStore } from "@/lib/db/store";

function refreshInbox() {
  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard", "layout");
}

export async function markNotificationReadAction(id: string) {
  const session = await requireSession();
  await updateStore((store) => {
    const row = (store.notifications ?? []).find((item) => item.id === id && item.userId === session.id);
    if (!row || row.readAt) return;
    row.readAt = nowIso();
  });
  refreshInbox();
  return { ok: true as const };
}

export async function markAllNotificationsReadAction() {
  const session = await requireSession();
  const now = nowIso();
  await updateStore((store) => {
    for (const row of store.notifications ?? []) {
      if (row.userId === session.id && !row.readAt) row.readAt = now;
    }
  });
  refreshInbox();
}
