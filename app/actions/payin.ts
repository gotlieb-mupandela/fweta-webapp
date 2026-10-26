"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { newId, nowIso, updateStore } from "@/lib/db/store";
import { payInRequestSchema } from "@/lib/validations/accounts";
import { pushAudit } from "@/lib/marketplace/audit";
import { confirmPendingPayIn, fileManualPayIn } from "@/lib/wallet/brand-deposit";

function revalidatePayins() {
  revalidatePath("/dashboard/brand/deposits");
  revalidatePath("/dashboard/brand");
  revalidatePath("/dashboard/admin/payins");
  revalidatePath("/dashboard/admin");
}

export async function requestPayInAction(amountCents: number, note?: string, bankReference?: string) {
  const session = await requireSession();
  if (!session.roles.includes("brand")) return { ok: false as const, error: "Brand role required." };
  const parsed = payInRequestSchema.safeParse({ amountCents, note, bankReference });
  if (!parsed.success) {
    const referenceIssue = parsed.error.issues.find((issue) => issue.path[0] === "bankReference");
    if (referenceIssue) return { ok: false as const, error: referenceIssue.message };
    return { ok: false as const, error: "Enter a valid amount." };
  }

  const id = newId();
  try {
    await updateStore((store) => {
      const filed = fileManualPayIn(store, {
        id,
        brandId: session.id,
        amountCents: parsed.data.amountCents,
        note: parsed.data.note || "Manual EFT pay-in",
        bankReference: parsed.data.bankReference,
        createdAt: nowIso(),
      });
      if (!filed.ok) throw new Error(filed.error);
    });
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Could not save the pay-in." };
  }
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
