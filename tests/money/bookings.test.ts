import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  acceptRequestedBooking,
  approveDeliveredBooking,
  bookingLedgerEntries,
  markBookingDelivered,
  refundRequestedBooking,
  releaseExpiredBookingHolds,
} from "../../lib/bookings/escrow";
import type { Booking, DatabaseStore } from "../../lib/db/types";
import { BOOKING_HOLD_DAYS } from "../../lib/jobs/housekeeping";
import { applyWalletDelta } from "../../lib/wallet/ledger";

const brand = "11111111-1111-4111-8111-111111111111";
const influencer = "22222222-2222-4222-8222-222222222222";
const now = Date.parse("2026-10-17T12:00:00.000Z");
const day = 24 * 60 * 60 * 1000;
const holdCutoff = now - BOOKING_HOLD_DAYS * day;
const oldCreatedAt = new Date(now - (BOOKING_HOLD_DAYS + 1) * day).toISOString();
const youngCreatedAt = new Date(now - day).toISOString();

const heldId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function booking(partial: Partial<Booking> & Pick<Booking, "id">): Booking {
  return {
    brandId: brand,
    influencerId: influencer,
    influencerProfileId: "profile-1",
    rateCardItemId: "rate-1",
    amountCents: 5_000,
    brief: "One post",
    deliverableUrl: null,
    status: "requested",
    createdAt: oldCreatedAt,
    updatedAt: new Date(now).toISOString(),
    ...partial,
  };
}

function emptyStore(): DatabaseStore {
  return {
    profiles: [],
    campaigns: [],
    submissions: [],
    viewSnapshots: [],
    wallets: [
      { userId: brand, availableCents: 50_000, pendingCents: 0, updatedAt: new Date(now).toISOString() },
      { userId: influencer, availableCents: 0, pendingCents: 0, updatedAt: new Date(now).toISOString() },
    ],
    ledgerEntries: [],
    payoutMethods: [],
    withdrawalRequests: [],
    influencerProfiles: [],
    rateCards: [],
    bookings: [],
    brandDeposits: [],
    fraudFlags: [],
    notifications: [],
    notificationDispatches: [],
    linkedAccounts: [],
    socialAccounts: [],
    workspaces: [],
    workspaceMembers: [],
    savedCampaigns: [],
    supportTickets: [],
    supportMessages: [],
    auditLog: [],
    prizeAwards: [],
    platformSettings: [],
    ugcBriefs: [],
    ugcApplications: [],
    ugcDeliveries: [],
    contentLicenses: [],
    licenseDisputes: [],
    creatorPortfolios: [],
    businessListings: [],
    creatorReviews: [],
  };
}

/** Two open holds: the booking under test, plus another escrow that must stay put. */
function heldPair(): { db: DatabaseStore; held: Booking; other: Booking } {
  const db = emptyStore();
  const held = booking({ id: heldId });
  const other = booking({ id: otherId, createdAt: youngCreatedAt });
  db.bookings.push(held, other);
  for (const row of [held, other]) {
    applyWalletDelta(db, {
      userId: brand,
      availableDelta: -row.amountCents,
      pendingDelta: row.amountCents,
      type: "debit",
      reason: "Booking escrow",
      referenceType: "booking_escrow",
      referenceId: row.id,
    });
  }
  return { db, held, other };
}

function brandWallet(db: DatabaseStore) {
  const wallet = db.wallets.find((row) => row.userId === brand);
  assert.ok(wallet);
  return wallet;
}

function influencerWallet(db: DatabaseStore) {
  const wallet = db.wallets.find((row) => row.userId === influencer);
  assert.ok(wallet);
  return wallet;
}

function refundCount(db: DatabaseStore, bookingId: string) {
  return bookingLedgerEntries(db, bookingId, "booking_refund").length;
}

test("double decline of one booking refunds exactly once", () => {
  const { db, held, other } = heldPair();
  const first = refundRequestedBooking(db, held.id, "Booking declined. Escrow refunded", influencer);
  assert.equal(first.ok, true);
  const afterFirst = structuredClone(db);

  const second = refundRequestedBooking(db, held.id, "Booking declined. Escrow refunded", influencer);
  assert.deepEqual(second, { ok: false, reason: "already_handled" });
  assert.deepEqual(db, afterFirst);

  assert.equal(held.status, "cancelled");
  assert.equal(other.status, "requested");
  assert.equal(refundCount(db, held.id), 1);
  assert.equal(refundCount(db, other.id), 0);
  assert.equal(brandWallet(db).pendingCents, other.amountCents);
  assert.equal(brandWallet(db).availableCents, 50_000 - other.amountCents);
  assert.equal(influencerWallet(db).availableCents, 0);
  const refund = bookingLedgerEntries(db, held.id, "booking_refund")[0];
  assert.equal(refund?.amountCents, held.amountCents);
  assert.equal(refund?.balanceAfterPendingCents, brandWallet(db).pendingCents);
  assert.equal(refund?.balanceAfterAvailableCents, brandWallet(db).availableCents);
});

