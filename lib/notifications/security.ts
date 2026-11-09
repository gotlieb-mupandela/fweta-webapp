import { headers } from "next/headers";

import type { Profile } from "@/lib/db/types";
import { appUrl } from "@/lib/email/config";
import { renderEmail, type EmailDocument } from "@/lib/email/layout";
import { preferencesUrl, signPrefsToken, type PreferenceLinks } from "@/lib/email/preferences";
import { sendEmails } from "@/lib/email/send";
import { loginAlertEmail, passwordChangedEmail, type SignInContext } from "@/lib/email/templates";
import { runAfterResponse } from "@/lib/notifications/schedule";
import { pickClientIp } from "@/lib/security/client-ip";

/**
 * Account-security emails (sign-in alerts, password changed). These are
 * transactional: they ignore email preferences and carry no unsubscribe link,
 * and they never create an inbox notification or a dedupe record, because every
 * sign-in is its own event.
 */

const BROWSERS: Array<[RegExp, string]> = [
  [/Edg\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const SYSTEMS: Array<[RegExp, string]> = [
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

/** "Chrome on Windows", or "Unknown device" when the user agent says nothing useful. */
export function describeDevice(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1];
  const system = SYSTEMS.find(([re]) => re.test(ua))?.[1];
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? "Unknown device";
}

/** Who, where and when, read from the current request. Safe outside a request. */
export async function currentSignInContext(): Promise<SignInContext> {
  const at = new Date().toISOString();
  try {
    const list = await headers();
    return { at, ip: pickClientIp(list), device: describeDevice(list.get("user-agent")) };
  } catch {
    return { at, ip: "local", device: "Unknown device" };
  }
}

async function securityLinks(profile: Profile): Promise<PreferenceLinks> {
  const token = await signPrefsToken(profile.id);
  return { preferencesHref: preferencesUrl(token), unsubscribeHref: "" };
}

function forgotPasswordHref(): string {
  return `${appUrl()}/forgot-password`;
}

async function send(profile: Profile, build: (links: PreferenceLinks) => EmailDocument) {
  if (!profile || profile.suspended) return;
  const view = renderEmail(build(await securityLinks(profile)));
  await sendEmails([{ to: profile.email, subject: view.subject, html: view.html, text: view.text }]);
}

/** Queue a "new sign-in" alert. Never blocks or fails the sign-in itself. */
export function queueLoginAlert(profile: Profile, context: SignInContext) {
  runAfterResponse(() =>
    send(profile, (links) =>
      loginAlertEmail({ profile, context, resetHref: forgotPasswordHref(), links }),
    ),
  );
}

/** Queue a "your password was changed" confirmation. */
export function queuePasswordChanged(profile: Profile, context: SignInContext, via: "reset" | "settings") {
  runAfterResponse(() =>
    send(profile, (links) =>
      passwordChangedEmail({ profile, context, via, resetHref: forgotPasswordHref(), links }),
    ),
  );
}
