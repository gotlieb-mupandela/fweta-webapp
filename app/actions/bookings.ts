"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { newId, nowIso, readStore, updateStore } from "@/lib/db/store";
import {
  notifyBookingAccepted,
  notifyBookingCompleted,
  notifyBookingDeclined,
  notifyBookingRequested,
} from "@/lib/notifications/events";
import {
  acceptRequestedBooking,
  approveDeliveredBooking,
  markBookingDelivered,
  refundRequestedBooking,
  type BookingTransition,
} from "@/lib/bookings/escrow";
import type { Booking } from "@/lib/db/types";
import { applyWalletDelta } from "@/lib/wallet/ledger";
import { bookingSchema } from "@/lib/validations/booking";

function transitionError(outcome: BookingTransition): string {
  if (outcome.ok) return "Failed.";
  if (outcome.reason === "not_found") return "Not found.";
  if (outcome.reason === "waiting") return "Waiting for delivery.";
  if (outcome.reason === "insufficient_pending") return "Insufficient pending balance.";
  return "Already handled.";
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
  await notifyBookingRequested(booking.id);
  return { ok: true as const, id: booking.id };
}

export async function respondBookingAction(id: string, accept: boolean) {
  const session = await requireSession();
  let outcome: BookingTransition = { ok: false, reason: "not_found" };

  try {
    await updateStore((s) => {
      outcome = accept
        ? acceptRequestedBooking(s, id, session.id)
        : refundRequestedBooking(s, id, "Booking declined. Escrow refunded", session.id);
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed." };
  }

  if (!outcome.ok) {
    return { ok: false as const, error: transitionError(outcome) };
  }

  revalidatePath("/dashboard/influencer/bookings");
  revalidatePath("/dashboard/brand/bookings");
  if (accept) await notifyBookingAccepted(id);
  else await notifyBookingDeclined(id);
  return { ok: true as const };
}

export async function deliverBookingAction(id: string, deliverableUrl: string) {
  const session = await requireSession();
  try {
    new URL(deliverableUrl);
  } catch {
    return { ok: false as const, error: "Valid URL required." };
  }
  let outcome: BookingTransition = { ok: false, reason: "not_found" };
  await updateStore((s) => {
    outcome = markBookingDelivered(s, id, session.id, deliverableUrl);
  });
  if (!outcome.ok) {
    return { ok: false as const, error: transitionError(outcome) };
  }
  revalidatePath("/dashboard/influencer/bookings");
  revalidatePath("/dashboard/brand/bookings");
  return { ok: true as const };
}

export async function approveBookingAction(id: string) {
  const session = await requireSession();
  let outcome: BookingTransition = { ok: false, reason: "not_found" };

  // Release, creator credit, and approved status share one write.
  // A refund marker or a release marker blocks a second payment.
  try {
    await updateStore((s) => {
      outcome = approveDeliveredBooking(s, id, session.id);
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed." };
  }

  if (!outcome.ok) {
    return { ok: false as const, error: transitionError(outcome) };
  }

  revalidatePath("/dashboard/brand/bookings");
  revalidatePath("/dashboard/influencer/bookings");
  await notifyBookingCompleted(id);
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
