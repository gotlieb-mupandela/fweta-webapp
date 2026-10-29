"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { newId, nowIso, readStore, updateStore } from "@/lib/db/store";
import type { InfluencerProfile, ProfileSocials, RateCardItem } from "@/lib/db/types";
import {
  influencerProfileSchema,
  rateCardSchema,
} from "@/lib/validations/influencer";
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
  if (!parsed.success) return { ok: false as const, error: "Invalid profile." };

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

  const now = nowIso();
  await updateStore((s) => {
    const current = s.influencerProfiles.find((p) => p.userId === session.id);
    const account = s.profiles.find((p) => p.id === session.id);
    const mirroredAvatar = current?.avatarUrl ?? account?.avatarUrl ?? null;

    if (current) {
      Object.assign(current, {
        displayName: parsed.data.displayName,
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
        displayName: parsed.data.displayName,
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
  if (!parsed.success) return { ok: false as const, error: "Invalid rate card." };

  const store = await readStore();
  const profile = store.influencerProfiles.find((p) => p.userId === session.id);
  if (!profile) {
    return { ok: false as const, error: "Create your public profile first." };
  }

  const now = nowIso();
  const item: RateCardItem = {
    id: newId(),
    influencerProfileId: profile.id,
    title: parsed.data.title,
    description: parsed.data.description ?? "",
    type: parsed.data.type,
    platform: parsed.data.platform,
    priceCents: parsed.data.priceCents,
    active: parsed.data.active ?? true,
    createdAt: now,
    updatedAt: now,
  };

  await updateStore((s) => {
    s.rateCards.push(item);
  });
  revalidatePath("/dashboard/influencer/rate-cards");
  return { ok: true as const, id: item.id };
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

