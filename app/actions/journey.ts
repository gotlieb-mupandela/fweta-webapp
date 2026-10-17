"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { nowIso, updateStore } from "@/lib/db/store";
import type { JourneyMomentId } from "@/lib/db/types";

const IDS: JourneyMomentId[] = [
  "first_campaign",
  "campaign_funded",
  "campaign_live",
  "first_submission",
  "first_review",
  "first_earning",
  "first_withdrawal",
  "admin_payin",
  "admin_view_check",
];

export async function dismissJourneyAction(id: JourneyMomentId) {
  const session = await requireSession();
  if (!IDS.includes(id)) return { ok: false as const, error: "Unknown step." };
  await updateStore((store) => {
    const profile = store.profiles.find((item) => item.id === session.id);
    if (!profile) return;
    const dismissed = profile.journey?.dismissed ?? [];
    if (!dismissed.includes(id)) {
      profile.journey = { dismissed: [...dismissed, id] };
    }
    profile.updatedAt = nowIso();
  });
  revalidatePath("/dashboard");
  return { ok: true as const };
}
