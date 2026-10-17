import { timingSafeEqual } from "crypto";

/** Constant-time comparison of an Authorization header to `Bearer <secret>`. */
export function safeBearerEqual(header: string | null, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  const actual = Buffer.from(header ?? "");
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length) return false;
  return timingSafeEqual(actual, wanted);
}
