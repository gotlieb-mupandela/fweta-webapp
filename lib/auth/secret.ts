/**
 * Single source of truth for auth/payout secrets.
 *
 * - Returns the configured env secret when set.
 * - In development falls back to the local dev default (with a one-time
 *   warning) so `npm run dev` works out of the box.
 * - In production throws instead of silently signing sessions / encrypting
 *   bank details with a publicly known key (fail-closed: loud 500s in logs
 *   and error boundaries, not forged sessions).
 *
 * Edge-runtime safe: no Node imports. Usable from `proxy.ts`, server
 * actions, and `lib/db/store.ts`.
 */

const DEV_FALLBACK = "fweta-local-dev-secret-change-me";

let warnedAuth = false;
let warnedPayout = false;

function readEnv(name: "AUTH_SECRET" | "PAYOUT_ENCRYPTION_KEY"): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function requireSecret(kind: "auth" | "payout"): string {
  const auth = readEnv("AUTH_SECRET");
  if (kind === "auth") {
    if (auth) return auth;
  } else {
    const payout = readEnv("PAYOUT_ENCRYPTION_KEY");
    if (payout) return payout;
    if (auth) return auth;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      kind === "auth"
        ? "[fweta] AUTH_SECRET is not set. Generate one with: openssl rand -base64 32"
        : "[fweta] PAYOUT_ENCRYPTION_KEY (or AUTH_SECRET fallback) is not set. Generate one with: openssl rand -base64 32",
    );
  }

  if (kind === "auth") {
    if (!warnedAuth) {
      warnedAuth = true;
      console.warn("[fweta] AUTH_SECRET missing — using insecure dev fallback (local only).");
    }
  } else if (!warnedPayout) {
    warnedPayout = true;
    console.warn(
      "[fweta] PAYOUT_ENCRYPTION_KEY/AUTH_SECRET missing — using insecure dev fallback (local only).",
    );
  }
  return DEV_FALLBACK;
}

/** Raw auth secret for session JWT signing/verification. */
export function getAuthSecret(): string {
  return requireSecret("auth");
}

/** Encoded key for `jose` sign/verify. */
export function getAuthSecretKey(): Uint8Array {
  return new TextEncoder().encode(getAuthSecret());
}

/** Raw secret for payout-details encryption (key falls back to AUTH_SECRET). */
export function getPayoutSecret(): string {
  return requireSecret("payout");
}
