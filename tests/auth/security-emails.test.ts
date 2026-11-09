import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { renderEmail } from "@/lib/email/layout";
import { samplePreferenceLinks } from "@/lib/email/preferences";
import { loginAlertEmail, passwordChangedEmail, welcomeEmail } from "@/lib/email/templates";
import { describeDevice } from "@/lib/notifications/security";
import { signupSchema } from "@/lib/validations/auth";

const profile = { displayName: "Amara Nangolo", email: "amara@example.com", firstName: "Amara" };
const context = { at: "2026-11-09T08:30:00.000Z", ip: "102.64.10.25", device: "Chrome on Windows" };

test("login alert names the device, IP and time, and links to reset", () => {
  const rendered = renderEmail(
    loginAlertEmail({
      profile,
      context,
      resetHref: "https://app.fweta.com/forgot-password",
      links: samplePreferenceLinks(),
    }),
  );
  assert.equal(rendered.subject, "New sign-in to your fweta account");
  assert.match(rendered.text, /Chrome on Windows/);
  assert.match(rendered.text, /102\.64\.10\.25/);
  assert.match(rendered.text, /9 Nov 2026/);
  assert.match(rendered.text, /forgot-password/);
  assert.equal(rendered.text.includes("amara%40"), false, "email must not be placed in a URL");
  assert.equal(/unsubscribe/i.test(rendered.text), false, "security alerts carry no unsubscribe link");
  assert.equal(rendered.html.includes("—"), false);
});

test("password changed email reflects how it was changed", () => {
  const viaReset = renderEmail(
    passwordChangedEmail({ profile, context, via: "reset", resetHref: "/forgot-password", links: samplePreferenceLinks() }),
  );
  const viaSettings = renderEmail(
    passwordChangedEmail({ profile, context, via: "settings", resetHref: "/forgot-password", links: samplePreferenceLinks() }),
  );
  assert.equal(viaReset.subject, "Your fweta password was changed");
  assert.match(viaReset.text, /reset using a link/);
  assert.match(viaSettings.text, /changed from account settings/);
});

test("welcome email confirms the account was created", () => {
  const rendered = renderEmail(
    welcomeEmail({
      profile: { ...profile, roles: ["brand"], primaryRole: "brand" },
      links: samplePreferenceLinks(),
    }),
  );
  assert.equal(rendered.subject, "Your fweta account is created");
  assert.match(rendered.html, /amara@example\.com/);
});

test("describeDevice turns user agents into short labels", () => {
  assert.equal(
    describeDevice(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    ),
    "Chrome on Windows",
  );
  assert.equal(
    describeDevice(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    ),
    "Safari on iOS",
  );
  assert.equal(
    describeDevice("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0"),
    "Edge on Windows",
  );
  assert.equal(describeDevice(""), "Unknown device");
  assert.equal(describeDevice(null), "Unknown device");
});

test("sign-up rejects passwords bcrypt would truncate", () => {
  const long = signupSchema.safeParse({ email: "a@b.co", password: "x".repeat(73), roles: ["brand"] });
  assert.equal(long.success, false);
});

test("login action sends an alert only after a successful sign-in", () => {
  const source = readFileSync("app/actions/auth.ts", "utf8");
  const fn = source.slice(source.indexOf("export async function loginAction"), source.indexOf("export async function signupAction"));
  const failReturn = fn.indexOf("if (!result.ok) return result");
  const alert = fn.indexOf("queueLoginAlert(");
  assert.ok(failReturn > 0 && alert > failReturn);
});

test("reset and settings password changes send a confirmation", () => {
  assert.match(readFileSync("app/actions/password-reset.ts", "utf8"), /queuePasswordChanged\(.*"reset"\)/);
  assert.match(readFileSync("app/actions/settings.ts", "utf8"), /queuePasswordChanged\(.*"settings"\)/);
});

test("login checks the password before revealing suspension", () => {
  const source = readFileSync("lib/auth/session.ts", "utf8");
  const fn = source.slice(source.indexOf("export async function login("), source.indexOf("export async function logout"));
  assert.ok(fn.indexOf("bcrypt.compare") < fn.indexOf("Account suspended"));
});
