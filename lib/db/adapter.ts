import { isSupabaseStoreEnabled } from "./supabase-store";

/**
 * Store driver.
 *
 * - `file`, `data/store.json` (or `/tmp` on a serverless host). Local default.
 * - `supabase`, Postgres via the service role. Used when Supabase URL and
 *   secret key are set, which is the production path on Vercel.
 *
 * Set `FWETA_STORE=file` to force the file driver even if Supabase keys are
 * present (local dev against a copy of production env). Set `FWETA_STORE=supabase`
 * to fail closed when the keys are missing instead of silently using a file.
 *
 * A failed Supabase read must not fall back to an empty file and then overwrite
 * Postgres. The file driver is only for when Supabase is not configured.
 */
export type StoreDriver = "file" | "supabase";

export function activeStoreDriver(): StoreDriver {
  const forced = process.env.FWETA_STORE?.trim().toLowerCase();
  if (forced === "file") return "file";
  if (forced === "supabase") {
    if (!isSupabaseStoreEnabled()) {
      throw new Error(
        "[fweta] FWETA_STORE=supabase but NEXT_PUBLIC_SUPABASE_URL or the service role key is missing.",
      );
    }
    return "supabase";
  }
  return isSupabaseStoreEnabled() ? "supabase" : "file";
}
