import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  RESET_REQUEST_MESSAGE,
  passwordResetUrl,
  readPasswordResetToken,
  resetGrantStatus,
  signPasswordResetToken,
} from "@/lib/auth/password-reset";
import { passwordChangeSchema, resetPasswordSchema } from "@/lib/validations/auth";
import { renderEmail } from "@/lib/email/layout";
import { passwordResetEmail } from "@/lib/email/templates";
import { samplePreferenceLinks } from "@/lib/email/preferences";

test("password change rejects the current password", () => {
  const same = passwordChangeSchema.safeParse({
    currentPassword: "correct-horse",
    newPassword: "correct-horse",
    confirmPassword: "correct-horse",
  });
  assert.equal(same.success, false);
  if (!same.success) {
    assert.equal(same.error.issues[0]?.message, "New password must be different from the current password.");
  }

  const changed = passwordChangeSchema.safeParse({
    currentPassword: "correct-horse",
    newPassword: "new-horse-battery",
    confirmPassword: "new-horse-battery",
  });
  assert.equal(changed.success, true);
});

test("password change rejects a mismatch", () => {
  const parsed = passwordChangeSchema.safeParse({
    currentPassword: "correct-horse",
    newPassword: "new-horse-battery",
    confirmPassword: "different-horse",
  });
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.equal(parsed.error.issues[0]?.message, "Passwords must match");
  }
});

test("reset request copy does not reveal whether an email exists", () => {
  assert.equal(RESET_REQUEST_MESSAGE.toLowerCase().includes("not found"), false);
  assert.equal(RESET_REQUEST_MESSAGE.includes("@"), false);
  assert.match(RESET_REQUEST_MESSAGE, /If an account exists/);
});

test("password reset token is signed, expiring, and purpose locked", async () => {
  const token = await signPasswordResetToken("user-1", "jti-1");
  const read = await readPasswordResetToken(token);
  assert.deepEqual(read, { userId: "user-1", jti: "jti-1" });
  assert.equal(await readPasswordResetToken(`${token}x`), null);
  assert.equal(await readPasswordResetToken(""), null);
  assert.match(passwordResetUrl(token), /\/reset-password\?token=/);
});

test("a reset grant is single use and expires", () => {
  const future = "2099-01-01T00:00:00.000Z";
  const past = "2000-01-01T00:00:00.000Z";
  const now = Date.parse("2026-10-28T00:00:00.000Z");
  assert.equal(resetGrantStatus({ jti: "a", expiresAt: future }, "a", now), "ok");
  assert.equal(resetGrantStatus({ jti: "a", expiresAt: future }, "b", now), "invalid");
  assert.equal(resetGrantStatus({ jti: "a", expiresAt: past }, "a", now), "invalid");
  assert.equal(resetGrantStatus(null, "a", now), "invalid");
});

test("reset password schema requires a matching password", () => {
  const bad = resetPasswordSchema.safeParse({
    token: "x".repeat(40),
    password: "new-horse-battery",
    confirmPassword: "other-horse",
  });
  assert.equal(bad.success, false);
});

test("reset email goes through the shared mail layout", () => {
  const doc = passwordResetEmail({
    resetUrl: "https://app.fweta.com/reset-password?token=preview",
    links: samplePreferenceLinks(),
  });
  const rendered = renderEmail(doc);
  assert.equal(rendered.subject, "Reset your fweta password");
  assert.match(rendered.text, /reset-password\?token=preview/);
  assert.equal(rendered.text.includes("—"), false);
  assert.equal(rendered.html.includes("—"), false);
});

test("support reply keeps the form element before await", () => {
  const source = readFileSync("components/forms/support-forms.tsx", "utf8");
  const reply = source.slice(source.indexOf("export function TicketReplyForm"));
  const awaitAt = reply.indexOf("await replySupportTicketAction");
  const formAt = reply.lastIndexOf("const form = event.currentTarget", awaitAt);
  assert.ok(formAt >= 0 && formAt < awaitAt);
  assert.equal(reply.includes("event.currentTarget.reset"), false);
});

test("password change action does not throw a dashboard error", () => {
  const source = readFileSync("app/actions/settings.ts", "utf8");
  const body = source.slice(source.indexOf("export async function changePasswordAction"));
  const next = body.indexOf("export async function", 20);
  const fn = next === -1 ? body : body.slice(0, next);
  assert.match(fn, /New password must be different|passwordChangeSchema/);
  assert.match(fn, /catch/);
  assert.equal(fn.includes("requireSession"), false);
});
