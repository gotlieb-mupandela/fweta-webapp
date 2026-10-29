import { SignJWT, jwtVerify } from "jose";

import { getAuthSecretKey } from "@/lib/auth/secret";
import { appUrl } from "@/lib/email/config";

const PURPOSE = "password-reset";
const TTL_MS = 30 * 60 * 1000;

export const RESET_REQUEST_MESSAGE =
  "If an account exists for that email, we sent a reset link. It expires in 30 minutes.";

export type PasswordResetGrant = {
  jti: string;
  expiresAt: string;
};

export function passwordResetExpiry(nowMs = Date.now()): string {
  return new Date(nowMs + TTL_MS).toISOString();
}

export function resetGrantStatus(
  grant: PasswordResetGrant | null | undefined,
  jti: string,
  nowMs: number,
): "ok" | "invalid" {
  if (!grant || grant.jti !== jti) return "invalid";
  const expires = Date.parse(grant.expiresAt);
  if (!Number.isFinite(expires) || expires <= nowMs) return "invalid";
  return "ok";
}

export async function signPasswordResetToken(userId: string, jti: string): Promise<string> {
  return new SignJWT({ purpose: PURPOSE, jti })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(getAuthSecretKey());
}

export async function readPasswordResetToken(
  token: string,
): Promise<{ userId: string; jti: string } | null> {
  if (!token || token.length > 4000) return null;
  try {
    const { payload } = await jwtVerify(token, getAuthSecretKey());
    if (payload.purpose !== PURPOSE || !payload.sub || typeof payload.jti !== "string") return null;
    return { userId: payload.sub, jti: payload.jti };
  } catch {
    return null;
  }
}

export function passwordResetUrl(token: string): string {
  return `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}
