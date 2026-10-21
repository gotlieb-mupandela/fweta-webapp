"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { nowIso, readStore, updateStore } from "@/lib/db/store";

function newCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let body = "";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const byte of bytes) body += alphabet[byte % alphabet.length];
  return `FWETA-${body}`;
}

export async function requestVerificationCodeAction() {
  const session = await requireSession();
  if (!session.roles.includes("clipper") && !session.roles.includes("influencer")) {
    return { ok: false as const, error: "Creator role required." };
  }

  const store = await readStore();
  const existing = store.profiles.find((profile) => profile.id === session.id)?.verification;
  if (existing?.status === "verified") {
    return { ok: false as const, error: "This account is already verified." };
  }
  if (existing?.status === "pending") {
    return { ok: true as const, code: existing.code };
  }

  const code = newCode();
  await updateStore((s) => {
    const profile = s.profiles.find((item) => item.id === session.id);
    if (!profile) throw new Error("Profile not found.");
    profile.verification = {
      code,
      status: "pending",
      requestedAt: nowIso(),
      reviewedAt: null,
      reviewedBy: null,
    };
    profile.updatedAt = nowIso();
  });

  revalidatePath("/dashboard/settings/verification");
  revalidatePath("/dashboard/admin/verification");
  revalidatePath(`/dashboard/admin/users/${session.id}`);
  return { ok: true as const, code };
}

export async function reviewVerificationAction(userId: string, status: "verified" | "rejected") {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };

  try {
    await updateStore((s) => {
      const profile = s.profiles.find((item) => item.id === userId);
      if (!profile?.verification || profile.verification.status !== "pending") {
        throw new Error("No bio code is waiting for this account.");
      }
      profile.verification.status = status;
      profile.verification.reviewedAt = nowIso();
      profile.verification.reviewedBy = session.id;
      profile.updatedAt = nowIso();
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not update verification." };
  }

  revalidatePath("/dashboard/admin/verification");
  revalidatePath(`/dashboard/admin/users/${userId}`);
  revalidatePath("/dashboard/settings/verification");
  return { ok: true as const };
}
