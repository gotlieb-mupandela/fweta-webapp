import { headers } from "next/headers";

type HeaderReader = { get(name: string): string | null };

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  // IPv4, IPv6, and bracketed forms only. Anything else is not an address.
  if (!/^[0-9a-fA-F:.[\]]{2,64}$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Client IP for rate limits. Vercel sets x-vercel-forwarded-for and x-real-ip
 * at its edge and overwrites any value the client sent, so those come first.
 * A raw X-Forwarded-For first hop is client controlled and is never used.
 * Without the Vercel headers, the last X-Forwarded-For hop is the one the
 * nearest proxy appended.
 */
export function pickClientIp(headerList: HeaderReader): string {
  const vercel = clean(headerList.get("x-vercel-forwarded-for")?.split(",")[0]);
  if (vercel) return vercel;
  const real = clean(headerList.get("x-real-ip"));
  if (real) return real;
  const hops = (headerList.get("x-forwarded-for") ?? "").split(",");
  const last = clean(hops[hops.length - 1]);
  return last ?? "local";
}

export async function clientIp(): Promise<string> {
  return pickClientIp(await headers());
}