test("decline then accept and accept then decline end with one money movement", () => {
  const declinedFirst = heldPair();
  const declined = refundRequestedBooking(
    declinedFirst.db,
    declinedFirst.held.id,
    "Booking declined. Escrow refunded",
    influencer,
  );
  assert.equal(declined.ok, true);
  const afterDecline = structuredClone(declinedFirst.db);
  const acceptedLate = acceptRequestedBooking(declinedFirst.db, declinedFirst.held.id, influencer);
  assert.deepEqual(acceptedLate, { ok: false, reason: "already_handled" });
  assert.deepEqual(declinedFirst.db, afterDecline);
  assert.equal(declinedFirst.held.status, "cancelled");
  assert.equal(refundCount(declinedFirst.db, declinedFirst.held.id), 1);
  assert.equal(bookingLedgerEntries(declinedFirst.db, declinedFirst.held.id, "booking_release").length, 0);
  assert.equal(brandWallet(declinedFirst.db).pendingCents, declinedFirst.other.amountCents);
  assert.equal(brandWallet(declinedFirst.db).availableCents, 50_000 - declinedFirst.other.amountCents);

  const acceptedFirst = heldPair();
  const accepted = acceptRequestedBooking(acceptedFirst.db, acceptedFirst.held.id, influencer);
  assert.equal(accepted.ok, true);
  const afterAccept = structuredClone(acceptedFirst.db);
  const declinedLate = refundRequestedBooking(
    acceptedFirst.db,
    acceptedFirst.held.id,
    "Booking declined. Escrow refunded",
    influencer,
  );
  assert.deepEqual(declinedLate, { ok: false, reason: "already_handled" });
  assert.deepEqual(acceptedFirst.db, afterAccept);
  assert.equal(acceptedFirst.held.status, "accepted");
  assert.equal(refundCount(acceptedFirst.db, acceptedFirst.held.id), 0);
  assert.equal(brandWallet(acceptedFirst.db).pendingCents, 10_000);
  assert.equal(brandWallet(acceptedFirst.db).availableCents, 40_000);
  assert.equal(influencerWallet(acceptedFirst.db).availableCents, 0);
});

test("decline racing the expiry job refunds once", () => {
  const declineFirst = heldPair();
  const declined = refundRequestedBooking(
    declineFirst.db,
    declineFirst.held.id,
    "Booking declined. Escrow refunded",
    influencer,
  );
  assert.equal(declined.ok, true);
  const afterDecline = structuredClone(declineFirst.db);
  const releasedAfter = releaseExpiredBookingHolds(declineFirst.db, holdCutoff);
  assert.equal(releasedAfter, 0);
  assert.deepEqual(declineFirst.db, afterDecline);
  assert.equal(refundCount(declineFirst.db, declineFirst.held.id), 1);
  assert.equal(declineFirst.other.status, "requested");
  assert.equal(brandWallet(declineFirst.db).pendingCents, declineFirst.other.amountCents);

  const expiryFirst = heldPair();
  const released = releaseExpiredBookingHolds(expiryFirst.db, holdCutoff);
  assert.equal(released, 1);
  const afterExpiry = structuredClone(expiryFirst.db);
  const declinedAfter = refundRequestedBooking(
    expiryFirst.db,
    expiryFirst.held.id,
    "Booking declined. Escrow refunded",
    influencer,
  );
  assert.deepEqual(declinedAfter, { ok: false, reason: "already_handled" });
  assert.deepEqual(expiryFirst.db, afterExpiry);
  assert.equal(expiryFirst.held.status, "cancelled");
  assert.equal(expiryFirst.other.status, "requested");
  assert.equal(refundCount(expiryFirst.db, expiryFirst.held.id), 1);
  assert.equal(refundCount(expiryFirst.db, expiryFirst.other.id), 0);
  const refund = bookingLedgerEntries(expiryFirst.db, expiryFirst.held.id, "booking_refund")[0];
  assert.equal(refund?.reason, "Booking request expired. Escrow returned");
  assert.equal(brandWallet(expiryFirst.db).pendingCents, expiryFirst.other.amountCents);
  assert.equal(brandWallet(expiryFirst.db).availableCents, 50_000 - expiryFirst.other.amountCents);
});

test("a refund marker blocks another refund when status is forced back to requested", () => {
  const { db, held } = heldPair();
  assert.equal(refundRequestedBooking(db, held.id, "Booking declined. Escrow refunded", influencer).ok, true);
  held.status = "requested";
  const forced = structuredClone(db);
  const again = refundRequestedBooking(db, held.id, "Booking declined. Escrow refunded", influencer);
  assert.deepEqual(again, { ok: false, reason: "already_handled" });
  assert.deepEqual(db, forced);
  assert.equal(refundCount(db, held.id), 1);
});

