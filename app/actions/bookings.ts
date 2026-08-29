"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  mapBooking,
  mapInfluencerProfile,
  mapRateCard,
  type BookingRow,
  type InfluencerProfileRow,
  type RateCardRow,
} from "@/lib/db/mappers";
import { adjustWallet } from "@/lib/wallet/ledger";
import { bookingSchema } from "@/lib/validations/booking";

export async function requestBookingAction(raw: unknown) {
  const session = await requireSession();
  if (!session.roles.includes("brand")) {
    return { ok: false as const, error: "Brand role required." };
  }
  const parsed = bookingSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Invalid booking." };

  const supabase = await createClient();
  const { data: profileRow } = await supabase
    .from("influencer_profiles")
    .select("*")
    .eq("id", parsed.data.influencerProfileId)
    .eq("published", true)
    .maybeSingle();
  if (!profileRow) return { ok: false as const, error: "Influencer not found." };
  const profile = mapInfluencerProfile(profileRow as InfluencerProfileRow);
  const { data: rateRow } = await supabase
    .from("rate_cards")
    .select("*")
    .eq("id", parsed.data.rateCardItemId)
    .eq("influencer_profile_id", profile.id)
    .eq("active", true)
    .maybeSingle();
  if (!rateRow) return { ok: false as const, error: "Rate card not available." };
  const rate = mapRateCard(rateRow as RateCardRow);

  const { data: bookingRow, error: insertError } = await supabase
    .from("bookings")
    .insert({
      brand_id: session.id,
      influencer_id: profile.userId,
      influencer_profile_id: profile.id,
      rate_card_item_id: rate.id,
      amount_cents: rate.priceCents,
      brief: parsed.data.brief,
      status: "requested",
    })
    .select("*")
    .single();
  if (insertError || !bookingRow) {
    return { ok: false as const, error: insertError?.message ?? "Failed to request." };
  }
  const booking = mapBooking(bookingRow as BookingRow);

  try {
    await adjustWallet({
      userId: session.id,
      availableDelta: -rate.priceCents,
      pendingDelta: rate.priceCents,
      type: "debit",
      reason: `Booking escrow · ${rate.title}`,
      referenceType: "booking_escrow",
      referenceId: booking.id,
    });
  } catch (e) {
    await supabase.from("bookings").delete().eq("id", booking.id);
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
  const supabase = await createClient();
  const { data: row } = await supabase.from("bookings").select("*").eq("id", id).maybeSingle();
  if (!row) return { ok: false as const, error: "Not found." };
  const booking = mapBooking(row as BookingRow);
  if (booking.influencerId !== session.id) {
    return { ok: false as const, error: "Not found." };
  }
  if (booking.status !== "requested") {
    return { ok: false as const, error: "Already handled." };
  }

  if (!accept) {
    await adjustWallet({
      userId: booking.brandId,
      availableDelta: booking.amountCents,
      pendingDelta: -booking.amountCents,
      type: "credit",
      reason: "Booking declined — escrow refunded",
      referenceType: "booking_refund",
      referenceId: booking.id,
    });
  }

  const { error } = await supabase
    .from("bookings")
    .update({ status: accept ? "accepted" : "cancelled" })
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };

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
  const supabase = await createClient();
  const { error } = await supabase
    .from("bookings")
    .update({ deliverable_url: deliverableUrl, status: "delivered" })
    .eq("id", id)
    .eq("influencer_id", session.id)
    .in("status", ["accepted", "in_progress"]);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/dashboard/influencer/bookings");
  revalidatePath("/dashboard/brand/bookings");
  return { ok: true as const };
}

export async function approveBookingAction(id: string) {
  const session = await requireSession();
  const supabase = await createClient();
  const { data: row } = await supabase.from("bookings").select("*").eq("id", id).maybeSingle();
  if (!row) return { ok: false as const, error: "Not found." };
  const booking = mapBooking(row as BookingRow);
  if (booking.brandId !== session.id) {
    return { ok: false as const, error: "Not found." };
  }
  if (booking.status !== "delivered") {
    return { ok: false as const, error: "Waiting for delivery." };
  }

  await adjustWallet({
    userId: booking.brandId,
    availableDelta: 0,
    pendingDelta: -booking.amountCents,
    type: "debit",
    reason: "Booking approved — escrow released",
    referenceType: "booking_release",
    referenceId: booking.id,
  });
  await adjustWallet({
    userId: booking.influencerId,
    availableDelta: booking.amountCents,
    type: "credit",
    reason: "Booking payment received",
    referenceType: "booking_release",
    referenceId: booking.id,
  });

  const { error } = await supabase
    .from("bookings")
    .update({ status: "approved" })
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/dashboard/brand/bookings");
  revalidatePath("/dashboard/influencer/bookings");
  return { ok: true as const };
}

export async function listBrandBookings() {
  const session = await requireSession();
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select("*")
    .eq("brand_id", session.id)
    .order("created_at", { ascending: false });
  return ((data ?? []) as BookingRow[]).map(mapBooking);
}

export async function listInfluencerBookings() {
  const session = await requireSession();
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select("*")
    .eq("influencer_id", session.id)
    .order("created_at", { ascending: false });
  return ((data ?? []) as BookingRow[]).map(mapBooking);
}
