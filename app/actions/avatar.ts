"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { nowIso, updateStore } from "@/lib/db/store";
import { uploadAvatarFile } from "@/lib/storage/avatars";

export async function uploadAvatarAction(formData: FormData) {
  const session = await requireSession();
  const file = formData.get("file");
  const kindRaw = String(formData.get("kind") || "profile");
  const kind = kindRaw === "influencer" ? "influencer" : "profile";

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, error: "Choose an image to upload." };
  }

  const uploaded = await uploadAvatarFile({
    userId: session.id,
    file,
    kind,
  });
  if (!uploaded.ok) return uploaded;

  const now = nowIso();
  await updateStore((s) => {
    const profile = s.profiles.find((p) => p.id === session.id);
    if (profile) {
      profile.avatarUrl = uploaded.url;
      profile.updatedAt = now;
    }

    const inf = s.influencerProfiles.find((p) => p.userId === session.id);
    if (inf) {
      inf.avatarUrl = uploaded.url;
      inf.updatedAt = now;
    }
  });

  revalidatePath("/dashboard/settings/profile");
  revalidatePath("/dashboard/influencer/profile");
  revalidatePath("/influencers");
  return { ok: true as const, url: uploaded.url };
}
