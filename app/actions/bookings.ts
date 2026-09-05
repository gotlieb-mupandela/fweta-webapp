"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { newId, nowIso, readStore, updateStore } from "@/lib/db/store";
import type { Booking } from "@/lib/db/types";
import { applyWalletDelta } from "@/lib/wallet/ledger";
import { bookingSchema } from "@/lib/validations/booking";

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
  if (!parsed.success) return { ok: false as const, error: "Invalid booking." };

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
      error: e instanceof Error ? e.message : "Insufficient brand wallet balance. Deposit first.",
    };
  }

  revalidatePath("/dashboard/brand/bookings");
  revalidatePath("/dashboard/influencer/bookings");
  return { ok: true as const, id: booking.id };
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
          reason: "Booking declined — escrow refunded",
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
    b.status = "delivered";
    b.updatedAt = nowIso();
  });
  revalidatePath("/dashboard/influencer/bookings");
  revalidatePath("/dashboard/brand/bookings");
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
  // Previously three separate writes — a crash mid-way left money half-moved.
  try {
    await updateStore((s) => {
      const b = s.bookings.find((x) => x.id === id);
      if (!b || b.status !== "delivered") throw new Error("Waiting for delivery.");
      applyWalletDelta(s, {
        userId: b.brandId,
        availableDelta: 0,
        pendingDelta: -b.amountCents,
        type: "debit",
        reason: "Booking approved — escrow released",
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
