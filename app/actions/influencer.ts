"use server";

import { cleanDisplayName } from "@/lib/text/display-name";
import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { newId, nowIso, readStore, updateStore } from "@/lib/db/store";
import type { InfluencerProfile, ProfileSocials } from "@/lib/db/types";
import {
  influencerProfileSchema,
  rateCardSchema,
} from "@/lib/validations/influencer";
import { addRateCardOnce } from "@/lib/influencers/rate-cards";
import { slugify } from "@/lib/utils";

function socialsFromForm(socials?: {
  tiktok?: string;
  youtube?: string;
  instagram?: string;
  facebook?: string;
  x?: string;
}): ProfileSocials {
  const pick = (value?: string) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  };
  return {
    tiktok: pick(socials?.tiktok),
    youtube: pick(socials?.youtube),
    instagram: pick(socials?.instagram),
    facebook: pick(socials?.facebook),
    x: pick(socials?.x),
  };
}

export async function upsertInfluencerProfileAction(raw: unknown) {
  const session = await requireSession();
  if (!session.roles.includes("influencer")) {
    return { ok: false as const, error: "Influencer role required." };
  }
  const parsed = influencerProfileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Check the profile fields.",
    };
  }

  const store = await readStore();
  const existing = store.influencerProfiles.find((p) => p.userId === session.id);
  const baseSlug = slugify(parsed.data.displayName);
  let slug = existing?.slug || baseSlug;
  if (!existing) {
    let i = 1;
    while (store.influencerProfiles.some((p) => p.slug === slug)) {
      slug = `${baseSlug}-${i++}`;
    }
  }

  const cleanName = cleanDisplayName(parsed.data.displayName);
  if (cleanName.length < 2) {
    return { ok: false as const, error: "Display name must be at least 2 characters." };
  }
  const now = nowIso();
  await updateStore((s) => {
    const current = s.influencerProfiles.find((p) => p.userId === session.id);
    const account = s.profiles.find((p) => p.id === session.id);
    const mirroredAvatar = current?.avatarUrl ?? account?.avatarUrl ?? null;

    if (current) {
      Object.assign(current, {
        displayName: cleanName,
        headline: parsed.data.headline,
        bio: parsed.data.bio,
        niche: parsed.data.niche,
        location: parsed.data.location,
        socials: socialsFromForm(parsed.data.socials),
        published: parsed.data.published ?? current.published,
        updatedAt: now,
      });
    } else {
      const profile: InfluencerProfile = {
        id: newId(),
        userId: session.id,
        slug,
        displayName: cleanName,
        headline: parsed.data.headline,
        bio: parsed.data.bio,
        niche: parsed.data.niche,
        location: parsed.data.location,
        avatarUrl: mirroredAvatar,
        socials: socialsFromForm(parsed.data.socials),
        featuredWork: [],
        published: parsed.data.published ?? true,
        createdAt: now,
        updatedAt: now,
      };
      s.influencerProfiles.push(profile);
    }

    if (account) {
      account.displayName = parsed.data.displayName;
      if (current?.avatarUrl) account.avatarUrl = current.avatarUrl;
      else if (mirroredAvatar) account.avatarUrl = mirroredAvatar;
      account.updatedAt = now;
    }
  });

  revalidatePath("/dashboard/influencer/profile");
  revalidatePath("/influencers");
  return { ok: true as const, slug };
}

export async function getMyInfluencerProfile() {
  const session = await requireSession();
  const store = await readStore();
  return store.influencerProfiles.find((p) => p.userId === session.id) ?? null;
}

