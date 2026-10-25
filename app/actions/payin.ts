"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { newId, nowIso, updateStore } from "@/lib/db/store";
import { payInRequestSchema } from "@/lib/validations/accounts";
import { pushAudit } from "@/lib/marketplace/audit";
import { confirmPendingPayIn } from "@/lib/wallet/brand-deposit";

function revalidatePayins() {
  revalidatePath("/dashboard/brand/deposits");
  revalidatePath("/dashboard/brand");
  revalidatePath("/dashboard/admin/payins");
  revalidatePath("/dashboard/admin");
}

export async function requestPayInAction(amountCents: number, note?: string) {
  const session = await requireSession();
  if (!session.roles.includes("brand")) return { ok: false as const, error: "Brand role required." };
  const parsed = payInRequestSchema.safeParse({ amountCents, note });
  if (!parsed.success) return { ok: false as const, error: "Enter a valid amount." };

  const id = newId();
  await updateStore((store) => {
    store.brandDeposits.push({
      id,
      brandId: session.id,
      amountCents: parsed.data.amountCents,
      note: parsed.data.note || "Manual EFT pay-in",
      status: "pending",
      bankReference: null,
      createdAt: nowIso(),
      confirmedAt: null,
      confirmedBy: null,
    });
  });
  revalidatePayins();
  return { ok: true as const, id };
}

export async function confirmPayInAction(depositId: string) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };

  try {
    await updateStore((store) => {
      const deposit = confirmPendingPayIn(store, {
        depositId,
        actorId: session.id,
        actorRoles: session.roles,
        now: nowIso(),
        reason: "Brand pay-in confirmed",
      });
      pushAudit(store, {
        actorId: session.id,
        action: "payin.confirm",
        summary: "Confirmed a brand pay-in",
        targetType: "brand_deposit",
        targetId: deposit.id,
      });
    });
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Could not confirm the pay-in." };
  }

  revalidatePayins();
  return { ok: true as const };
}