test("approve after a refunded booking is refused", () => {
  const { db, held, other } = heldPair();
  assert.equal(refundRequestedBooking(db, held.id, "Booking declined. Escrow refunded", influencer).ok, true);
  const pendingAfterRefund = brandWallet(db).pendingCents;
  const availableAfterRefund = brandWallet(db).availableCents;

  const cancelled = approveDeliveredBooking(db, held.id, brand);
  assert.deepEqual(cancelled, { ok: false, reason: "refunded" });
  assert.equal(held.status, "cancelled");
  assert.equal(bookingLedgerEntries(db, held.id, "booking_release").length, 0);
  assert.equal(influencerWallet(db).availableCents, 0);
  assert.equal(brandWallet(db).pendingCents, pendingAfterRefund);
  assert.equal(brandWallet(db).availableCents, availableAfterRefund);

  // The old race left the booking acceptable, then deliverable, after the refund.
  held.status = "delivered";
  held.deliverableUrl = "https://example.com/clip";
  const exploited = structuredClone(db);
  const delivered = approveDeliveredBooking(db, held.id, brand);
  assert.deepEqual(delivered, { ok: false, reason: "refunded" });
  assert.deepEqual(db, exploited);
  assert.equal(bookingLedgerEntries(db, held.id, "booking_release").length, 0);
  assert.equal(influencerWallet(db).availableCents, 0);
  assert.equal(brandWallet(db).pendingCents, other.amountCents);
  assert.equal(other.status, "requested");
});

test("deliver and a second approve cannot move escrow twice", () => {
  const { db, held, other } = heldPair();
  assert.equal(acceptRequestedBooking(db, held.id, influencer).ok, true);
  const delivered = markBookingDelivered(db, held.id, influencer, "https://example.com/clip");
  assert.equal(delivered.ok, true);
  const secondDeliver = markBookingDelivered(db, held.id, influencer, "https://example.com/other");
  assert.deepEqual(secondDeliver, { ok: false, reason: "already_handled" });
  assert.equal(held.deliverableUrl, "https://example.com/clip");

  const approved = approveDeliveredBooking(db, held.id, brand);
  assert.equal(approved.ok, true);
  const afterPay = structuredClone(db);
  const again = approveDeliveredBooking(db, held.id, brand);
  assert.deepEqual(again, { ok: false, reason: "already_handled" });
  assert.deepEqual(db, afterPay);
  assert.equal(bookingLedgerEntries(db, held.id, "booking_release").length, 2);
  assert.equal(influencerWallet(db).availableCents, held.amountCents);
  assert.equal(brandWallet(db).pendingCents, other.amountCents);
  assert.equal(other.status, "requested");

  const refunded = heldPair();
  assert.equal(
    refundRequestedBooking(refunded.db, refunded.held.id, "Booking declined. Escrow refunded", influencer).ok,
    true,
  );
  const afterRefund = structuredClone(refunded.db);
  const lateDeliver = markBookingDelivered(
    refunded.db,
    refunded.held.id,
    influencer,
    "https://example.com/clip",
  );
  assert.deepEqual(lateDeliver, { ok: false, reason: "refunded" });
  assert.deepEqual(refunded.db, afterRefund);
});

test("a short pending balance does not cancel the booking or write a refund", () => {
  const db = emptyStore();
  const broke = booking({ id: heldId });
  db.bookings.push(broke);
  const untouched = structuredClone(db);
  const declined = refundRequestedBooking(db, broke.id, "Booking declined. Escrow refunded", influencer);
  assert.deepEqual(declined, { ok: false, reason: "insufficient_pending" });
  assert.deepEqual(db, untouched);
  assert.equal(releaseExpiredBookingHolds(db, holdCutoff), 0);
  assert.equal(broke.status, "requested");
  assert.equal(refundCount(db, broke.id), 0);
});

test("booking actions and housekeeping refund only through the guarded helper", () => {
  const actions = readFileSync(new URL("../../app/actions/bookings.ts", import.meta.url), "utf8");
  const job = readFileSync(new URL("../../lib/jobs/housekeeping.ts", import.meta.url), "utf8");
  assert.equal(actions.includes("booking_refund"), false);
  assert.equal(actions.includes("booking_release"), false);
  assert.equal(actions.includes('status !== "requested"'), false);
  assert.equal(job.includes("applyWalletDelta"), false);
  assert.equal(job.includes("booking_refund"), false);
  assert.match(actions, /refundRequestedBooking\(/);
  assert.match(actions, /acceptRequestedBooking\(/);
  assert.match(actions, /approveDeliveredBooking\(/);
  assert.match(actions, /markBookingDelivered\(/);
  assert.match(job, /releaseExpiredBookingHolds\(/);

  const respond = actions.slice(
    actions.indexOf("export async function respondBookingAction"),
    actions.indexOf("export async function deliverBookingAction"),
  );
  const updateAt = respond.indexOf("updateStore");
  assert.ok(updateAt !== -1);
  assert.ok(updateAt < respond.indexOf("refundRequestedBooking"));
  assert.ok(updateAt < respond.indexOf("acceptRequestedBooking"));
});
