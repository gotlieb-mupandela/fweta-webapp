"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { refundUndeliveredBooking } from "@/lib/bookings/refund";
import { newId, nowIso, readStore, updateStore } from "@/lib/db/store";
import { pushAudit } from "@/lib/marketplace/audit";
import {
  notifyBookingAccepted,
  notifyBookingCompleted,
  notifyBookingDeclined,
  notifyBookingRequested,
} from "@/lib/notifications/events";
import type { Booking } from "@/lib/db/types";
import { applyWalletDelta } from "@/lib/wallet/ledger";
import { bookingSchema, privateDealSchema } from "@/lib/validations/booking";
import { formatMoney } from "@/lib/utils";
import { findDealCreator, searchDealCreators, type DealCreator } from "@/lib/public/creators";

function escrowError(e: unknown, amountCents: number) {
  if (e instanceof Error && !e.message.startsWith("Insufficient available")) return e.message;
  return `Insufficient wallet balance. You need ${formatMoney(amountCents)} available. Record a deposit and wait for an admin to credit it.`;
}

/**
 * Booking decision: request/accept (not instant book).
 * Brand funds escrow (pending) on request; released on brand approval.
 */
export async function requestBookingAction(raw: unknown) {
  const session = await requireSession();
  if (!session.roles.includes("brand")) {
    return { ok: false as const, error: "Brand role required." };
  }
  const parsed = bookingSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid booking.",
    };
  }

  const store = await readStore();
  const profile = store.influencerProfiles.find(
    (p) => p.id === parsed.data.influencerProfileId && p.published,
  );
  if (!profile) return { ok: false as const, error: "Influencer not found." };
  const rate = store.rateCards.find(
    (r) =>
      r.id === parsed.data.rateCardItemId &&
      r.influencerProfileId === profile.id &&
      r.active,
  );
  if (!rate) return { ok: false as const, error: "Rate card not available." };

  const booking: Booking = {
    id: newId(),
    brandId: session.id,
    influencerId: profile.userId,
    influencerProfileId: profile.id,
    rateCardItemId: rate.id,
    kind: "public",
    amountCents: rate.priceCents,
    brief: parsed.data.brief,
    deliverableUrl: null,
    status: "requested",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  // Atomic: escrow move + booking record in one write (no orphan escrow).
  try {
    await updateStore((s) => {
      applyWalletDelta(s, {
        userId: session.id,
        availableDelta: -rate.priceCents,
        pendingDelta: rate.priceCents,
        type: "debit",
        reason: `Booking escrow · ${rate.title}`,
        referenceType: "booking_escrow",
        referenceId: booking.id,
      });
      s.bookings.push(booking);
    });
  } catch (e) {
    return {
      ok: false as const,
      error: escrowError(e, rate.priceCents),
    };
  }

  revalidatePath("/dashboard/brand/bookings");
  revalidatePath("/dashboard/influencer/bookings");
  await notifyBookingRequested(booking.id);
  return { ok: true as const, id: booking.id };
}

export async function requestPrivateDealAction(raw: unknown) {
  const session = await requireSession();
  if (!session.roles.includes("brand")) {
    return { ok: false as const, error: "Brand role required." };
  }
  const parsed = privateDealSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Check the offer amount and brief.",
    };
  }

  const store = await readStore();
  const profile = store.influencerProfiles.find((p) => p.id === parsed.data.influencerProfileId);
  if (!profile) return { ok: false as const, error: "Influencer not found." };
  if (profile.userId === session.id) {
    return { ok: false as const, error: "You cannot send a private offer to yourself." };
  }

  const booking: Booking = {
    id: newId(),
    brandId: session.id,
    influencerId: profile.userId,
    influencerProfileId: profile.id,
    rateCardItemId: null,
    kind: "private",
    amountCents: parsed.data.amountCents,
    brief: parsed.data.brief,
    deliverableUrl: null,
    status: "requested",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  try {
    await updateStore((s) => {
      applyWalletDelta(s, {
        userId: session.id,
        availableDelta: -parsed.data.amountCents,
        pendingDelta: parsed.data.amountCents,
        type: "debit",
        reason: `Private offer escrow · ${profile.displayName}`,
        referenceType: "booking_escrow",
        referenceId: booking.id,
      });
      s.bookings.push(booking);
    });
  } catch (e) {
    return {
      ok: false as const,
      error: escrowError(e, parsed.data.amountCents),
    };
  }

  revalidatePath("/dashboard/brand/bookings");
  revalidatePath("/dashboard/brand/deals/new");
  revalidatePath("/dashboard/influencer/bookings");
  return { ok: true as const, id: booking.id };
}

