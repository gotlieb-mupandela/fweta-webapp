import { createHash, timingSafeEqual } from "crypto";

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Constant-time comparison of an Authorization header to `Bearer <secret>`.
 * Both sides are hashed first so the buffers passed to timingSafeEqual are
 * always the same length, including when the header is missing or shorter.
 */
export function safeBearerEqual(header: string | null, secret: string): boolean {
  const actual = sha256(header ?? "");
  const wanted = sha256(`Bearer ${secret}`);
  return timingSafeEqual(actual, wanted);
}
