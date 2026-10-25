import { nowIso } from "@/lib/db/store";
import type { DatabaseStore, LedgerEntry } from "@/lib/db/types";
import { applyWalletDelta } from "@/lib/wallet/ledger";

/**
 * Booking escrow transitions.
 * The brand's fee sits in pending from the request until decline, expiry,
 * or approval. Those transitions re-read status on the store write itself.
 * A booking_refund ledger row is the refund marker: one refund per booking id.
 */

export type BookingTransition =
  | { ok: true }
  | {
      ok: false;
      reason: "not_found" | "already_handled" | "insufficient_pending" | "refunded" | "waiting";
    };

export function bookingLedgerEntries(
  store: DatabaseStore,
  bookingId: string,
  referenceType: LedgerEntry["referenceType"],
): LedgerEntry[] {
  return store.ledgerEntries.filter(
    (entry) => entry.referenceType === referenceType && entry.referenceId === bookingId,
  );
}

function fail(
  reason: "not_found" | "already_handled" | "insufficient_pending" | "refunded" | "waiting",
): BookingTransition {
  return { ok: false, reason };
}

/**
 * Refund a booking that is still requested.
 * `actorId` is the influencer when a person declines. The expiry job omits it.
 * A failed guard leaves the store untouched.
 */
export function refundRequestedBooking(
  store: DatabaseStore,
  bookingId: string,
  reason: string,
  actorId?: string,
): BookingTransition {
  const booking = store.bookings.find((row) => row.id === bookingId);
  if (!booking) return fail("not_found");
  if (actorId !== undefined && booking.influencerId !== actorId) return fail("not_found");
  // Both checks run on this draft. An earlier readStore() can be stale.
  if (booking.status !== "requested") return fail("already_handled");
  if (bookingLedgerEntries(store, booking.id, "booking_refund").length > 0) {
    return fail("already_handled");
  }

  const wallet = store.wallets.find((row) => row.userId === booking.brandId);
  if (!wallet || wallet.pendingCents < booking.amountCents) return fail("insufficient_pending");

  applyWalletDelta(store, {
    userId: booking.brandId,
    availableDelta: booking.amountCents,
    pendingDelta: -booking.amountCents,
    type: "credit",
    reason,
    referenceType: "booking_refund",
    referenceId: booking.id,
  });
  booking.status = "cancelled";
  booking.updatedAt = nowIso();
  return { ok: true };
}

/** Accept only while the request is still open and the escrow has not been refunded. */
export function acceptRequestedBooking(
  store: DatabaseStore,
  bookingId: string,
  actorId: string,
): BookingTransition {
  const booking = store.bookings.find((row) => row.id === bookingId);
  if (!booking || booking.influencerId !== actorId) return fail("not_found");
  if (booking.status !== "requested") return fail("already_handled");
  if (bookingLedgerEntries(store, booking.id, "booking_refund").length > 0) {
    return fail("already_handled");
  }
  booking.status = "accepted";
  booking.updatedAt = nowIso();
  return { ok: true };
}

/** Daily housekeeping: return escrow for requested bookings older than the cutoff. */
export function releaseExpiredBookingHolds(store: DatabaseStore, holdCutoffMs: number): number {
  let released = 0;
  for (const booking of store.bookings) {
    if (booking.status !== "requested") continue;
    const created = Date.parse(booking.createdAt);
    if (!Number.isFinite(created) || created > holdCutoffMs) continue;
    const outcome = refundRequestedBooking(
      store,
      booking.id,
      "Booking request expired. Escrow returned",
    );
    if (outcome.ok) released += 1;
  }
  return released;
}

export function markBookingDelivered(
  store: DatabaseStore,
  bookingId: string,
  actorId: string,
  deliverableUrl: string,
): BookingTransition {
  const booking = store.bookings.find((row) => row.id === bookingId);
  if (!booking || booking.influencerId !== actorId) return fail("not_found");
  if (bookingLedgerEntries(store, booking.id, "booking_refund").length > 0) return fail("refunded");
  if (booking.status !== "accepted" && booking.status !== "in_progress") return fail("already_handled");
  booking.deliverableUrl = deliverableUrl;
  booking.status = "delivered";
  booking.updatedAt = nowIso();
  return { ok: true };
}

/**
 * Pay the influencer from this booking's pending escrow.
 * A refund marker or an existing release blocks the payment, including when
 * status was moved back to delivered after the money was already returned.
 */
export function approveDeliveredBooking(
  store: DatabaseStore,
  bookingId: string,
  actorId: string,
): BookingTransition {
  const booking = store.bookings.find((row) => row.id === bookingId);
  if (!booking || booking.brandId !== actorId) return fail("not_found");
  if (bookingLedgerEntries(store, booking.id, "booking_refund").length > 0) return fail("refunded");
  if (bookingLedgerEntries(store, booking.id, "booking_release").length > 0) {
    return fail("already_handled");
  }
  if (booking.status !== "delivered") return fail("waiting");

  const wallet = store.wallets.find((row) => row.userId === booking.brandId);
  if (!wallet || wallet.pendingCents < booking.amountCents) return fail("insufficient_pending");

  applyWalletDelta(store, {
    userId: booking.brandId,
    availableDelta: 0,
    pendingDelta: -booking.amountCents,
    type: "debit",
    reason: "Booking approved. Escrow released",
    referenceType: "booking_release",
    referenceId: booking.id,
  });
  applyWalletDelta(store, {
    userId: booking.influencerId,
    availableDelta: booking.amountCents,
    type: "credit",
    reason: "Booking payment received",
    referenceType: "booking_release",
    referenceId: booking.id,
  });
  booking.status = "approved";
  booking.updatedAt = nowIso();
  return { ok: true };
}