export async function searchInfluencersForDeal(q?: string): Promise<DealCreator[]> {
  const session = await requireSession();
  if (!session.roles.includes("brand") && !session.roles.includes("admin")) return [];
  const store = await readStore();
  const query = typeof q === "string" ? q.slice(0, 100) : undefined;
  return searchDealCreators(store.influencerProfiles, store.profiles, session.id, query);
}

export async function getInfluencerForDeal(id: string): Promise<DealCreator | null> {
  const session = await requireSession();
  if (!session.roles.includes("brand") && !session.roles.includes("admin")) return null;
  const store = await readStore();
  return findDealCreator(store.influencerProfiles, store.profiles, session.id, id);
}

export async function respondBookingAction(id: string, accept: boolean) {
  const session = await requireSession();
  const store = await readStore();
  const booking = store.bookings.find((b) => b.id === id);
  if (!booking || booking.influencerId !== session.id) {
    return { ok: false as const, error: "Not found." };
  }
  if (booking.status !== "requested") {
    return { ok: false as const, error: "Already handled." };
  }

  if (!accept) {
    try {
      await updateStore((s) => {
        applyWalletDelta(s, {
          userId: booking.brandId,
          availableDelta: booking.amountCents,
          pendingDelta: -booking.amountCents,
          type: "credit",
          reason: "Booking declined. Escrow refunded",
          referenceType: "booking_refund",
          referenceId: booking.id,
        });
        const b = s.bookings.find((x) => x.id === id);
        if (!b) throw new Error("Booking not found.");
        b.status = "cancelled";
        b.updatedAt = nowIso();
      });
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Failed." };
    }
  } else {
    await updateStore((s) => {
      const b = s.bookings.find((x) => x.id === id);
      if (!b) return;
      b.status = "accepted";
      b.updatedAt = nowIso();
    });
  }

  revalidatePath("/dashboard/influencer/bookings");
  revalidatePath("/dashboard/brand/bookings");
  if (accept) await notifyBookingAccepted(id);
  else await notifyBookingDeclined(id);
  return { ok: true as const };
}

