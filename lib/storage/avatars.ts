import { AVATAR_MAX_BYTES, isAllowedImageType, uploadLimitMessage } from "@/lib/uploads/limits";
import { createServiceStorageClient, isServiceStorageConfigured } from "@/lib/storage/service";

const BUCKET = "avatars";

export function isAvatarStorageConfigured(): boolean {
  return isServiceStorageConfigured();
}

function extensionForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

/** Path inside the avatars bucket, or null when the URL is not that user's object. */
export function avatarObjectPath(publicUrl: string, userId: string): string | null {
  try {
    const url = new URL(publicUrl);
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const index = url.pathname.indexOf(marker);
    if (index < 0) return null;
    const path = decodeURIComponent(url.pathname.slice(index + marker.length));
    if (!path.startsWith(`${userId}/`) || path.includes("..") || path.includes("\\")) return null;
    return path;
  } catch {
    return null;
  }
}

/**
 * Upload a profile image to the public `avatars` bucket.
 * Path: `{userId}/{kind}-{timestamp}.{ext}`
 */
export async function uploadAvatarFile(opts: {
  userId: string;
  file: File;
  kind: "profile" | "influencer";
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!isAvatarStorageConfigured()) {
    return {
      ok: false,
      error: "Configure Supabase Storage (URL + service role key) to upload photos.",
    };
  }

  const mime = opts.file.type;
  if (!isAllowedImageType(mime)) {
    return { ok: false, error: "Use a JPEG, PNG, or WebP image." };
  }
  const tooBig = uploadLimitMessage(opts.file, AVATAR_MAX_BYTES, "Image");
  if (tooBig) return { ok: false, error: tooBig };

  const client = createServiceStorageClient();
  const ext = extensionForMime(mime);
  const path = `${opts.userId}/${opts.kind}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await opts.file.arrayBuffer());

  const { error } = await client.storage.from(BUCKET).upload(path, buffer, {
    contentType: mime,
    upsert: true,
  });

  if (error) {
    return { ok: false, error: error.message || "Upload failed." };
  }

  const { data } = client.storage.from(BUCKET).getPublicUrl(path);
  if (!data.publicUrl) {
    return { ok: false, error: "Could not resolve public image URL." };
  }

  return { ok: true, url: data.publicUrl };
}

export async function deleteAvatarObject(objectPath: string): Promise<void> {
  if (!isAvatarStorageConfigured()) return;
  if (!objectPath || objectPath.includes("..")) return;
  const client = createServiceStorageClient();
  await client.storage.from(BUCKET).remove([objectPath]);
}
