/**
 * Resend configuration. Both values come from the environment.
 * When either is missing, sends are skipped and a single warning is logged.
 */

let warnedMissing = false;

export function resendConfig(): { apiKey: string; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY?.trim() || "";
  const from = process.env.RESEND_FROM?.trim() || "";
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

export function warnResendUnset(context?: string): void {
  if (warnedMissing) return;
  warnedMissing = true;
  const detail = context ? ` First skipped message: ${context}` : "";
  console.warn(
    `[fweta] RESEND_API_KEY or RESEND_FROM is unset. Transactional email is disabled.${detail}`,
  );
}

/**
 * Public origin for links in email.
 * Development and tests fall back to localhost.
 * Production throws when the URL is read and NEXT_PUBLIC_APP_URL is unset.
 * Vercel preview (VERCEL_ENV=preview) keeps the fallback because NODE_ENV is
 * production there too. This function does not run at import time.
 */
export function appUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview") {
    throw new Error(
      "[fweta] NEXT_PUBLIC_APP_URL is not set. Set it to the public app origin, for example https://app.fweta.com.",
    );
  }
  return "http://localhost:3000";
}
