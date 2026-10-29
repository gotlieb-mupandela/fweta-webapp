"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { nowIso, updateStore } from "@/lib/db/store";
import { avatarObjectPath, deleteAvatarObject, uploadAvatarFile } from "@/lib/storage/avatars";

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

  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/settings/profile");
  revalidatePath("/dashboard/influencer/profile");
  revalidatePath("/dashboard/brand");
  revalidatePath("/influencers");
  return { ok: true as const, url: uploaded.url };
}

export async function removeAvatarAction() {
  const session = await requireSession();
  let previous: string | null = null;
  try {
    await updateStore((s) => {
      previous = null;
      const now = nowIso();
      const profile = s.profiles.find((p) => p.id === session.id);
      if (profile) {
        previous = profile.avatarUrl;
        profile.avatarUrl = null;
        profile.updatedAt = now;
      }
      const inf = s.influencerProfiles.find((p) => p.userId === session.id);
      if (inf) {
        if (!previous) previous = inf.avatarUrl;
        inf.avatarUrl = null;
        inf.updatedAt = now;
      }
    });
    if (previous) {
      const path = avatarObjectPath(previous, session.id);
      if (path) {
        try {
          await deleteAvatarObject(path);
        } catch {
          // The profile no longer points at the file. A leftover object stays in the bucket.
        }
      }
    }
    revalidatePath("/dashboard", "layout");
    revalidatePath("/dashboard/settings/profile");
    revalidatePath("/dashboard/influencer/profile");
    revalidatePath("/dashboard/brand");
    revalidatePath("/influencers");
    return { ok: true as const };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Could not remove the photo.",
    };
  }
}