export async function cancelBookingAction(id: string) {
  const session = await requireSession();
  try {
    await updateStore((s) => {
      const b = s.bookings.find((x) => x.id === id);
      if (!b || b.brandId !== session.id) throw new Error("Not found.");
      if (b.status !== "requested") {
        throw new Error("The influencer already responded, so this can no longer be withdrawn.");
      }
      applyWalletDelta(s, {
        userId: b.brandId,
        availableDelta: b.amountCents,
        pendingDelta: -b.amountCents,
        type: "credit",
        reason: "Booking withdrawn, escrow refunded",
        referenceType: "booking_refund",
        referenceId: b.id,
      });
      b.status = "cancelled";
      b.updatedAt = nowIso();
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed." };
  }

  revalidatePath("/dashboard/brand/bookings");
  revalidatePath("/dashboard/influencer/bookings");
  revalidatePath("/dashboard/brand");
  return { ok: true as const };
}

export async function deliverBookingAction(id: string, deliverableUrl: string) {
  const session = await requireSession();
  try {
    new URL(deliverableUrl);
  } catch {
    return { ok: false as const, error: "Valid URL required." };
  }
  await updateStore((s) => {
    const b = s.bookings.find((x) => x.id === id && x.influencerId === session.id);
    if (!b || (b.status !== "accepted" && b.status !== "in_progress")) return;
    b.deliverableUrl = deliverableUrl;
    b.revisionNote = null;
    b.status = "delivered";
    b.updatedAt = nowIso();
  });
  revalidatePath("/dashboard/influencer/bookings");
  revalidatePath("/dashboard/brand/bookings");
  revalidatePath("/dashboard/brand");
  return { ok: true as const };
}

export async function requestBookingChangesAction(id: string, note: string) {
  const session = await requireSession();
  const trimmed = note.trim();
  if (trimmed.length < 5 || trimmed.length > 2000) {
    return { ok: false as const, error: "Tell the influencer what to change (5–2000 characters)." };
  }
  try {
    await updateStore((s) => {
      const b = s.bookings.find((x) => x.id === id);
      if (!b || b.brandId !== session.id) throw new Error("Not found.");
      if (b.status !== "delivered") throw new Error("Only a delivered booking can be sent back.");
      b.revisionNote = trimmed;
      b.status = "in_progress";
      b.updatedAt = nowIso();
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed." };
  }
  revalidatePath("/dashboard/brand/bookings");
  revalidatePath("/dashboard/influencer/bookings");
  revalidatePath("/dashboard/brand");
  return { ok: true as const };
}

export async function approveBookingAction(id: string) {
  const session = await requireSession();
  const store = await readStore();
  const booking = store.bookings.find((b) => b.id === id);
  if (!booking || booking.brandId !== session.id) {
    return { ok: false as const, error: "Not found." };
  }
  if (booking.status !== "delivered") {
    return { ok: false as const, error: "Waiting for delivery." };
  }

  // Atomic: release brand escrow + credit influencer + mark approved.
  // Previously three separate writes, a crash mid-way left money half-moved.
  try {
    await updateStore((s) => {
      const b = s.bookings.find((x) => x.id === id);
      if (!b || b.status !== "delivered") throw new Error("Waiting for delivery.");
      applyWalletDelta(s, {
        userId: b.brandId,
        availableDelta: 0,
        pendingDelta: -b.amountCents,
        type: "debit",
        reason: "Booking approved. Escrow released",
        referenceType: "booking_release",
        referenceId: b.id,
      });
      applyWalletDelta(s, {
        userId: b.influencerId,
        availableDelta: b.amountCents,
        type: "credit",
        reason: "Booking payment received",
        referenceType: "booking_release",
        referenceId: b.id,
      });
      b.status = "approved";
      b.updatedAt = nowIso();
    });
  } catch (e) {
    // Preserve the "not found / waiting" UX for stale reads.
    const fresh = (await readStore()).bookings.find((x) => x.id === id);
    if (!fresh || fresh.brandId !== session.id)
      return { ok: false as const, error: "Not found." };
    if (fresh.status !== "delivered" && !(e instanceof Error && e.message.includes("balance")))
      return { ok: false as const, error: "Waiting for delivery." };
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed." };
  }

  revalidatePath("/dashboard/brand/bookings");
  revalidatePath("/dashboard/influencer/bookings");
  await notifyBookingCompleted(id);
  return { ok: true as const };
}

export async function adminRefundBookingAction(id: string) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };
  try {
    await updateStore((s) => {
      const refunded = refundUndeliveredBooking(s, id);
      if (!refunded) throw new Error("Only an accepted booking with no delivery can be refunded.");
      pushAudit(s, {
        actorId: session.id,
        action: "booking.refund",
        summary: "Refunded an accepted booking with no delivery",
        targetType: "booking",
        targetId: id,
      });
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not refund the booking." };
  }
  revalidatePath("/dashboard/admin/bookings");
  revalidatePath("/dashboard/brand/bookings");
  revalidatePath("/dashboard/influencer/bookings");
  revalidatePath("/dashboard/brand");
  return { ok: true as const };
}

export async function listBrandBookings() {
  const session = await requireSession();
  const store = await readStore();
  return store.bookings
    .filter((b) => b.brandId === session.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listInfluencerBookings() {
  const session = await requireSession();
  const store = await readStore();
  return store.bookings
    .filter((b) => b.influencerId === session.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
