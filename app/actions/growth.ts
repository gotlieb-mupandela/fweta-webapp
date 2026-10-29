"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { newId, nowIso, updateStore, readStore } from "@/lib/db/store";
import type { SupportMessage, SupportTicket } from "@/lib/db/types";
import { saveKycDocument } from "@/lib/kyc/documents";
import { pushAudit } from "@/lib/marketplace/audit";
import {
  WEEKLY_PRIZES_CENTS,
  referralCodeFor,
  weeklyLeaderboard,
  weekKey,
} from "@/lib/marketplace/growth";
import { publicHandle } from "@/lib/rewards/content-rewards";
import { kycReviewSchema, platformFeeSchema, supportReplySchema, supportTicketSchema } from "@/lib/validations/growth";
import { applyWalletDelta } from "@/lib/wallet/ledger";

function revalidateGrowth() {
  revalidatePath("/dashboard/clipper/campaigns");
  revalidatePath("/dashboard/clipper/saved");
  revalidatePath("/dashboard/clipper/leaderboard");
  revalidatePath("/dashboard/support");
  revalidatePath("/dashboard/admin/support");
  revalidatePath("/dashboard/admin/fees");
  revalidatePath("/dashboard/admin/kyc");
  revalidatePath("/campaigns");
}

export async function toggleSavedCampaignAction(campaignId: string) {
  const session = await requireSession();
  let saved = false;
  await updateStore((store) => {
    if (!Array.isArray(store.savedCampaigns)) store.savedCampaigns = [];
    const index = store.savedCampaigns.findIndex(
      (item) => item.userId === session.id && item.campaignId === campaignId,
    );
    if (index >= 0) {
      store.savedCampaigns.splice(index, 1);
      saved = false;
      return;
    }
    store.savedCampaigns.push({
      id: newId(),
      userId: session.id,
      campaignId,
      createdAt: nowIso(),
    });
    saved = true;
  });
  revalidateGrowth();
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true as const, saved };
}

export async function createSupportTicketAction(raw: unknown) {
  const session = await requireSession();
  const parsed = supportTicketSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Check the ticket." };
  }
  const now = nowIso();
  const ticket: SupportTicket = {
    id: newId(),
    userId: session.id,
    subject: parsed.data.subject,
    status: "open",
    createdAt: now,
    updatedAt: now,
  };
  const message: SupportMessage = {
    id: newId(),
    ticketId: ticket.id,
    authorId: session.id,
    body: parsed.data.body,
    createdAt: now,
  };
  await updateStore((store) => {
    store.supportTickets.push(ticket);
    store.supportMessages.push(message);
  });
  revalidateGrowth();
  return { ok: true as const, id: ticket.id };
}

export async function replySupportTicketAction(ticketId: string, raw: unknown) {
  const session = await requireSession();
  const parsed = supportReplySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Write a reply." };
  }
  const admin = session.roles.includes("admin");
  try {
    await updateStore((store) => {
      const ticket = store.supportTickets.find((item) => item.id === ticketId);
      if (!ticket) throw new Error("Ticket not found.");
      if (!admin && ticket.userId !== session.id) throw new Error("Not allowed.");
      if (ticket.status === "closed") throw new Error("This ticket is closed.");
      const now = nowIso();
      store.supportMessages.push({
        id: newId(),
        ticketId,
        authorId: session.id,
        body: parsed.data.body,
        createdAt: now,
      });
      ticket.status = admin ? "answered" : "open";
      ticket.updatedAt = now;
      if (admin && ticket.userId !== session.id) {
        store.notifications.push({
          id: newId(),
          userId: ticket.userId,
          kind: "support_reply",
          title: "Support replied",
          body: ticket.subject,
          href: "/dashboard/support",
          readAt: null,
          createdAt: now,
        });
      }
    });
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not reply." };
  }
  revalidateGrowth();
  return { ok: true as const };
}

export async function closeSupportTicketAction(ticketId: string) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };
  await updateStore((store) => {
    const ticket = store.supportTickets.find((item) => item.id === ticketId);
    if (!ticket) return;
    ticket.status = "closed";
    ticket.updatedAt = nowIso();
    pushAudit(store, {
      actorId: session.id,
      action: "support.close",
      summary: `Closed ticket ${ticket.subject}`,
      targetType: "support_ticket",
      targetId: ticket.id,
    });
  });
  revalidateGrowth();
  return { ok: true as const };
}

export async function setPlatformFeeAction(raw: unknown) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };
  const parsed = platformFeeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Fee must be between 0% and 25%." };
  await updateStore((store) => {
    const now = nowIso();
    const row = store.platformSettings[0];
    if (row) {
      row.platformFeeBps = parsed.data.platformFeeBps;
      row.updatedAt = now;
      row.updatedBy = session.id;
    } else {
      store.platformSettings.push({
        id: "default",
        platformFeeBps: parsed.data.platformFeeBps,
        updatedAt: now,
        updatedBy: session.id,
      });
    }
    pushAudit(store, {
      actorId: session.id,
      action: "fee.update",
      summary: `Platform fee set to ${parsed.data.platformFeeBps / 100}% for new campaigns`,
      targetType: "platform_settings",
      targetId: "default",
    });
  });
  revalidateGrowth();
  return { ok: true as const };
}

