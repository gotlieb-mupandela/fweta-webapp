import type { Profile } from "@/lib/db/types";
import type { EmailScope } from "@/lib/email/preferences";
import type { UserRole } from "@/types/enums";

export type WelcomeVariant = "brand" | "influencer" | "clipper" | "creator";

export function allowsEmail(
  profile: Pick<Profile, "suspended" | "notifyEmail" | "notifyBookings" | "notifyWithdrawals">,
  scope: EmailScope,
): boolean {
  if (profile.suspended) return false;
  if (!profile.notifyEmail) return false;
  if (scope === "bookings") return profile.notifyBookings;
  if (scope === "withdrawals") return profile.notifyWithdrawals;
  return true;
}

export function isCreator(profile: Pick<Profile, "roles">): boolean {
  return profile.roles.includes("influencer") || profile.roles.includes("clipper");
}

export function welcomeVariant(roles: UserRole[], primaryRole: UserRole): WelcomeVariant {
  const brand = roles.includes("brand");
  const influencer = roles.includes("influencer");
  const clipper = roles.includes("clipper");
  if (brand && !influencer && !clipper) return "brand";
  if (influencer && clipper && !brand) return "creator";
  if (brand && (influencer || clipper)) {
    if (primaryRole === "brand") return "brand";
    if (influencer && clipper) return "creator";
    return influencer ? "influencer" : "clipper";
  }
  if (influencer) return "influencer";
  if (clipper) return "clipper";
  return "brand";
}

/** First name when we actually know one. Email local-parts stay unnamed. */
export function greetingName(profile: Pick<Profile, "displayName" | "email" | "firstName">): string | null {
  const first = profile.firstName?.trim();
  if (first) return first;
  const display = profile.displayName.trim();
  const local = profile.email.split("@")[0]?.trim() ?? "";
  if (!display || display.toLowerCase() === local.toLowerCase()) return null;
  return display.split(/\s+/)[0] || null;
}

export function publicName(profile: Pick<Profile, "displayName" | "email" | "companyName"> | undefined): string {
  const company = profile?.companyName?.trim();
  if (company) return company;
  const display = profile?.displayName?.trim();
  const local = profile?.email.split("@")[0]?.trim().toLowerCase();
  if (display && display.toLowerCase() !== local) return display;
  return "A fweta member";
}
