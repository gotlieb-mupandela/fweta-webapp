"use server";

import { randomUUID } from "crypto";

import bcrypt from "bcryptjs";

import { getProfileById } from "@/lib/auth/session";
import {
  RESET_REQUEST_MESSAGE,
  passwordResetExpiry,
  passwordResetUrl,
  readPasswordResetToken,
  resetGrantStatus,
  signPasswordResetToken,
} from "@/lib/auth/password-reset";
import { nowIso, readStore, updateStore } from "@/lib/db/store";
import { renderEmail } from "@/lib/email/layout";
import {
  preferencesUrl,
  signPrefsToken,
  unsubscribeHeaders,
  unsubscribePageUrl,
} from "@/lib/email/preferences";
import { sendEmails } from "@/lib/email/send";
import { passwordResetEmail } from "@/lib/email/templates";
import { clientIp } from "@/lib/security/client-ip";
import { sharedRateLimit } from "@/lib/security/shared-rate-limit";
import { forgotPasswordSchema, resetPasswordSchema } from "@/lib/validations/auth";

export async function requestPasswordResetAction(raw: unknown) {
  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Enter a valid email address." };
  const limited = await sharedRateLimit(`password-reset:${await clientIp()}`, 5, 15 * 60 * 1000);
  if (!limited.ok) {
    return { ok: false as const, error: `Too many attempts. Try again in ${limited.retryAfterSec}s.` };
  }

  const email = parsed.data.email.trim().toLowerCase();
  try {
    const store = await readStore();
    const profile = store.profiles.find((item) => item.email.trim().toLowerCase() === email);
    if (profile && !profile.suspended) {
      const jti = randomUUID();
      const token = await signPasswordResetToken(profile.id, jti);
      const expiresAt = passwordResetExpiry();
      let saved = false;
      await updateStore((s) => {
        saved = false;
        const row = s.profiles.find((item) => item.id === profile.id);
        if (!row || row.suspended) return;
        row.passwordReset = { jti, expiresAt };
        row.updatedAt = nowIso();
        saved = true;
      });
      if (!saved) return { ok: true as const, message: RESET_REQUEST_MESSAGE };
      const prefs = await signPrefsToken(profile.id);
      const links = {
        preferencesHref: preferencesUrl(prefs),
        unsubscribeHref: unsubscribePageUrl(prefs, "email"),
      };
      const rendered = renderEmail(passwordResetEmail({ resetUrl: passwordResetUrl(token), links }));
      // Delivery uses lib/email/send.ts (Resend). If RESEND_API_KEY or
      // RESEND_FROM is unset, that mailer skips the send and logs one warning.
      await sendEmails([
        {
          to: profile.email,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          headers: unsubscribeHeaders(prefs, "email"),
        },
      ]);
    }
  } catch (err) {
    console.warn("[fweta] password reset email failed:", err instanceof Error ? err.message : "error");
  }

  return { ok: true as const, message: RESET_REQUEST_MESSAGE };
}

export async function resetPasswordAction(raw: unknown) {
  const parsed = resetPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Check the password fields." };
  }
  const limited = await sharedRateLimit(`password-reset-use:${await clientIp()}`, 8, 15 * 60 * 1000);
  if (!limited.ok) {
    return { ok: false as const, error: `Too many attempts. Try again in ${limited.retryAfterSec}s.` };
  }

  const token = await readPasswordResetToken(parsed.data.token);
  if (!token) {
    return { ok: false as const, error: "This reset link is invalid or has expired. Request a new one." };
  }
  const profile = await getProfileById(token.userId);
  if (!profile || profile.suspended) {
    return { ok: false as const, error: "This reset link is invalid or has expired. Request a new one." };
  }
  if (resetGrantStatus(profile.passwordReset, token.jti, Date.now()) !== "ok") {
    return { ok: false as const, error: "This reset link is invalid or has expired. Request a new one." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  let applied = false;
  try {
    await updateStore((s) => {
      applied = false;
      const row = s.profiles.find((item) => item.id === token.userId);
      if (!row || row.suspended) return;
      if (resetGrantStatus(row.passwordReset, token.jti, Date.now()) !== "ok") return;
      row.passwordHash = passwordHash;
      row.credentialVersion = (row.credentialVersion ?? 0) + 1;
      row.passwordReset = null;
      row.updatedAt = nowIso();
      applied = true;
    });
  } catch {
    return { ok: false as const, error: "Could not reset the password. Request a new link and try again." };
  }
  if (!applied) {
    return { ok: false as const, error: "This reset link is invalid or has expired. Request a new one." };
  }
  return { ok: true as const };
}
