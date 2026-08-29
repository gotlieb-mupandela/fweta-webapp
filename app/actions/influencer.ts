"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  mapInfluencerProfile,
  mapRateCard,
  type InfluencerProfileRow,
  type RateCardRow,
} from "@/lib/db/mappers";
import {
  influencerProfileSchema,
  rateCardSchema,
} from "@/lib/validations/influencer";
import { slugify } from "@/lib/utils";

export async function upsertInfluencerProfileAction(raw: unknown) {
  const session = await requireSession();
  if (!session.roles.includes("influencer")) {
    return { ok: false as const, error: "Influencer role required." };
  }
  const parsed = influencerProfileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Invalid profile." };

  const supabase = await createClient();
  const { data: existingRow } = await supabase
    .from("influencer_profiles")
    .select("*")
    .eq("user_id", session.id)
    .maybeSingle();
  const existing = existingRow
    ? mapInfluencerProfile(existingRow as InfluencerProfileRow)
    : null;
  const baseSlug = slugify(parsed.data.displayName);
  let slug = existing?.slug || baseSlug;
  if (!existing) {
    let i = 1;
    while (true) {
      const { data: taken } = await supabase
        .from("influencer_profiles")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!taken) break;
      slug = `${baseSlug}-${i++}`;
    }
  }

  const payload = {
    display_name: parsed.data.displayName,
    headline: parsed.data.headline,
    bio: parsed.data.bio,
    niche: parsed.data.niche,
    location: parsed.data.location,
    socials: {
      tiktok: parsed.data.socials?.tiktok || undefined,
      youtube: parsed.data.socials?.youtube || undefined,
      instagram: parsed.data.socials?.instagram || undefined,
      x: parsed.data.socials?.x || undefined,
    },
    published: parsed.data.published ?? existing?.published ?? false,
  };

  if (existing) {
    const { error } = await supabase
      .from("influencer_profiles")
      .update(payload)
      .eq("id", existing.id);
    if (error) return { ok: false as const, error: error.message };
  } else {
    const { error } = await supabase.from("influencer_profiles").insert({
      user_id: session.id,
      slug,
      ...payload,
    });
    if (error) return { ok: false as const, error: error.message };
  }

  revalidatePath("/dashboard/influencer/profile");
  revalidatePath("/influencers");
  return { ok: true as const, slug };
}

export async function getMyInfluencerProfile() {
  const session = await requireSession();
  const supabase = await createClient();
  const { data } = await supabase
    .from("influencer_profiles")
    .select("*")
    .eq("user_id", session.id)
    .maybeSingle();
  return data ? mapInfluencerProfile(data as InfluencerProfileRow) : null;
}

export async function addRateCardAction(raw: unknown) {
  const session = await requireSession();
  if (!session.roles.includes("influencer")) {
    return { ok: false as const, error: "Influencer role required." };
  }
  const parsed = rateCardSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Invalid rate card." };

  const profile = await getMyInfluencerProfile();
  if (!profile) {
    return { ok: false as const, error: "Create your public profile first." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rate_cards")
    .insert({
      influencer_profile_id: profile.id,
      title: parsed.data.title,
      description: parsed.data.description ?? "",
      type: parsed.data.type,
      platform: parsed.data.platform,
      price_cents: parsed.data.priceCents,
      active: parsed.data.active ?? true,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false as const, error: error?.message ?? "Failed." };
  revalidatePath("/dashboard/influencer/rate-cards");
  return { ok: true as const, id: data.id as string };
}

export async function toggleRateCardAction(id: string, active: boolean) {
  const session = await requireSession();
  const profile = await getMyInfluencerProfile();
  if (!profile) return { ok: false as const, error: "Not found." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("rate_cards")
    .update({ active })
    .eq("id", id)
    .eq("influencer_profile_id", profile.id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/dashboard/influencer/rate-cards");
  return { ok: true as const };
}

export async function listMyRateCards() {
  const profile = await getMyInfluencerProfile();
  if (!profile) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("rate_cards")
    .select("*")
    .eq("influencer_profile_id", profile.id)
    .order("created_at", { ascending: false });
  return ((data ?? []) as RateCardRow[]).map(mapRateCard);
}

export async function listPublicInfluencers(filters?: { q?: string; niche?: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("influencer_profiles")
    .select("*")
    .eq("published", true)
    .order("display_name");
  return ((data ?? []) as InfluencerProfileRow[])
    .map(mapInfluencerProfile)
    .filter((p) =>
      filters?.niche ? p.niche.toLowerCase().includes(filters.niche.toLowerCase()) : true,
    )
    .filter((p) =>
      filters?.q
        ? `${p.displayName} ${p.headline} ${p.niche} ${p.bio}`
            .toLowerCase()
            .includes(filters.q.toLowerCase())
        : true,
    );
}

export async function getPublicInfluencer(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("influencer_profiles")
    .select("*")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (!data) return null;
  const profile = mapInfluencerProfile(data as InfluencerProfileRow);
  const { data: rateRows } = await supabase
    .from("rate_cards")
    .select("*")
    .eq("influencer_profile_id", profile.id)
    .eq("active", true);
  return {
    profile,
    rates: ((rateRows ?? []) as RateCardRow[]).map(mapRateCard),
  };
}
