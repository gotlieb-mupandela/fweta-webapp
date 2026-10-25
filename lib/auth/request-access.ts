import { readAuthSecretKey } from "@/lib/auth/secret";
import { readStore } from "@/lib/db/store";

import { readSessionClaims, resolveSessionAccess, type SessionAccess } from "./live-session";

/**
 * Verify the cookie, then decide access from the stored profile.
 * A store outage returns "unavailable" and does not fall back to cookie roles.
 */
export async function accessFromToken(token: string | undefined): Promise<SessionAccess> {
  if (!token) return { status: "anonymous" };
  const key = readAuthSecretKey();
  if (!key) return { status: "anonymous" };
  const claims = await readSessionClaims(token, key);
  if (!claims) return { status: "anonymous" };
  try {
    const store = await readStore();
    const profile = store.profiles.find((item) => item.id === claims.id) ?? null;
    return resolveSessionAccess(claims, profile);
  } catch {
    return { status: "unavailable" };
  }
}
