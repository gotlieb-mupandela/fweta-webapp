import { safeBearerEqual } from "@/lib/security/bearer";

/** Production requires CRON_SECRET. Local dev may call the route without it. */
export function authorizeCron(request: { headers: { get(name: string): string | null } }): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  return safeBearerEqual(request.headers.get("authorization"), secret);
}
