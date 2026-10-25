/**
 * Single source of truth for auth and payout secrets.
 *
 * - Returns the configured env secret when it is safe to use.
 * - Local development falls back to a dev-only key so `npm run dev` works.
 * - Hosted runs (NODE_ENV production, VERCEL set, or VERCEL_ENV set) refuse
 *   to sign or encrypt with a missing key, the public dev key, a payout key
 *   that is too short, or a payout key equal to AUTH_SECRET.
 * - The build phase does not count as hosted, so `next build` can compile
 *   before the host injects runtime secrets. `next start` and Vercel still
 *   refuse to boot without real keys.
 *
 * Edge-runtime safe: no Node imports. Usable from `proxy.ts`, server
 * actions, and `lib/db/store.ts`.
 */

const DEV_AUTH_SECRET = "fweta-local-dev-secret-change-me";
const DEV_PAYOUT_SECRET = "fweta-payout-key-change-me";
const MIN_HOSTED_PAYOUT_SECRET_LENGTH = 32;

const INSECURE_DEFAULTS = new Set([DEV_AUTH_SECRET, DEV_PAYOUT_SECRET]);

let warnedAuth = false;
let warnedPayout = false;
let warnedUnverifiable = false;
let warnedPayoutMatchesAuth = false;

function readEnv(name: "AUTH_SECRET" | "PAYOUT_ENCRYPTION_KEY"): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/** True when this process must not use the public dev keys. */
export function isHostedRuntime(): boolean {
  // `next build` sets NODE_ENV=production. Do not fail the build for empty
  // local env files. Runtime (`next start`, Vercel) is not this phase.
  if (process.env.NEXT_PHASE === "phase-production-build") return false;
  if (process.env.NODE_ENV === "production") return true;
  if (process.env.VERCEL_ENV?.trim()) return true;
  if (process.env.VERCEL?.trim()) return true;
  return false;
}

function assertAuthSecret(auth: string | undefined): string {
  if (!isHostedRuntime()) {
    if (auth) return auth;
    if (!warnedAuth) {
      warnedAuth = true;
      console.warn("[fweta] AUTH_SECRET missing: using insecure dev fallback (local only).");
    }
    return DEV_AUTH_SECRET;
  }
  if (!auth || INSECURE_DEFAULTS.has(auth)) {
    throw new Error(
      "[fweta] AUTH_SECRET is missing or still the public dev key. Generate one with: openssl rand -base64 32",
    );
  }
  return auth;
}

function assertPayoutSecret(payout: string | undefined, auth: string | undefined): string {
  if (!isHostedRuntime()) {
    if (payout) {
      if (auth && payout === auth && !warnedPayoutMatchesAuth) {
        warnedPayoutMatchesAuth = true;
        console.warn(
          "[fweta] PAYOUT_ENCRYPTION_KEY matches AUTH_SECRET. Use a distinct key before deploying.",
        );
      }
      return payout;
    }
    if (!warnedPayout) {
      warnedPayout = true;
      console.warn("[fweta] PAYOUT_ENCRYPTION_KEY missing: using insecure dev fallback (local only).");
    }
    return DEV_PAYOUT_SECRET;
  }

  if (!payout) {
    throw new Error(
      "[fweta] PAYOUT_ENCRYPTION_KEY is not set. Set it in Vercel before deploying. Generate one with: openssl rand -base64 32",
    );
  }
  if (INSECURE_DEFAULTS.has(payout)) {
    throw new Error(
      "[fweta] PAYOUT_ENCRYPTION_KEY is still a public dev key. Generate one with: openssl rand -base64 32",
    );
  }
  if (auth && payout === auth) {
    throw new Error("[fweta] PAYOUT_ENCRYPTION_KEY must not equal AUTH_SECRET.");
  }
  if (payout.length < MIN_HOSTED_PAYOUT_SECRET_LENGTH) {
    throw new Error(
      "[fweta] PAYOUT_ENCRYPTION_KEY is too short. Use at least 32 characters. Generate one with: openssl rand -base64 32",
    );
  }
  return payout;
}

/** Raw auth secret for session JWT signing. Throws on a hosted runtime when unset. */
export function getAuthSecret(): string {
  return assertAuthSecret(readEnv("AUTH_SECRET"));
}

/** Encoded key for `jose` sign/verify. Throws on a hosted runtime when unset. */
export function getAuthSecretKey(): Uint8Array {
  return new TextEncoder().encode(getAuthSecret());
}

/**
 * Key for verifying an existing cookie. Hosted runtimes return null when
 * AUTH_SECRET is unset or still the public dev key, so a stale cookie
 * cannot take down the page. Signing still uses getAuthSecretKey.
 */
export function readAuthSecretKey(): Uint8Array | null {
  const auth = readEnv("AUTH_SECRET");
  if (isHostedRuntime()) {
    if (!auth || INSECURE_DEFAULTS.has(auth)) {
      if (!warnedUnverifiable) {
        warnedUnverifiable = true;
        console.warn(
          "[fweta] AUTH_SECRET is not set. Existing sessions cannot be verified until it is configured.",
        );
      }
      return null;
    }
    return new TextEncoder().encode(auth);
  }
  return new TextEncoder().encode(assertAuthSecret(auth));
}

/**
 * Raw secret for new payout ciphertext. Does not fall back to AUTH_SECRET.
 * Hosted runtimes throw when the key is missing, too short, public, or equal
 * to AUTH_SECRET.
 */
export function getPayoutSecret(): string {
  return assertPayoutSecret(readEnv("PAYOUT_ENCRYPTION_KEY"), readEnv("AUTH_SECRET"));
}

/**
 * Decrypt-only key for bank details encrypted before PAYOUT_ENCRYPTION_KEY
 * existed. Those rows used AUTH_SECRET. Local data written with neither env
 * var used the auth dev key.
 */
export function getLegacyPayoutSecret(): string | null {
  const auth = readEnv("AUTH_SECRET");
  if (auth) return auth;
  if (isHostedRuntime()) return null;
  return DEV_AUTH_SECRET;
}

/** Refuse to boot a hosted server until both secrets are real and distinct. */
export function assertHostedSecrets(): void {
  if (!isHostedRuntime()) return;
  getAuthSecret();
  getPayoutSecret();
}
