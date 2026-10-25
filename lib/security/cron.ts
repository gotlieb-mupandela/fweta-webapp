import { safeBearerEqual } from "@/lib/security/bearer";

function cronSecretRequired(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  // A Vercel host with NODE_ENV left as development must not skip the secret.
  if (process.env.VERCEL_ENV?.trim()) return true;
  if (process.env.VERCEL?.trim()) return true;
  return false;
}

/**
 * Production and any Vercel host require CRON_SECRET.
 * Local dev may call the route without it.
 * When the secret is set, the bearer is compared in constant time.
 */
export function authorizeCron(request: { headers: { get(name: string): string | null } }): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return !cronSecretRequired();
  return safeBearerEqual(request.headers.get("authorization"), secret);
}
