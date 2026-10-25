import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  STORAGE_NOT_READY_ERROR,
  UPLOAD_TTL_SECONDS,
  friendlyStorageError,
} from "@/lib/storage/constants";

export type StorageDriver = {
  uploadObject(input: { bucket: string; path: string; body: Uint8Array; contentType: string }): Promise<void>;
  downloadObject(bucket: string, path: string): Promise<Uint8Array | null>;
  deleteObject(bucket: string, path: string): Promise<void>;
  createSignedUploadUrl(input: { bucket: string; path: string }): Promise<{ signedUrl: string; token: string }>;
  createSignedReadUrl(input: { bucket: string; path: string; expiresIn: number; downloadName: string }): Promise<string>;
};

function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim() || undefined;
}

function supabaseServiceKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined;
}

export function isStorageConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseServiceKey());
}

function serviceClient(): SupabaseClient {
  const url = supabaseUrl();
  const key = supabaseServiceKey();
  if (!url || !key) throw new Error(STORAGE_NOT_READY_ERROR);
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function raise(raw: string): never {
  throw new Error(friendlyStorageError(raw));
}

export function createSupabaseStorageDriver(): StorageDriver {
  return {
    async uploadObject(input) {
      const { error } = await serviceClient().storage.from(input.bucket).upload(input.path, input.body, {
        contentType: input.contentType,
        upsert: false,
      });
      if (error) raise(error.message || "Upload failed");
    },
    async downloadObject(bucket, path) {
      const { data, error } = await serviceClient().storage.from(bucket).download(path);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
    async deleteObject(bucket, path) {
      const { error } = await serviceClient().storage.from(bucket).remove([path]);
      if (error) raise(error.message || "Delete failed");
    },
    async createSignedUploadUrl(input) {
      const signed = await signUpload(input.bucket, input.path);
      if (signed) return signed;
      const { data, error } = await serviceClient()
        .storage.from(input.bucket)
        .createSignedUploadUrl(input.path, { upsert: false });
      if (error || !data?.signedUrl || !data.token) raise(error?.message || "Upload failed");
      return { signedUrl: data.signedUrl, token: data.token };
    },
    async createSignedReadUrl(input) {
      const { data, error } = await serviceClient()
        .storage.from(input.bucket)
        .createSignedUrl(input.path, input.expiresIn, { download: input.downloadName });
      if (error || !data?.signedUrl) raise(error?.message || "Read failed");
      return data.signedUrl;
    },
  };
}

/**
 * Ask storage for a short upload token. The JS helper has no expiry argument
 * (it documents a 2 hour token), so this calls the sign route with expiresIn
 * and falls back to that helper if the route rejects the field.
 */
async function signUpload(bucket: string, path: string): Promise<{ signedUrl: string; token: string } | null> {
  const base = supabaseUrl();
  const key = supabaseServiceKey();
  if (!base || !key) throw new Error(STORAGE_NOT_READY_ERROR);
  const encoded = path.split("/").map((part) => encodeURIComponent(part)).join("/");
  let response: Response;
  try {
    response = await fetch(`${base}/storage/v1/object/upload/sign/${bucket}/${encoded}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: UPLOAD_TTL_SECONDS }),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  let payload: { url?: string; signedUrl?: string; token?: string };
  try {
    payload = (await response.json()) as { url?: string; signedUrl?: string; token?: string };
  } catch {
    return null;
  }
  if (payload.signedUrl && payload.token) return { signedUrl: payload.signedUrl, token: payload.token };
  if (!payload.url) return null;
  const signedUrl = new URL(payload.url, `${base}/storage/v1`).toString();
  const token = new URL(signedUrl).searchParams.get("token");
  if (!token) return null;
  return { signedUrl, token };
}
