import { SignJWT, jwtVerify } from "jose";

import { getAuthSecretKey } from "@/lib/auth/secret";
import { appUrl } from "@/lib/email/config";

export const EMAIL_SCOPES = ["email", "bookings", "withdrawals"] as const;
export type EmailScope = (typeof EMAIL_SCOPES)[number];

export type PreferenceLinks = {
  preferencesHref: string;
  unsubscribeHref: string;
};

const PURPOSE = "email-prefs";

export function parseEmailScope(value: string | null | undefined): EmailScope | null {
  if (value === "email" || value === "bookings" || value === "withdrawals") return value;
  return null;
}

export function unsubscribeLabel(scope: EmailScope): string {
  if (scope === "bookings") return "Turn off booking emails";
  if (scope === "withdrawals") return "Turn off withdrawal emails";
  return "Turn off all fweta emails";
}

export async function signPrefsToken(userId: string): Promise<string> {
  return new SignJWT({ purpose: PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("180d")
    .sign(getAuthSecretKey());
}

export async function verifyPrefsToken(token: string): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getAuthSecretKey());
    if (payload.purpose !== PURPOSE || !payload.sub) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export function preferencesUrl(token: string): string {
  return `${appUrl()}/email/preferences?token=${encodeURIComponent(token)}`;
}

export function unsubscribePageUrl(token: string, scope: EmailScope): string {
  return `${appUrl()}/email/unsubscribe?token=${encodeURIComponent(token)}&scope=${scope}`;
}

export function oneClickUnsubscribeUrl(token: string, scope: EmailScope): string {
  return `${appUrl()}/api/email/unsubscribe?token=${encodeURIComponent(token)}&scope=${scope}`;
}

export function unsubscribeHeaders(token: string, scope: EmailScope): Record<string, string> {
  return {
    "List-Unsubscribe": `<${oneClickUnsubscribeUrl(token, scope)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export function samplePreferenceLinks(): PreferenceLinks {
  const base = appUrl();
  return {
    preferencesHref: `${base}/email/preferences`,
    unsubscribeHref: `${base}/email/unsubscribe`,
  };
}
