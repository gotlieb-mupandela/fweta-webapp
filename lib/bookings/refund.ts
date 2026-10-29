import { nowIso } from "@/lib/db/store";
import type { DatabaseStore } from "@/lib/db/types";
import { applyWalletDelta } from "@/lib/wallet/ledger";

/** Return escrow for an accepted booking that has no delivery. Returns false when it does not apply. */
export function refundUndeliveredBooking(store: DatabaseStore, bookingId: string, at = nowIso()): boolean {
  const booking = store.bookings.find((item) => item.id === bookingId);
  if (!booking || booking.status !== "accepted" || booking.deliverableUrl) return false;
  const wallet = store.wallets.find((row) => row.userId === booking.brandId);
  if (!wallet || wallet.pendingCents < booking.amountCents) return false;
  applyWalletDelta(store, {
    userId: booking.brandId,
    availableDelta: booking.amountCents,
    pendingDelta: -booking.amountCents,
    type: "credit",
    reason: "Accepted booking refunded. No delivery",
    referenceType: "booking_refund",
    referenceId: booking.id,
  });
  booking.status = "cancelled";
  booking.updatedAt = at;
  return true;
}
