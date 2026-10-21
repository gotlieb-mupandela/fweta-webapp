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

export function appUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  return raw.replace(/\/$/, "");
}