export async function addRateCardAction(raw: unknown) {
  const session = await requireSession();
  if (!session.roles.includes("influencer")) {
    return { ok: false as const, error: "Influencer role required." };
  }
  const parsed = rateCardSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Check the rate card fields.",
    };
  }

  const store = await readStore();
  const profile = store.influencerProfiles.find((p) => p.userId === session.id);
  if (!profile) {
    return { ok: false as const, error: "Create your public profile first." };
  }

  const card = {
    influencerProfileId: profile.id,
    title: parsed.data.title,
    description: parsed.data.description ?? "",
    type: parsed.data.type,
    platform: parsed.data.platform,
    priceCents: parsed.data.priceCents,
    active: parsed.data.active ?? true,
  };
  // The duplicate check runs inside the compare-and-swap save, so a conflict
  // reruns it on the fresh document and two simultaneous adds make one card.
  let result = { id: "", created: false };
  await updateStore((s) => {
    result = addRateCardOnce(s, card, newId);
  });
  revalidatePath("/dashboard/influencer/rate-cards");
  revalidatePath(`/influencers/${profile.slug}`);
  return { ok: true as const, id: result.id };
}

export async function updateRateCardAction(id: string, raw: unknown) {
  const session = await requireSession();
  if (!session.roles.includes("influencer") && !session.roles.includes("admin")) {
    return { ok: false as const, error: "Influencer role required." };
  }
  const parsed = rateCardSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Check the rate card fields.",
    };
  }
  const store = await readStore();
  const profile = store.influencerProfiles.find((p) => p.userId === session.id);
  if (!profile) return { ok: false as const, error: "Create your public profile first." };
  const existing = store.rateCards.find((rate) => rate.id === id && rate.influencerProfileId === profile.id);
  if (!existing) return { ok: false as const, error: "Rate not found." };

  await updateStore((s) => {
    const item = s.rateCards.find((rate) => rate.id === id && rate.influencerProfileId === profile.id);
    if (!item) return;
    item.title = parsed.data.title;
    item.description = parsed.data.description ?? "";
    item.type = parsed.data.type;
    item.platform = parsed.data.platform;
    item.priceCents = parsed.data.priceCents;
    item.active = parsed.data.active ?? item.active;
    item.updatedAt = nowIso();
  });
  revalidatePath("/dashboard/influencer/rate-cards");
  revalidatePath(`/influencers/${profile.slug}`);
  return { ok: true as const };
}

export async function deleteRateCardAction(id: string) {
  const session = await requireSession();
  if (!session.roles.includes("influencer") && !session.roles.includes("admin")) {
    return { ok: false as const, error: "Influencer role required." };
  }
  const store = await readStore();
  const profile = store.influencerProfiles.find((p) => p.userId === session.id);
  if (!profile) return { ok: false as const, error: "Rate not found." };
  const existing = store.rateCards.find((rate) => rate.id === id && rate.influencerProfileId === profile.id);
  if (!existing) return { ok: false as const, error: "Rate not found." };
  const inUse = store.bookings.some(
    (booking) => booking.rateCardItemId === id && booking.status !== "cancelled",
  );
  if (inUse) {
    return {
      ok: false as const,
      error: "A booking uses this rate, so it cannot be deleted. Edit the price instead.",
    };
  }

  await updateStore((s) => {
    s.rateCards = s.rateCards.filter((rate) => !(rate.id === id && rate.influencerProfileId === profile.id));
  });
  revalidatePath("/dashboard/influencer/rate-cards");
  revalidatePath(`/influencers/${profile.slug}`);
  return { ok: true as const };
}

export async function toggleRateCardAction(id: string, active: boolean) {
  const session = await requireSession();
  const store = await readStore();
  const profile = store.influencerProfiles.find((p) => p.userId === session.id);
  if (!profile) return { ok: false as const, error: "Not found." };
  await updateStore((s) => {
    const item = s.rateCards.find(
      (r) => r.id === id && r.influencerProfileId === profile.id,
    );
    if (!item) return;
    item.active = active;
    item.updatedAt = nowIso();
  });
  revalidatePath("/dashboard/influencer/rate-cards");
  return { ok: true as const };
}

export async function listMyRateCards() {
  const session = await requireSession();
  const store = await readStore();
  const profile = store.influencerProfiles.find((p) => p.userId === session.id);
  if (!profile) return [];
  return store.rateCards
    .filter((r) => r.influencerProfileId === profile.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

