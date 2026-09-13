import { createClient } from "@supabase/supabase-js";

const BUCKET = "avatars";
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

function supabaseUrl(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    undefined
  );
}

function supabaseServiceKey(): string | undefined {
  return (
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    undefined
  );
}

export function isAvatarStorageConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseServiceKey());
}

function extensionForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
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
  if (!ALLOWED.has(mime)) {
    return { ok: false, error: "Use a JPEG, PNG, or WebP image." };
  }
  if (opts.file.size > MAX_BYTES) {
    return { ok: false, error: "Image must be 2MB or smaller." };
  }

  const url = supabaseUrl()!;
  const key = supabaseServiceKey()!;
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

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
