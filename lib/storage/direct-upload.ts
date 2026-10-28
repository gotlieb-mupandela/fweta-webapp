import { STORAGE_NOT_READY_ERROR, friendlyStorageError } from "@/lib/storage/constants";

/**
 * Browser PUT to a signed upload URL. The file does not pass through a Server Action.
 * A provider error, including "Bucket not found", is replaced before it reaches the screen.
 */
export async function putSignedUpload(
  signedUrl: string,
  file: File,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const body = new FormData();
  body.append("cacheControl", "60");
  body.append("", file, file.name);
  const headers: Record<string, string> = { "x-upsert": "false" };
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (anon) {
    headers.apikey = anon;
    headers.Authorization = `Bearer ${anon}`;
  }
  try {
    const response = await fetch(signedUrl, { method: "PUT", body, headers });
    if (response.ok) return { ok: true };
    const text = await response.text().catch(() => "");
    return { ok: false, error: friendlyStorageError(text || "Upload failed") };
  } catch {
    return { ok: false, error: STORAGE_NOT_READY_ERROR };
  }
}
