import { isSupabaseStoreEnabled } from "./supabase-store";

/**
 * Store driver.
 *
 * - `file`: `data/store.json` (or `/tmp` on a serverless host). Local default.
 * - `supabase`: Postgres via the service role. Used when the Supabase URL and
 *   secret key are set, which is the production path on Vercel.
 *
 * Set `FWETA_STORE=file` to force the file driver even if Supabase keys are
 * present (local dev against a copy of production env). Set `FWETA_STORE=supabase`
 * to fail closed when the keys are missing instead of silently using a file.
 *
 * A failed Supabase read must not fall back to an empty file and then overwrite
 * Postgres. The file driver is only for when Supabase is not configured.
 *
 * Production (`NODE_ENV=production` or `VERCEL` set) throws at first use if the
 * resolved driver is the file store, including when the Supabase env vars are
 * missing. The Next.js build phase (`NEXT_PHASE=phase-production-build`) does
 * not throw, so `next build` can finish before the host injects those vars.
 */
export type StoreDriver = "file" | "supabase";

/** True when a file driver must not serve this process. Build phase is exempt. */
function productionForbidsFileStore(): boolean {
  // `next build` sets NODE_ENV=production. Do not fail the build for an empty
  // local env file. Runtime (`next start`, Vercel) is not this phase.
  if (process.env.NEXT_PHASE === "phase-production-build") return false;
  if (process.env.NODE_ENV === "production") return true;
  if (process.env.VERCEL?.trim()) return true;
  return false;
}

function assertFileStoreAllowed(driver: StoreDriver): StoreDriver {
  if (driver !== "file" || !productionForbidsFileStore()) return driver;
  throw new Error(
    "[fweta] Refusing the local file store in production. Set NEXT_PUBLIC_SUPABASE_URL and a service role key (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY).",
  );
}

export function activeStoreDriver(): StoreDriver {
  const forced = process.env.FWETA_STORE?.trim().toLowerCase();
  if (forced === "file") return assertFileStoreAllowed("file");
  if (forced === "supabase") {
    if (!isSupabaseStoreEnabled()) {
      throw new Error(
        "[fweta] FWETA_STORE=supabase but NEXT_PUBLIC_SUPABASE_URL or the service role key is missing.",
      );
    }
    return "supabase";
  }
  return assertFileStoreAllowed(isSupabaseStoreEnabled() ? "supabase" : "file");
}
