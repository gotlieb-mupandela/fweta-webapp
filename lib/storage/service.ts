import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function supabaseUrl(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    undefined
  );
}

export function supabaseServiceKey(): string | undefined {
  return (
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    undefined
  );
}

export function isServiceStorageConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseServiceKey());
}

/** Service role client. Callers must already know storage is configured. */
export function createServiceStorageClient(): SupabaseClient {
  const url = supabaseUrl();
  const key = supabaseServiceKey();
  if (!url || !key) {
    throw new Error("Supabase Storage is not configured.");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