export async function reviewKycAction(raw: unknown) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };
  const parsed = kycReviewSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Choose a decision." };
  if (parsed.data.status === "rejected" && (parsed.data.reviewNote ?? "").trim().length < 3) {
    return { ok: false as const, error: "Add a short reason when you reject an ID." };
  }
  try {
    await updateStore((store) => {
      const profile = store.profiles.find((item) => item.id === parsed.data.userId);
      if (!profile?.kyc) throw new Error("No identity on file.");
      const now = nowIso();
      profile.kyc.status = parsed.data.status;
      profile.kyc.reviewedAt = now;
      profile.kyc.reviewNote = parsed.data.reviewNote?.trim() || null;
      profile.updatedAt = now;
      store.notifications.push({
        id: newId(),
        userId: profile.id,
        kind: "kyc_reviewed",
        title: parsed.data.status === "verified" ? "Identity verified" : "Identity needs another photo",
        body:
          parsed.data.status === "verified"
            ? "You can request a payout from N$100."
            : profile.kyc.reviewNote || "Upload a clearer photo of your ID.",
        href: "/dashboard/settings/withdraw",
        readAt: null,
        createdAt: now,
      });
      pushAudit(store, {
        actorId: session.id,
        action: "kyc.review",
        summary: `${parsed.data.status === "verified" ? "Verified" : "Rejected"} identity for ${profile.displayName}`,
        targetType: "profile",
        targetId: profile.id,
      });
    });
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not review." };
  }
  revalidateGrowth();
  revalidatePath("/dashboard/settings/withdraw");
  return { ok: true as const };
}

export async function uploadKycDocumentAction(formData: FormData) {
  const session = await requireSession();
  const file = formData.get("idDocument");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, error: "Upload a photo of your ID." };
  }
  let documentPath: string;
  try {
    documentPath = await saveKycDocument(session.id, file);
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not store the photo." };
  }
  await updateStore((store) => {
    const profile = store.profiles.find((item) => item.id === session.id);
    if (!profile?.kyc) return;
    profile.kyc.documentPath = documentPath;
    profile.kyc.status = "pending";
    profile.kyc.reviewedAt = null;
    profile.updatedAt = nowIso();
  });
  revalidatePath("/dashboard/settings/withdraw");
  revalidatePath("/dashboard/admin/kyc");
  return { ok: true as const };
}

export async function awardWeeklyPrizesAction() {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };
  const key = weekKey();
  try {
    await updateStore((store) => {
      if (store.prizeAwards.some((item) => item.weekKey === key)) {
        throw new Error("Prizes for this week are already awarded.");
      }
      const ranked = weeklyLeaderboard(store, Date.now(), (userId) =>
        publicHandle(store.linkedAccounts, userId),
      ).filter((row) => row.prizeCents > 0);
      if (ranked.length === 0) throw new Error("No confirmed view checks this week.");
      const now = nowIso();
      ranked.forEach((row, index) => {
        const amount = WEEKLY_PRIZES_CENTS[index] ?? 0;
        if (amount <= 0) return;
        const id = newId();
        applyWalletDelta(store, {
          userId: row.userId,
          availableDelta: amount,
          type: "credit",
          reason: `Weekly leaderboard prize, place ${index + 1}`,
          referenceType: "prize_award",
          referenceId: id,
        });
        store.prizeAwards.push({
          id,
          weekKey: key,
          userId: row.userId,
          place: index + 1,
          amountCents: amount,
          createdAt: now,
        });
        store.notifications.push({
          id: newId(),
          userId: row.userId,
          kind: "prize_awarded",
          title: `Weekly prize, place ${index + 1}`,
          body: "The published prize is in your available balance.",
          href: "/dashboard/clipper/leaderboard",
          readAt: null,
          createdAt: now,
        });
      });
      pushAudit(store, {
        actorId: session.id,
        action: "prizes.award",
        summary: `Awarded weekly prizes for ${key}`,
        targetType: "prize_week",
        targetId: key,
      });
    });
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not award prizes." };
  }
  revalidateGrowth();
  revalidatePath("/dashboard/settings/wallet");
  return { ok: true as const };
}

export async function ensureReferralCodeAction() {
  const session = await requireSession();
  await updateStore((store) => {
    const profile = store.profiles.find((item) => item.id === session.id);
    if (!profile || profile.referralCode) return;
    profile.referralCode = referralCodeFor(profile.id);
    profile.updatedAt = nowIso();
  });
  const store = await readStore();
  const profile = store.profiles.find((item) => item.id === session.id);
  return profile?.referralCode ?? referralCodeFor(session.id);
}
