"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { nowIso, updateStore } from "@/lib/db/store";
import { parseEmailScope, verifyPrefsToken, type EmailScope } from "@/lib/email/preferences";
import { notificationPrefsSchema } from "@/lib/validations/auth";

async function applyPreferencePatch(
  userId: string,
  patch: Partial<{ notifyEmail: boolean; notifyWithdrawals: boolean; notifyBookings: boolean }>,
) {
  let found = false;
  await updateStore((store) => {
    const profile = store.profiles.find((item) => item.id === userId);
    if (!profile) return;
    found = true;
    Object.assign(profile, patch, { updatedAt: nowIso() });
  });
  revalidatePath("/dashboard/settings/notifications");
  return found;
}

export async function saveTokenPreferencesAction(formData: FormData) {
  const token = String(formData.get("token") || "");
  const userId = await verifyPrefsToken(token);
  if (!userId) redirect("/email/preferences?error=expired");

  const parsed = notificationPrefsSchema.safeParse({
    notifyEmail: formData.get("notifyEmail") === "on",
    notifyWithdrawals: formData.get("notifyWithdrawals") === "on",
    notifyBookings: formData.get("notifyBookings") === "on",
  });
  if (!parsed.success) redirect(`/email/preferences?token=${encodeURIComponent(token)}&error=invalid`);

  const found = await applyPreferencePatch(userId, parsed.data);
  if (!found) redirect("/email/preferences?error=missing");
  redirect(`/email/preferences?token=${encodeURIComponent(token)}&saved=1`);
}

export async function confirmUnsubscribeAction(formData: FormData) {
  const token = String(formData.get("token") || "");
  const scope = parseEmailScope(String(formData.get("scope") || ""));
  const userId = await verifyPrefsToken(token);
  if (!userId || !scope) redirect("/email/unsubscribe?error=expired");

  const patch =
    scope === "bookings"
      ? { notifyBookings: false }
      : scope === "withdrawals"
        ? { notifyWithdrawals: false }
        : { notifyEmail: false };
  const found = await applyPreferencePatch(userId, patch);
  if (!found) redirect("/email/unsubscribe?error=missing");
  redirect(`/email/unsubscribe?token=${encodeURIComponent(token)}&scope=${scope}&done=1`);
}

export async function unsubscribeByToken(token: string, scope: EmailScope) {
  const userId = await verifyPrefsToken(token);
  if (!userId) return { ok: false as const, error: "expired" };
  const patch =
    scope === "bookings"
      ? { notifyBookings: false }
      : scope === "withdrawals"
        ? { notifyWithdrawals: false }
        : { notifyEmail: false };
  const found = await applyPreferencePatch(userId, patch);
  if (!found) return { ok: false as const, error: "missing" };
  return { ok: true as const };
}
