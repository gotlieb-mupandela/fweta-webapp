"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { newId, nowIso, readStore, updateStore } from "@/lib/db/store";
import type { DatabaseStore, InfluencerProfile, Profile, ProfileSocials, RateCardItem } from "@/lib/db/types";
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

function isCreatorAccount(profile: Profile): boolean {
  return (
    !profile.suspended &&
    profile.onboardingCompletedAt !== null &&
    (profile.roles.includes("influencer") || profile.roles.includes("clipper"))
  );
}

function needsDiscoverableRepair(store: DatabaseStore): boolean {
  return store.profiles.some((account) => {
    if (!isCreatorAccount(account)) return false;
    const existing = store.influencerProfiles.find((profile) => profile.userId === account.id);
    if (!existing) return true;
    // Onboarding used to save published:false without a later edit.
    return !existing.published && existing.updatedAt === existing.createdAt;
  });
}

/** Brands can only book a published profile. Create one for finished creators who never got one. */
export async function ensureDiscoverableCreators() {
  const snapshot = await readStore();
  if (!needsDiscoverableRepair(snapshot)) return;

  const now = nowIso();
  await updateStore((store) => {
    for (const account of store.profiles) {
      if (!isCreatorAccount(account)) continue;
      const existing = store.influencerProfiles.find((profile) => profile.userId === account.id);
      if (existing) {
        if (!existing.published && existing.updatedAt === existing.createdAt) {
          existing.published = true;
        }
        continue;
      }

      const base = slugify(account.displayName) || `creator-${account.id.slice(0, 6)}`;
      let slug = base;
      let n = 1;
      while (store.influencerProfiles.some((profile) => profile.slug === slug)) {
        slug = `${base}-${n++}`;
      }
      const niche =
        account.niche?.trim() || (account.roles.includes("influencer") ? "Creator" : "Clipper");
      const headline = niche.length >= 5 ? niche : `${account.displayName} on fweta`;
      const bio =
        account.bio.trim().length >= 10 ? account.bio.trim() : `${account.displayName} creates on fweta.`;

      store.influencerProfiles.push({
        id: newId(),
        userId: account.id,
        slug,
        displayName: account.displayName,
        headline,
        bio,
        niche,
        location: account.location?.trim() || "Namibia",
        avatarUrl: account.avatarUrl,
        socials: { ...(account.socials ?? {}) },
        featuredWork: [],
        published: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  });
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

export async function listPublicInfluencers(filters?: { q?: string; niche?: string }) {
  await ensureDiscoverableCreators();
  const store = await readStore();
  return store.influencerProfiles
    .filter((p) => p.published)
    .filter((p) => (filters?.niche ? p.niche.toLowerCase().includes(filters.niche.toLowerCase()) : true))
    .filter((p) =>
      filters?.q
        ? `${p.displayName} ${p.headline} ${p.niche} ${p.bio}`
            .toLowerCase()
            .includes(filters.q.toLowerCase())
        : true,
    )
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function getPublicInfluencer(slug: string) {
  await ensureDiscoverableCreators();
  const store = await readStore();
  const profile = store.influencerProfiles.find((p) => p.slug === slug && p.published);
  if (!profile) return null;
  const rates = store.rateCards.filter(
    (r) => r.influencerProfileId === profile.id && r.active,
  );
  return { profile, rates };
}
