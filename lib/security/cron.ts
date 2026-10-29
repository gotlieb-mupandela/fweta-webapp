import { safeBearerEqual } from "@/lib/security/bearer";

/** Fail closed. A missing CRON_SECRET never authorizes a cron route. */
export function authorizeCron(request: { headers: { get(name: string): string | null } }): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return safeBearerEqual(request.headers.get("authorization"), secret);
}
